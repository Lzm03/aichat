export type ConversationRole = "user" | "assistant" | "system";

export type ConversationMessageType =
  | "normal"
  | "quiz_question"
  | "quiz_answer"
  | "quiz_result";

export type ConversationSummary = {
  id: string;
  userId: string;
  botId: string | null;
  topicId: string | null;
  title: string;
  type: string;
  status: string;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConversationDetail = ConversationSummary;

export type ConversationMessage = {
  id: string;
  conversationId: string;
  userId: string;
  botId: string | null;
  role: ConversationRole;
  content: string;
  messageType: ConversationMessageType;
  metadata: Record<string, any>;
  createdAt: string;
};

export type SendConversationMessageRequest = {
  systemPrompt: string;
  userPrompt: string;
  modelProvider: string;
  botId: string;
  source?: string;
  replyLanguage?: "cantonese" | "mandarin" | "english";
  stream?: boolean;
  teachingHint?: string;
  usageType?: string;
  sharedBotId?: string;
  conversationId?: string;
  topicId?: string;
  images?: File[];
  signal?: AbortSignal;
};

export type SendConversationMessageResponse = {
  reply: string;
  teachingMode?: boolean;
  stepIndex?: number;
  totalSteps?: number;
  followUpQuestion?: string;
  dialogueState?: Record<string, any>;
  modelProvider?: string;
  conversation?: ConversationDetail | null;
  conversationId?: string | null;
};
