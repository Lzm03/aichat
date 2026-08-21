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
  isVisible: boolean;
  openingMessage?: string;
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
