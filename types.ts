export interface AiBot {
  id: string;
  avatarUrl: string;
  name: string;
  subject: string;
  subjectColor: 'indigo' | 'emerald' | 'amber';
  interactions: number;
  accuracy: number;
  isVisible: boolean;
  openingMessage?: string;
  videoIdle?: string;
  videoThinking?: string;
  videoTalking?: string;
  hasPublishedQuiz?: boolean;
  hasPendingQuiz?: boolean;
  activeQuizId?: string;
  activeQuizTitle?: string;
}
