// 契約測試：對話狀態追蹤嘅覆蓋訊號規則（server/lib/conversation-state.ts）。
// 純函數驗證，唔需要 DB —— computeNewlyCovered 收嘅係已經篩好嘅角色訊息，
// computeNextPoint 收嘅係已經算好嘅 covered 集合。
//
// 唔喺呢度測嘅嘢（要 DB，由端到端測試把關）：
//   - role 篩選（只計 assistant/bot，學生訊息唔算）喺 trackConversationState 做
//   - ON CONFLICT upsert 同新欄位（skipped_point_ids／turns_on_next_point）讀寫
import assert from "node:assert/strict";
import test from "node:test";
import {
  computeNewlyCovered,
  computeNextPoint,
  sameTopic,
  seedCoverageOnTopicSwitch,
  stateForTopic,
} from "../lib/conversation-state.ts";
import type { KnowledgePoint } from "../../utils/chat-prompt.ts";
import {
  enqueueConversationTrack,
  waitForPendingTrack,
} from "../lib/conversation-track-queue.ts";

const point = (id: string, keywords: string[]): KnowledgePoint => ({
  id,
  tier: "basic_fact",
  title: id,
  content: "測試內容",
  keywords,
});

test("單一 keyword 喺一輪出現一次：唔算覆蓋", () => {
  const covered = computeNewlyCovered(
    [point("kp_001", ["榫卯"])],
    ["榫卯係中國木構嘅精髓。"],
    new Set()
  );
  assert.equal(covered.has("kp_001"), false, "單弱訊號唔應該鎖死知識點");
});

test("兩個唔同 keyword 喺同一輪出現：算覆蓋", () => {
  const covered = computeNewlyCovered(
    [point("kp_001", ["榫卯", "斗拱"])],
    ["榫卯同斗拱係一對拍檔。"],
    new Set()
  );
  assert.equal(covered.has("kp_001"), true);
});

test("同一個 keyword 跨兩輪出現：算覆蓋", () => {
  const covered = computeNewlyCovered(
    [point("kp_001", ["榫卯"])],
    ["你聽過榫卯未？", "榫卯就係唔用釘都咬得實。"],
    new Set()
  );
  assert.equal(covered.has("kp_001"), true, "同一個字跨輪都當兩個獨立訊號");
});

test("同一個 keyword 喺同一輪出現兩次：只算一個訊號", () => {
  const covered = computeNewlyCovered(
    [point("kp_001", ["榫卯"])],
    ["榫卯、榫卯，講咗兩次都仲係同一個榫卯。"],
    new Set()
  );
  assert.equal(covered.has("kp_001"), false, "同輪重複唔可以自己湊夠數");
});

test("單字 keyword 會被直接跳過", () => {
  const covered = computeNewlyCovered(
    [point("kp_002", ["鋸", "刨"])],
    ["鋸同刨都係魯班嘅工具。", "再用刨刨平佢。"],
    new Set()
  );
  assert.equal(covered.has("kp_002"), false, "單字 keyword 唔計訊號");
});

test("單字 keyword 唔會幫其他 keyword 湊數", () => {
  const covered = computeNewlyCovered(
    [point("kp_002", ["木", "榫卯"])],
    ["木係材料。", "木要刨平先。"],
    new Set()
  );
  assert.equal(
    covered.has("kp_002"),
    false,
    "「木」跨兩輪都唔算，剩返「榫卯」只有 1 個訊號"
  );
});

test("已覆蓋嘅知識點唔會倒退", () => {
  const covered = computeNewlyCovered(
    [point("kp_001", ["榫卯"])],
    ["今集講第二樣嘢。"],
    new Set(["kp_001"])
  );
  assert.equal(covered.has("kp_001"), true, "covered 係單調嘅");
});

test("冇 keyword 嘅知識點永遠唔會被標記", () => {
  const covered = computeNewlyCovered(
    [point("kp_009", [])],
    ["講咗好多嘢但冇關鍵詞。", "再講多一輪。"],
    new Set()
  );
  assert.equal(covered.has("kp_009"), false);
});

// ── next_point 揀選同「推唔動就跳過」保險 ──────────────────────────────

