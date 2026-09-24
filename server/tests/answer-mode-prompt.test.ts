// 「答題策略」落地回歸測試（純函數，唔使 DB／API key）。
//
// 背景：老師喺工作坊揀嘅【答題策略】以前只影響覆蓋追蹤（coverage strictness），
// 對送俾模型嘅 prompt 完全冇作用——揀「不直接給答案」同「直接給答案」出嚟嘅字一模一樣，
// 所以學生見到 Bot 一嘢倒答案。呢套測試守住嗰條接線，同埋 Rule 7 唔可以行返轉頭。
import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_STYLE_RULES,
  buildAnswerModeDirective,
  buildCannedGuidedAnnouncement,
  buildChatSystemPrompt,
  buildGuidedAnnouncementPrompt,
  needsGuidedAnnouncement,
  parseAnswerMode,
} from "../../utils/chat-prompt.ts";

const knowledgeBase = (mode: string) => `【人物背景設定】
我係測試角色。
【人物知識庫摘要】
測試摘要。
【角色對話策略】
【性格特質】耐心
【說話風格】幽默
【答題策略】${mode}`;

const promptWith = (mode: string) =>
  buildChatSystemPrompt({ roleName: "測試角色", knowledgeBase: knowledgeBase(mode) });

/* ------------------------------ 模式解析 ------------------------------ */

test("parseAnswerMode：三種模式照字面讀", () => {
  assert.equal(parseAnswerMode(knowledgeBase("直接給答案")), "直接給答案");
  assert.equal(parseAnswerMode(knowledgeBase("引導後再回答")), "引導後再回答");
  assert.equal(parseAnswerMode(knowledgeBase("不直接給答案")), "不直接給答案");
});

test("parseAnswerMode：冇【答題策略】或認唔到 → 預設引導後再回答", () => {
  assert.equal(parseAnswerMode("【角色對話策略】\n【性格特質】耐心"), "引導後再回答");
  assert.equal(parseAnswerMode(""), "引導後再回答");
  assert.equal(parseAnswerMode(knowledgeBase("隨便答")), "引導後再回答");
});

/* --------------------------- Directive 注入 --------------------------- */

