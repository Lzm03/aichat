export interface AiBot {
  id: string;
  avatarUrl: string;
  background?: string;
  animation?: string;
  name: string;
  subject: string;
  /** 學科代表色：新資料係 hex（utils/subjects.ts），舊資料可能仍係 Tailwind 色名 */
  subjectColor: string;
  interactions: number;
  accuracy: number;
  createdAt?: string;
  updatedAt?: string;
  isVisible: boolean;
  isDefault?: boolean;
  chatMessageLimit?: number | null;
  openingMessage?: string;
  /** 年級帶（P1 / P2-P3 / P4-P6 / S1-S3 / S4-S6）；空字串 = 未設定 */
  grade?: string;
  knowledgeBase?: string;
  securityPrompt?: string;
  videoIdle?: string;
  videoThinking?: string;
  videoTalking?: string;
  voiceId?: string;
  /** 聊天介面可切換的回覆語言；舊 Bot 預設只開啟粵語 */
  allowedReplyLanguages?: Array<"cantonese" | "mandarin" | "english">;
  hasPublishedQuiz?: boolean;
  hasPendingQuiz?: boolean;
  /** 仲有未完成測驗嘅（主題）桶數；舊 server 唔會回，卡片靠 hasPendingQuiz 兜底 */
  pendingQuizCount?: number;
  activeQuizId?: string;
  activeQuizTitle?: string;
  /** 全班覆蓋：covered = 有學生覆蓋咗嘅知識點數、total = 知識點總數（教師端卡片用） */
  coverage?: { covered: number; total: number };
}