/** 模擬連續幾輪嘅狀態演進：輸入每輪角色回覆，輸出每輪之後嘅 next_point 狀態 */
const runTurns = (points: KnowledgePoint[], replies: string[]) => {
  let covered = new Set<string>();
  let skipped = new Set<string>();
  let prev: { nextPointId: string | null; turnsOnNextPoint: number } | null =
    null;
  return replies.map((_, index) => {
    covered = computeNewlyCovered(points, replies.slice(0, index + 1), covered);
    const result = computeNextPoint(points, covered, skipped, prev);
    skipped = new Set(result.skippedIds);
    prev = {
      nextPointId: result.nextPointId,
      turnsOnNextPoint: result.turnsOnNextPoint,
    };
    return { ...result, covered: new Set(covered) };
  });
};

const trapPoints = (): KnowledgePoint[] => [
  point("kp_001", ["榫卯", "斗拱"]),
  point("kp_002", ["鋸", "刨", "墨斗", "傳說"]), // 單字被跳過，淨低兩個又冇出現
  point("kp_003", ["南蓮園池", "志蓮淨苑"]),
];

test("第一輪：next_point 指第一個未覆蓋嘅點，計數由 0 起", () => {
  const [state] = runTurns(trapPoints(), ["我係魯班，木工出身。"]);
  assert.equal(state.nextPointId, "kp_001");
  assert.equal(state.turnsOnNextPoint, 0);
});

test("目標換咗（前一點教到）就歸零重計", () => {
  const states = runTurns(trapPoints(), [
    "我係魯班。",
    "榫卯同斗拱係一對拍檔。",
  ]);
  assert.equal(states[1].covered.has("kp_001"), true);
  assert.equal(states[1].nextPointId, "kp_002");
  assert.equal(states[1].turnsOnNextPoint, 0, "啱啱接手嘅目標唔算推唔動");
});

test("後面嘅點被教到唔會令目標計數歸零", () => {
  const states = runTurns(trapPoints(), [
    "我係魯班。",
    "榫卯同斗拱係一對拍檔。",
    "南蓮園池同志蓮淨苑都係仿唐建築。", // kp_003 搶先被教到
    "繼續講多啲。",
  ]);
  assert.equal(states[2].covered.has("kp_003"), true);
  assert.equal(
    states[2].nextPointId,
    "kp_002",
    "kp_002 仍然係第一個未覆蓋"
  );
  assert.equal(
    states[2].turnsOnNextPoint,
    1,
    "目標本身冇換過，計數照加 —— 呢個就係「卡死」嘅定義"
  );
  assert.equal(states[3].turnsOnNextPoint, 2);
});

test("連續 4 輪推唔動：跳過該點，改推下一個", () => {
  const states = runTurns(trapPoints(), [
    "我係魯班。",
    "榫卯同斗拱係一對拍檔。",
    "傳說魯班發明咗好多工具。", // kp_002 只有「傳說」一個訊號
    "你試下諗吓。",
    "再諗多一層。",
    "唔緊要，慢慢嚟。",
  ]);
  assert.deepEqual(states[4].skippedIds, [], "第 3 輪仲未夠數");
  assert.equal(states[4].nextPointId, "kp_002");
  assert.deepEqual(
    states[5].skippedIds,
    ["kp_002"],
    "第 4 輪冇前進就跳過"
  );
  assert.equal(states[5].nextPointId, "kp_003", "改推下一個未覆蓋嘅點");
  assert.equal(states[5].turnsOnNextPoint, 0, "新目標重新起錶");
});

test("跳過唔會連環跳：一次只跳一個", () => {
  const states = runTurns(trapPoints(), [
    "我係魯班。",
    "榫卯同斗拱係一對拍檔。",
    "傳說魯班發明咗好多工具。",
    "你試下諗吓。",
    "再諗多一層。",
    "唔緊要，慢慢嚟。", // 跳過 kp_002 → kp_003
    "講多一輪。",
  ]);
  assert.deepEqual(states[6].skippedIds, ["kp_002"]);
  assert.equal(states[6].nextPointId, "kp_003");
  assert.equal(states[6].turnsOnNextPoint, 1);
});

