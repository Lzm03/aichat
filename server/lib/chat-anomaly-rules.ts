// Chat anomaly screening for student messages: one rule table shared by the
// /api/ask hook (authoritative) and the future AI variant-review layer.
// Server-only — do not move to utils/ (it would ship the word list to the
// student's browser bundle).
//
// Two actions, per category (see docs/chat-anomaly-detection.md):
//   block — the message is dropped: never reaches the model, no credits, no
//           history. Used for content that must not be delivered.
//   flag  — the message is delivered normally; a record is kept for review.
// Wellbeing signals are deliberately flag-only: silently dropping a distress
// message would suppress a call for help, exactly when the reply matters most.
//
// Keyword sets are governed by docs/chat-anomaly-detection.md — tune keywords
// in place, never rename ruleIds (persisted in flagged_chat_messages.rule_id).
// The block rules are enforcement, so their FP tolerance is stricter than the
// quiz anomaly rules (advisory-only) — see the spec doc's reject table.

export type ChatAnomalyCategory = "inappropriate" | "wellbeing" | "privacy";
export type ChatAnomalyAction = "block" | "flag";

export interface ChatAnomalyRule {
  category: ChatAnomalyCategory;
  ruleId: string;
  action: ChatAnomalyAction;
  regex: RegExp;
}

// Rules are evaluated in order and the first match wins. Blocking rules come
// first: a message carrying personal data must not be delivered just because it
// also reads as a distress signal. (The wellbeing content is still visible to
// the teacher — the record stores the full message.)
export const CHAT_ANOMALY_RULES: ChatAnomalyRule[] = [
  {
    category: "inappropriate",
    ruleId: "inappropriate-chat-offensive-terms",
    action: "block",
    // (?<![我想]) stops 去死 from swallowing self-referential distress:
    // 「你去死」 blocks, 「我想去死」 falls through to the wellbeing rule below.
    // Terms ordered longest-first so the excerpt shows the fullest match.
    regex: /冚家鏟|仆街|阿差|黑鬼|死肥|樣衰|收皮|食屎|柒頭|屌你|屌|(?<![我想])去死(?!亡)|fuck|shit|bitch|asshole|damn|wtf/i,
  },
  {
    category: "privacy",
    ruleId: "privacy-chat-personal-info",
    action: "block",
    // Strong formats only: a bare 8-digit run needs a contact-word context,
    // while HKID and e-mail are self-identifying. 住在／地址 are NOT matched —
    // far too common in ordinary schoolwork for an enforcement action.
    regex: /(?:電話|手机|手機|whatsapp|ws|微信|wechat|tel)[^\d\n]{0,8}\d{8}|[a-z]{1,2}\d{6}\(\d\)|[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/i,
  },
  {
    category: "wellbeing",
    ruleId: "wellbeing-chat-distress-terms",
    action: "flag",
    // Shared vocabulary with the quiz wellbeing rule
    // (server/api/quizzes.ts ANOMALY_RULES, ruleId wellbeing-distress-terms).
    // Advisory, so a loose match only costs a teacher a glance — never a
    // student's sentence.
    regex: /自殺|自杀|輕生|轻生|自殘|自残|想(?:去)?死(?!亡)|唔想活|不想活|活唔落去|生無可戀|生无可恋|想消失|都係因我而起|都是因我而起|我唔喺度會好啲|我不在會更好|人生冇(?:咩|乜)?意義|人生沒有(?:甚麼|什麼)?意義|活著好像沒什麼意義|唔使(?:再)?醒|不用再醒/,
  },
];

export interface ChatAnomalyHit {
  ruleId: string;
  category: ChatAnomalyCategory;
  action: ChatAnomalyAction;
  excerpt: string;
}

// First match only, excerpt capped at 40 chars (matches the quiz anomaly
// convention in server/api/quizzes.ts detectAttemptAnomalies).
export function detectChatAnomaly(text: string): ChatAnomalyHit | null {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  for (const rule of CHAT_ANOMALY_RULES) {
    const match = rule.regex.exec(trimmed);
    if (!match) continue;
    return {
      ruleId: rule.ruleId,
      category: rule.category,
      action: rule.action,
      excerpt: match[0].slice(0, 40),
    };
  }
  return null;
}

// Scoping: only authenticated students' chat messages are screened. Teachers
// previewing their own bot, guests (actor resolves to the bot owner), and
// integration traffic (Modo) are skipped.
export function shouldScreenChatMessage(input: {
  role: string | null | undefined;
  integration: boolean;
  usageType: string;
}): boolean {
  return input.usageType === "chat_message" && !input.integration && input.role === "student";
}
