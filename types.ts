export interface AiBot {
  id: string;
  avatarUrl: string;
  name: string;
  subject: string;
  subjectColor: 'indigo' | 'emerald' | 'amber';
  interactions: number;
  accuracy: number;
  isVisible: boolean;
}