test("被跳過嘅點後來教到：由跳過名單剔走", () => {
  const states = runTurns(trapPoints(), [
    "我係魯班。",
    "榫卯同斗拱係一對拍檔。",
    "傳說魯班發明咗好多工具。",
    "你試下諗吓。",
    "再諗多一層。",
    "唔緊要，慢慢嚟。", // 跳過 kp_002
    "魯班用墨斗畫直線。",
    "墨斗係木工嘅法寶。", // kp_002 攞到「墨斗」×2 輪 → 已覆蓋
  ]);
  assert.equal(states[7].covered.has("kp_002"), true);
  assert.deepEqual(
    states[7].skippedIds,
    [],
    "已經教到就唔使再留喺跳過名單"
  );
});

test("對話一輪都未覆蓋過：唔會跳（開場熱身／離題保護）", () => {
  const states = runTurns(trapPoints(), [
    "我係魯班，你叫咩名？",
    "今日天氣唔錯。",
    "你鍾意食咩？",
    "講多啲啦。",
    "再傾多陣。",
    "好喇。",
  ]);
  assert.deepEqual(states[5].skippedIds, [], "冇任何覆蓋之前唔應該跳走知識點");
  assert.equal(states[5].nextPointId, "kp_001");
  assert.equal(states[5].turnsOnNextPoint, 5, "計數照加，只係唔觸發跳過");
});

test("全部覆蓋：next_point 變 null", () => {
  const states = runTurns(trapPoints(), [
    "榫卯同斗拱係一對拍檔。",
    "南蓮園池同志蓮淨苑都係仿唐建築。",
    "傳說魯班發明咗墨斗。",
  ]);
  assert.equal(states[2].nextPointId, null);
});

// ── next_point 優先 basic_fact（課程結構簡化） ─────────────────────────

const deepPoint = (id: string, keywords: string[]): KnowledgePoint => ({
  id,
  tier: "deep_understanding",
  title: id,
  content: "測試內容",
  keywords,
});

test("next_point 優先推 basic_fact：deep 排前面都照樣先教基礎", () => {
  const points = [
    deepPoint("kp_001", ["因果", "影響"]),
    point("kp_002", ["榫卯", "斗拱"]),
    deepPoint("kp_003", ["價值", "遷移"]),
  ];
  const result = computeNextPoint(points, new Set(), new Set(), null);
  assert.equal(result.nextPointId, "kp_002", "跳過排頭嘅 deep，指返基礎點");
});

test("全部 basic_fact 覆蓋後先推 deep_understanding", () => {
  const points = [
    point("kp_001", ["榫卯", "斗拱"]),
    deepPoint("kp_002", ["因果", "影響"]),
  ];
  const result = computeNextPoint(points, new Set(["kp_001"]), new Set(), null);
  assert.equal(result.nextPointId, "kp_002", "基礎做完先輪到 deep");
});

// ── 切話題時嘅覆蓋 seed（覆蓋集合一定綁住自己嘅話題） ──────────────────

test("同一話題：seed 保留對話 row 嘅 covered，topicChanged = false", () => {
  const result = seedCoverageOnTopicSwitch({
    previous: { topicId: "topic_a", value: ["kp_1", "kp_2"] },
    topicId: "topic_a",
    accumulated: { topicId: "topic_a", value: ["kp_1"] },
  });
  assert.deepEqual([...result.coverage.value].sort(), ["kp_1", "kp_2"]);
  assert.equal(result.coverage.topicId, "topic_a");
  assert.equal(result.topicChanged, false);
});

test("轉話題：丟棄舊話題 covered，由新話題累積進度重新起步", () => {
  // 舊話題嘅 kp_1 同新話題嘅 kp_1 可以係兩回事，所以一個都唔可以帶過去。
  const result = seedCoverageOnTopicSwitch({
    previous: { topicId: "topic_a", value: ["kp_1", "kp_2"] },
    topicId: "topic_b",
    accumulated: { topicId: "topic_b", value: ["kp_3"] },
  });
  assert.deepEqual([...result.coverage.value], ["kp_3"], "舊話題 id 一個都唔可以帶過去");
  assert.equal(result.coverage.topicId, "topic_b");
  assert.equal(result.topicChanged, true);
});