test("buildChatSystemPrompt：三種模式都注入 # Answer Mode Directive", () => {
  for (const mode of ["直接給答案", "引導後再回答", "不直接給答案"]) {
    assert.match(promptWith(mode), /# Answer Mode Directive/, `${mode} 冇注入 directive`);
  }
});

test("buildChatSystemPrompt：每個模式有自己嘅 marker，唔會互相撈亂", () => {
  const direct = promptWith("直接給答案");
  const guided = promptWith("引導後再回答");
  const noDirect = promptWith("不直接給答案");

  assert.match(direct, /explicit permission to answer directly/);
  assert.doesNotMatch(direct, /guide first, answer later/);

  assert.match(guided, /guide first, answer later/);
  assert.match(guided, /最終俾答案/);
  assert.doesNotMatch(guided, /never casually reveal/);

  assert.match(noDirect, /never casually reveal/);
  assert.match(noDirect, /永不放任卡死/);
  assert.doesNotMatch(noDirect, /guide first, answer later/);
});

test("兩個引導模式都有終點：卡關遞進最終會俾答案連解釋", () => {
  // 無限引導＝學生永遠攞唔到答案，係另一種失敗模式，所以兩個模式都要有終點。
  for (const mode of ["引導後再回答", "不直接給答案"]) {
    const directive = buildAnswerModeDirective(mode as never);
    assert.match(directive, /answer WITH/, `${mode} 冇最終揭曉`);
  }
});

test("兩個引導模式：第一輪唔可以『講事實＋補問題』扮引導", () => {
  // 實跑踩過：模型會順手講出答案，再加一條問題，自以為已經係「引導」。
  // 兩個模式都要明文封死呢個後門——只要事實已出，就當倒咗答案。
  for (const mode of ["引導後再回答", "不直接給答案"]) {
    const directive = buildAnswerModeDirective(mode as never);
    assert.match(directive, /只要事實已出|只要個事實已經講咗/, `${mode} 冇封『事實＋問題』後門`);
    assert.match(directive, /第一輪只可以/, `${mode} 冇列明第一輪淨係可以出啲咩`);
  }
});

test("三個模式都保留『一輪最多一條問題』限制", () => {
  // 實跑踩過：選項輪寫完「A 定 B？」又跟手加句「你揀邊個」，變咗兩條問題；
  // 又有連問兩條唔同問題（問完「咩色」又問「印象點樣」）。三個模式共用同一條限制。
  for (const mode of ["直接給答案", "引導後再回答", "不直接給答案"]) {
    const directive = buildAnswerModeDirective(mode as never);
    assert.match(directive, /一輪仍然最多一條問題/, `${mode} 冇一輪一條問題限制`);
    assert.match(directive, /一輪只可以問一樣嘢/, `${mode} 冇封連問兩條問題`);
    assert.match(directive, /check-in/, `${mode} 冇封『check-in 問句』後門`);
  }
});

test("兩個引導模式：揭曉之後學生仍然話唔明，要再講答案，唔准退返去出選擇題", () => {
  // 實跑踩過：模型揭曉咗答案，學生繼續話唔明，佢竟然退返去出二選一——學生已經攞咗答案，
  // 再出選項係另一種卡死。兩個引導模式都要明文禁止。
  for (const mode of ["引導後再回答", "不直接給答案"]) {
    const directive = buildAnswerModeDirective(mode as never);
    assert.match(directive, /唔准退返去出選擇題/, `${mode} 冇封『揭曉後倒退』`);
  }
});

test("Directive 位置：喺優先權行之後、外層 # Core Objective 之前", () => {
  const prompt = promptWith("引導後再回答");
  const precedence = prompt.indexOf("老師設定嘅角色語氣與答題策略優先於通用教學骨架");
  const directive = prompt.indexOf("# Answer Mode Directive");
  // CHAT_STYLE_RULES 自己都有一條 "# Core Objective"，要搵外層嗰個（喺 directive 之後）。
  const coreObjective = prompt.indexOf("# Core Objective", directive);

  assert.ok(precedence >= 0, "優先權行被拆走咗");
  assert.ok(directive > precedence, "directive 應該喺優先權行之後");
  assert.ok(coreObjective > directive, "directive 應該喺外層 Core Objective 之前");
});

/* --------------------------- Rule 7 唔可以行返轉頭 --------------------------- */

test("Rule 7：舊嘅『有啲回合直接答完就停』後門已經封", () => {
  assert.doesNotMatch(CHAT_STYLE_RULES, /Some turns should simply answer and stop/);
  assert.match(CHAT_STYLE_RULES, /Do not dump the complete answer in one message/);
});

test("Rule 7 指向 # Answer Mode Directive（唔係自己另立一套）", () => {
  assert.match(CHAT_STYLE_RULES, /decided ONLY by # Answer Mode Directive/);
});

/* ------------------------------ 開場說明 ------------------------------ */

test("needsGuidedAnnouncement：只有『直接給答案』唔需要開場說明", () => {
  assert.equal(needsGuidedAnnouncement("直接給答案"), false);
  assert.equal(needsGuidedAnnouncement("引導後再回答"), true);
  assert.equal(needsGuidedAnnouncement("不直接給答案"), true);
});

test("罐頭後備句：三個語言都有，非空", () => {
  for (const lang of ["cantonese", "mandarin", "english"] as const) {
    const line = buildCannedGuidedAnnouncement(lang);
    assert.ok(line.trim().length > 0, `${lang} 後備句係空`);
  }
  assert.match(buildCannedGuidedAnnouncement("english"), /guide you/);
  assert.match(buildCannedGuidedAnnouncement("mandarin"), /不會直接給答案/);
  assert.match(buildCannedGuidedAnnouncement("cantonese"), /唔會直接俾答案/);
});

/* --------------------------- 開場說明生成 prompt --------------------------- */

test("buildGuidedAnnouncementPrompt：兩個引導模式都出到非空 prompt", () => {
  for (const mode of ["引導後再回答", "不直接給答案"] as const) {
    const { systemPrompt, userPrompt } = buildGuidedAnnouncementPrompt({
      roleName: "測試角色",
      knowledgeBase: knowledgeBase(mode),
      replyLanguage: "cantonese",
      answerMode: mode,
    });
    assert.ok(systemPrompt.trim().length > 0, `${mode} system prompt 係空`);
    assert.ok(userPrompt.trim().length > 0, `${mode} user prompt 係空`);
  }
});

test("生成 prompt 帶齊三個變體來源：說話風格 × 回覆語言 × 答題策略", () => {
  const { userPrompt } = buildGuidedAnnouncementPrompt({
    roleName: "孔子",
    knowledgeBase: knowledgeBase("不直接給答案"),
    replyLanguage: "mandarin",
    answerMode: "不直接給答案",
  });
  // 說話風格（知識庫寫嘅「幽默」，測試 fixture 用）
  assert.match(userPrompt, /說話風格：幽默/);
  // 回覆語言：普通話規則要入 prompt，唔可以當粵語
  assert.match(userPrompt, /回覆語言：.*Mandarin/s);
  assert.match(userPrompt, /答題策略：不直接給答案/);
});

test("文言風格：生成 prompt 用文言回覆規則（唔可以落返現代粵語）", () => {
  const classical = `【人物背景設定】
我是孔子。
【角色對話策略】
【說話風格】文言文
【答題策略】引導後再回答`;
  const { userPrompt } = buildGuidedAnnouncementPrompt({
    roleName: "孔子",
    knowledgeBase: classical,
    replyLanguage: "cantonese",
    answerMode: "引導後再回答",
  });
  assert.match(userPrompt, /Classical Chinese/);
  assert.doesNotMatch(userPrompt, /Hong Kong Cantonese/);
});

test("生成 prompt 明確禁止照抄模板句（否則變體要求形同虛設）", () => {
  const { systemPrompt, userPrompt } = buildGuidedAnnouncementPrompt({
    roleName: "測試角色",
    knowledgeBase: knowledgeBase("引導後再回答"),
    replyLanguage: "cantonese",
    answerMode: "引導後再回答",
  });
  assert.match(userPrompt, /唔准照抄/);
  assert.match(systemPrompt, /只輸出一句/);
});

test("生成 prompt 唔會洩漏罐頭後備句本身", () => {
  // 後備句只應該喺 server 呼叫失敗時用；一旦寫入 prompt，模型就會照抄，變體即刻消失。
  const canned = buildCannedGuidedAnnouncement("cantonese");
  const { userPrompt } = buildGuidedAnnouncementPrompt({
    roleName: "測試角色",
    knowledgeBase: knowledgeBase("引導後再回答"),
    replyLanguage: "cantonese",
    answerMode: "引導後再回答",
  });
  assert.equal(userPrompt.includes(canned), false, "prompt 唔應該包含罐頭句全文");
});
