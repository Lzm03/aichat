export interface AiBot {
  id: string;
  avatarUrl: string;
  background?: string;
  animation?: string;
  name: string;
  subject: string;
  subjectColor: 'indigo' | 'emerald' | 'amber';
  interactions: number;
  accuracy: number;
  createdAt?: string;
  updatedAt?: string;
  isVisible: boolean;
  openingMessage?: string;
  /** 年級帶（P1 / P2-P3 / P4-P6 / S1-S3 / S4-S6）；空字串 = 未設定 */
  grade?: string;
  knowledgeBase?: string;
  securityPrompt?: string;
  videoIdle?: string;
  videoThinking?: string;
  videoTalking?: string;
  voiceId?: string;
  hasPublishedQuiz?: boolean;
  hasPendingQuiz?: boolean;
  activeQuizId?: string;
  activeQuizTitle?: string;
}
