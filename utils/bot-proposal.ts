/**
 * 「客制化申請」嘅角色設定草案產生器。
 *
 * 輸出格式係同 utils/chat-prompt.ts 嘅 parsePromptSource 對齊嘅契約：
 *   【人物背景設定】【人物知識庫摘要】【知識點分級】【角色對話策略】
 *   ＋可選【不知道邏輯】【收尾儀式】＋唔會入 prompt 嘅【製作備註】
 * 節名、順序、以及「留空 = 用系統預設」嘅行為都係契約一部分，
 * 改動前先睇 server/tests/bot-proposal.test.ts。
 */

export type BotProposalInput = {
  /** 角色名，只作標題展示 */
  name: string;
  classInfo: string;
  studentCount: string;
  /** 已翻譯嘅使用時段（例：課堂中使用） */
  timingLabel: string;
  /** 已串好嘅學科文字 */
  subjectText: string;
  /** 已串好嘅視覺風格文字 */
  styleText: string;
  /** 老師填嘅角色背景資料 → 【人物背景設定】 */
  background: string;
  /** 老師填嘅補充需求 → 【角色對話策略】嘅自由硬規則 */
  notes: string;
  materialFileNames: string[];
  materialTextLength: number;
};

// 注意：開場白同【製作備註】都唔可以出現「【節名】」字樣。
// matchSection 會配對到第一個出現嘅節名，喺正文提及節名會令真正嘅節被蓋過。
export const PROPOSAL_INTRO = '以下為可直接存入 Bot 知識庫的角色設定書，請連同節名一併保留。';

export function buildBotProposal(input: BotProposalInput) {
  const materialList = [
    ...input.materialFileNames.filter(Boolean),
    input.materialTextLength > 0 ? `文字教材約 ${input.materialTextLength} 字` : '',
  ].filter(Boolean);

  return `${PROPOSAL_INTRO}

【人物背景設定】
${input.background.trim()}

【人物知識庫摘要】
待教材抽取。${materialList.length ? `已收到：${materialList.join('、')}。` : '尚未收到教材，請於提交時上傳或貼上。'}

【知識點分級】
待教材抽取：基礎事實（basic_fact）最多 4 個、深度理解（deep_understanding）最多 4 個；每點需有 id、title、content、keywords、assessmentCriteria。

【角色對話策略】
【性格特質】
【說話風格】
【答題策略】
${input.notes.trim()}

【不知道邏輯】

【收尾儀式】

【製作備註】
選填的「不知道邏輯」（角色遇到知識範圍外問題時的回應方式）與「收尾儀式」（對話結束時的固定叮囑）留空時，系統會自動使用預設行為。
服務情境：${input.classInfo}｜約 ${input.studentCount} 位學生｜${input.timingLabel}
教學範圍：${input.subjectText}（回答以老師提供的教材和知識點為優先依據，不超出課程程度）
視覺設定：${input.styleText}`;
}
