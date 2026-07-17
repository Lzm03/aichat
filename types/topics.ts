export type CharacterTopicSummary = {
  id: string;
  characterId: string;
  name: string;
  description: string;
  sortOrder: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CharacterTopicDetail = CharacterTopicSummary & {
  systemPrompt: string;
  knowledgeContent: string;
};

export type CharacterTopicInput = {
  name: string;
  description: string;
  systemPrompt: string;
  knowledgeContent: string;
  isDefault: boolean;
};
