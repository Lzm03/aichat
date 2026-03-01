// camelCase → snake_case（寫入資料庫用）
export function toDb(bot) {
  return {
    id: bot.id,
    name: bot.name,
    subject: bot.subject,
    subject_color: bot.subjectColor,
    avatar_url: bot.avatarUrl,
    background: bot.background,
    animation: bot.animation,

    knowledge_base: bot.knowledgeBase,
    security_prompt: bot.securityPrompt,

    video_idle: bot.videoIdle,
    video_thinking: bot.videoThinking,
    video_talking: bot.videoTalking,
    voice_id: bot.voiceId,

    interactions: bot.interactions,
    accuracy: bot.accuracy,
    is_visible: bot.isVisible,
  };
}

// snake_case → camelCase（給前端）
export function toClient(raw) {
  return {
    id: raw.id,
    name: raw.name,
    subject: raw.subject,
    subjectColor: raw.subject_color,
    avatarUrl: raw.avatar_url,
    background: raw.background,
    animation: raw.animation,

    knowledgeBase: raw.knowledge_base,
    securityPrompt: raw.security_prompt,

    videoIdle: raw.video_idle,
    videoThinking: raw.video_thinking,
    videoTalking: raw.video_talking,
    voiceId: raw.voice_id,

    interactions: raw.interactions,
    accuracy: raw.accuracy,
    isVisible: raw.is_visible,
  };
}