test("新對話（冇 conversation 狀態）：seed 用跨對話累積，topicChanged = false", () => {
  const result = seedCoverageOnTopicSwitch({
    previous: null,
    topicId: "topic_a",
    accumulated: { topicId: "topic_a", value: ["kp_1", "kp_2"] },
  });
  assert.deepEqual([...result.coverage.value].sort(), ["kp_1", "kp_2"]);
  assert.equal(result.coverage.topicId, "topic_a");
  assert.equal(result.topicChanged, false);
});

test("'' 對 '' 屬同一話題（舊數據冇指定話題）", () => {
  const result = seedCoverageOnTopicSwitch({
    previous: { topicId: "", value: ["kp_1"] },
    topicId: "",
    accumulated: { topicId: "", value: [] },
  });
  assert.deepEqual([...result.coverage.value], ["kp_1"]);
  assert.equal(result.topicChanged, false, "冇指定話題嘅舊對話唔應該當成切咗話題");
});

test("accumulated 帶錯話題：大聲 warn，當冇累積（唔可以靜靜雞當已掌握）", () => {
  // 兩個輸入都係 TopicScoped，型別上冇得傳錯話題；呢個 test 守住硬 cast
  // 或者將來改壞嘅情況 —— 出事要出聲，而且要 fail-safe（由零重新教），
  // 唔係將第二個話題嘅 id 當成呢個話題已掌握寫入 DB。
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    const result = seedCoverageOnTopicSwitch({
      previous: null,
      topicId: "topic_b",
      accumulated: { topicId: "topic_a", value: ["kp_1", "kp_2"] },
    });
    assert.deepEqual([...result.coverage.value], [], "第二個話題嘅 id 一個都唔可以入嚟");
    assert.equal(result.coverage.topicId, "topic_b", "coverage 一定屬於而家呢個話題");
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1, "要出聲，唔可以靜靜雞");
  assert.match(warnings[0], /topic mismatch/);
});

test("轉話題：next_point 沿用 context 會被清空（舊話題 id 唔壓制新話題）", () => {
  const switched = seedCoverageOnTopicSwitch({
    previous: { topicId: "topic_a", value: ["kp_1"] },
    topicId: "topic_b",
    accumulated: { topicId: "topic_b", value: [] },
  });
  // trackConversationState 喺 topicChanged 時傳 null context 入 computeNextPoint，
  // 即係舊話題嘅 next_point / 跳過名單唔會帶落新話題。
  const context = switched.topicChanged ? null : { nextPointId: "kp_1", turnsOnNextPoint: 3 };
  assert.equal(context, null);
  const points = [point("kp_2", ["榫卯", "斗拱"])];
  const result = computeNextPoint(points, switched.coverage.value, new Set(), context);
  assert.equal(result.nextPointId, "kp_2", "新話題由自己第一個未覆蓋點重新起");
  assert.deepEqual(result.skippedIds, []);
});

test("sameTopic：'' 同真 topic id 一定唔相等（讀寫兩側同一條規則）", () => {
  assert.equal(sameTopic("topic_a", "topic_a"), true);
  assert.equal(sameTopic("topic_a", "topic_b"), false);
  // 舊數據／主知識庫嘅 '' 唔等於任何真話題；undefined / null 一律當 ''。
  assert.equal(sameTopic("", "topic_a"), false);
  assert.equal(sameTopic("topic_a", ""), false);
  assert.equal(sameTopic("", ""), true);
  assert.equal(sameTopic(null, ""), true);
  assert.equal(sameTopic(undefined, "topic_a"), false);
});

test("stateForTopic：唔同話題嘅 state row 一律當冇 state", () => {
  const row = {
    topic_id: "topic_a",
    covered_point_ids: ["kp_1"],
    next_point_id: "kp_2",
  };
  assert.equal(stateForTopic(row, "topic_a")?.next_point_id, "kp_2", "同一話題照用");
  // 呢個就係 bug 嘅閘：切話題之後如果仲讀到舊話題嘅 row，
  // Next_Point 會注入上一個話題嘅知識點，Bot 照傾舊話題。
  assert.equal(stateForTopic(row, "topic_b"), null, "轉咗話題 = 呢段對話喺新話題未有狀態");
  assert.equal(stateForTopic(row, ""), null, "真話題嘅 row 唔可以當成主知識庫嘅");
  assert.equal(stateForTopic(null, "topic_a"), null, "本身冇 state 就係冇");
  // 舊數據（''）第一次帶真話題入嚟，要當成轉咗話題，由新話題重新起步。
  assert.equal(stateForTopic({ ...row, topic_id: "" }, "topic_a"), null);
});

