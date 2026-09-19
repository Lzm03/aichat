export type CharacterTopicSummary = {
  id: string;
  characterId: string;
  name: string;
  description: string;
  /** 主題版本分類標籤（單元課本／補充講義／課外延伸／題庫對應 或自訂）；空 = 未分類 */
  category: string;
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
  /** 知識點內容（結構化【知識點分級】）；更新時可省略 = 唔郁佢 */
  knowledgeContent?: string;
  category?: string;
  sortOrder?: number;
  isDefault: boolean;
};
