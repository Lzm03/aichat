// 契約測試：「客制化申請」草案（utils/bot-proposal.ts）嘅節名同順序，
// 必須同組裝層（utils/chat-prompt.ts 嘅 parsePromptSource）完全對齊。
// 呢個測試唔需要 DB，係純函數驗證。
import assert from "node:assert/strict";
import test from "node:test";
import { buildBotProposal } from "../../utils/bot-proposal.ts";
import { buildChatSystemPrompt, parsePromptSource } from "../../utils/chat-prompt.ts";

const proposal = buildBotProposal({
  name: "魯班",
  classInfo: "中三甲班",
  studentCount: "30",
  timingLabel: "課堂中使用",
  subjectText: "中國歷史 · 歷史科",
  styleText: "國風水墨／經典寫實風格",
  background: "我係魯班，木工出身，百工之祖。十五歲造第一張枱俾師傅一斧劈開，教我聽木頭講嘢。",
  notes: "一句唔超過 20 字；每次回應必須有動手指令。",
  materialFileNames: ["榫卯.pdf"],
  materialTextLength: 1200,
});

test("草案四節都可以俾 parsePromptSource 讀到", () => {
  const parsed = parsePromptSource({ roleName: "魯班", knowledgeBase: proposal });

  assert.match(parsed.characterBackground, /我係魯班，木工出身/);
  assert.match(parsed.knowledgeSummary, /已收到：榫卯\.pdf、文字教材約 1200 字/);
  assert.match(parsed.personaProfile, /一句唔超過 20 字/);
  assert.equal(parsed.knowledgePoints.length, 0, "草案階段未有知識點，應為空陣列");
});

test("【角色對話策略】唔可以吞掉後面嘅可選節", () => {
  const parsed = parsePromptSource({ roleName: "魯班", knowledgeBase: proposal });

  assert.doesNotMatch(parsed.personaProfile, /不知道邏輯/);
  assert.doesNotMatch(parsed.personaProfile, /收尾儀式/);
  assert.doesNotMatch(parsed.personaProfile, /服務情境/);
});

test("可選節留空 = 用系統預設", () => {
  const parsed = parsePromptSource({ roleName: "魯班", knowledgeBase: proposal });
  assert.equal(parsed.unknownBoundary, "");
  assert.equal(parsed.closingRitual, "");

  const prompt = buildChatSystemPrompt({ roleName: "魯班", knowledgeBase: proposal });
  assert.match(prompt, /若問題超出我的知識範圍/);
  assert.match(prompt, /今天先想到這裡也很好/);
});

test("老師填咗可選節就會覆寫系統預設，而且唔會漏入角色策略", () => {
  const filled = proposal
    .replace("【不知道邏輯】\n", "【不知道邏輯】\n我唔識嘅嘢會直認，唔會亂噏。\n")
    .replace("【收尾儀式】\n", "【收尾儀式】\n記得，木頭唔會呃你。\n");

  const parsed = parsePromptSource({ roleName: "魯班", knowledgeBase: filled });
  assert.match(parsed.unknownBoundary, /我唔識嘅嘢會直認/);
  assert.match(parsed.closingRitual, /木頭唔會呃你/);
  assert.doesNotMatch(parsed.personaProfile, /我唔識嘅嘢會直認/);

  const prompt = buildChatSystemPrompt({ roleName: "魯班", knowledgeBase: filled });
  assert.match(prompt, /我唔識嘅嘢會直認/);
  assert.match(prompt, /木頭唔會呃你/);
});

test("【製作備註】唔會進入 system prompt", () => {
  const prompt = buildChatSystemPrompt({ roleName: "魯班", knowledgeBase: proposal });

  assert.doesNotMatch(prompt, /國風水墨/, "視覺設定係製作團隊用，唔應該入 prompt");
  assert.doesNotMatch(prompt, /中三甲班/, "服務情境唔應該入 prompt");
  assert.doesNotMatch(prompt, /【不知道邏輯】/, "節名本身唔應該漏入 prompt");
  assert.doesNotMatch(prompt, /【製作備註】/);
});

test("compiled prompt does not inject canned opening phrases on every turn", () => {
  const prompt = buildChatSystemPrompt({
    roleName: "孔子",
    knowledgeBase: `【人物背景設定】\n吾名孔丘，字仲尼。\n\n【人物知識庫摘要】\n仁與禮。`,
  });
  assert.equal(prompt.includes("唔使急，陪你一步一步諗"), false);
  assert.match(prompt, /直接回應學生最新一句/);
  assert.match(prompt, /老師設定嘅角色語氣與答題策略優先/);
});