test("讀寫兩側對「轉咗話題」嘅判斷一致（同一條規則，唔可以各自比）", () => {
  const cases: Array<[string, string]> = [
    ["topic_a", "topic_a"],
    ["topic_a", "topic_b"],
    ["", "topic_a"],
    ["topic_a", ""],
  ];
  for (const [stateTopicId, topicId] of cases) {
    const readSideSaysChanged = stateForTopic({ topic_id: stateTopicId }, topicId) === null;
    const writeSideSaysChanged = seedCoverageOnTopicSwitch({
      previous: { topicId: stateTopicId, value: ["kp_1"] },
      topicId,
      accumulated: { topicId, value: [] },
    }).topicChanged;
    assert.equal(
      readSideSaysChanged,
      writeSideSaysChanged,
      `"${stateTopicId}" vs "${topicId}"：讀側同寫側判斷要一樣`
    );
  }
});

// ── 對話狀態寫入隊列（server/lib/conversation-track-queue.ts）───────────────
// 呢層係「寫完之後讀」嘅保證：trackConversationState 照舊 fire-and-forget，
// 但下一個 ask 讀 state 之前會等埋條鏈。

test("隊列：同一對話嘅寫入 FIFO，唔會交錯", async () => {
  const log: string[] = [];
  const work = (name: string, delay: number) => async () => {
    log.push(`${name}-start`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    log.push(`${name}-end`);
  };
  const a = enqueueConversationTrack("fifo_conv", work("a", 30));
  const b = enqueueConversationTrack("fifo_conv", work("b", 1));
  await Promise.all([a, b]);
  assert.deepEqual(log, ["a-start", "a-end", "b-start", "b-end"], "B 一定要等 A 完先開始");
});

test("waitForPendingTrack 等得到在途寫入真係做完", async () => {
  let done = false;
  const track = enqueueConversationTrack("wait_conv", async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    done = true;
  });
  await waitForPendingTrack("wait_conv");
  // 如果 waitForPendingTrack 一叫就 resolve，呢度會係 false。
  assert.equal(done, true, "等到嘅時候 work 一定要做完");
  await track;
});

test("waitForPendingTrack：冇在途寫入就即刻 resolve，唔會等到 timeout", async () => {
  const started = Date.now();
  await waitForPendingTrack("never_used_conv", 5_000);
  assert.ok(Date.now() - started < 1_000, "冇 pending 應該即刻返，唔使等 5 秒");
});

test("隊列：A 完成時唔會清走仲喺隊列尾嘅 B", async () => {
  let bDone = false;
  const a = enqueueConversationTrack("cleanup_conv", async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const b = enqueueConversationTrack("cleanup_conv", async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    bDone = true;
  });
  await a; // A 完成嗰刻 B 已經入咗隊 —— A 嘅清理唔可以刪走 B 條 entry
  await waitForPendingTrack("cleanup_conv");
  assert.equal(bDone, true, "B 條鏈唔可以被 A 嘅清理斬斷");
  await b;
});

test("隊列：work reject 都唔會斷鏈", async () => {
  let bDone = false;
  const a = enqueueConversationTrack("reject_conv", async () => {
    throw new Error("boom");
  });
  const b = enqueueConversationTrack("reject_conv", async () => {
    bDone = true;
  });
  await a; // 回傳嘅 promise 一定唔會 reject（console.warn 會印一行，預期之內）
  await b;
  assert.equal(bDone, true, "上一件工作爆咗，下一件照跑");
});

test("隊列：唔同對話各自一條鏈，互唔阻塞", async () => {
  const log: string[] = [];
  const slow = enqueueConversationTrack("conv_slow", async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    log.push("slow");
  });
  const fast = enqueueConversationTrack("conv_fast", async () => {
    log.push("fast");
  });
  await fast;
  assert.deepEqual(log, ["fast"], "另一個對話嘅慢寫入唔應該阻住呢個");
  await slow;
  assert.deepEqual(log, ["fast", "slow"]);
});
