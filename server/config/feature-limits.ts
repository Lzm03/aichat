export type FeatureLimitKey =
  | "bot_publish"
  | "avatar_ai_generate"
  | "background_ai_generate"
  | "voice_audition_preview"
  | "video_studio_generate"
  | "chat_messages"
  | "voice_messages";

export type FeatureLimitDefinition = {
  key: FeatureLimitKey;
  label: string;
  limit: number;
  description: string;
  upgradeMessage: string;
  countUnit: string;
};

export const FEATURE_LIMITS: Record<FeatureLimitKey, FeatureLimitDefinition> = {
  bot_publish: {
    key: "bot_publish",
    label: "創建角色",
    limit: 1,
    description: "免費版只能完成並發布 1 個角色。",
    upgradeMessage: "免費版只能建立 1 個角色，請升級到付費版。",
    countUnit: "次",
  },
  avatar_ai_generate: {
    key: "avatar_ai_generate",
    label: "形象 AI 生成",
    limit: 1,
    description: "角色形象的 AI 生成可使用 1 次。",
    upgradeMessage: "免費版的角色形象 AI 生成功能已用完，請升級到付費版。",
    countUnit: "次",
  },
  background_ai_generate: {
    key: "background_ai_generate",
    label: "背景 AI 生成",
    limit: 1,
    description: "背景風格重塑可使用 1 次。",
    upgradeMessage: "免費版的背景 AI 生成功能已用完，請升級到付費版。",
    countUnit: "次",
  },
  voice_audition_preview: {
    key: "voice_audition_preview",
    label: "聲音預覽",
    limit: 3,
    description: "聲音試聽預覽可用 3 次。",
    upgradeMessage: "免費版聲音預覽次數已用完，請升級到付費版。",
    countUnit: "次",
  },
  video_studio_generate: {
    key: "video_studio_generate",
    label: "影片工作室",
    limit: 1,
    description: "AI 影片工作室生成可用 1 次。",
    upgradeMessage: "免費版影片工作室生成次數已用完，請升級到付費版。",
    countUnit: "次",
  },
  chat_messages: {
    key: "chat_messages",
    label: "對話次數",
    limit: 50,
    description: "免費版可進行 50 次文字對話。",
    upgradeMessage: "免費版對話次數已用完，請升級到付費版。",
    countUnit: "次",
  },
  voice_messages: {
    key: "voice_messages",
    label: "語音回覆次數",
    limit: 50,
    description: "免費版語音功能可用 50 次，之後僅保留文字對話。",
    upgradeMessage: "免費版語音功能已用完，請升級到付費版。",
    countUnit: "次",
  },
};

export const FEATURE_LIMIT_LIST = Object.values(FEATURE_LIMITS).filter(
  (item) => item.key !== "avatar_ai_generate" && item.key !== "background_ai_generate"
);
