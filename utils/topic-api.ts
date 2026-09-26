import { API_BASE } from "./api";
import type {
  CharacterTopicDetail,
  CharacterTopicInput,
  CharacterTopicSummary,
} from "../types/topics";

async function parseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(String((data as any)?.error || "請求失敗"));
    (error as any).code = (data as any)?.code;
    throw error;
  }
  return data as T;
}

export async function listCharacterTopics(characterId: string) {
  const response = await fetch(`${API_BASE}/api/bots/${characterId}/topics`);
  return parseJson<{
    topics: CharacterTopicSummary[];
    maxTopics: number;
    legacyFallback: boolean;
    /** 每個主題有幾多份已發佈測驗（topicId → 數）；刪主題前要講清楚後果 */
    quizCounts?: Record<string, number>;
  }>(response);
}

export async function getCharacterTopic(characterId: string, topicId: string) {
  const response = await fetch(`${API_BASE}/api/bots/${characterId}/topics/${topicId}`);
  const data = await parseJson<{ topic: CharacterTopicDetail }>(response);
  return data.topic;
}

export async function createCharacterTopic(characterId: string, input: CharacterTopicInput) {
  const response = await fetch(`${API_BASE}/api/bots/${characterId}/topics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ topic: CharacterTopicDetail }>(response);
  return data.topic;
}

export async function updateCharacterTopic(
  characterId: string,
  topicId: string,
  input: CharacterTopicInput
) {
  const response = await fetch(`${API_BASE}/api/bots/${characterId}/topics/${topicId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ topic: CharacterTopicDetail }>(response);
  return data.topic;
}

export async function deleteCharacterTopic(characterId: string, topicId: string) {
  const response = await fetch(`${API_BASE}/api/bots/${characterId}/topics/${topicId}`, {
    method: "DELETE",
  });
  return parseJson<{ ok: true; deletedId: string; defaultTopicId: string }>(response);
}

/** 帳戶層自訂分類標籤（最多 10 個，跨 Bot 共用） */
export async function listTopicCategoryLabels() {
  const response = await fetch(`${API_BASE}/api/teacher/topic-category-labels`);
  return parseJson<{ labels: string[] }>(response);
}

export async function saveTopicCategoryLabels(labels: string[]) {
  const response = await fetch(`${API_BASE}/api/teacher/topic-category-labels`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ labels }),
  });
  return parseJson<{ labels: string[] }>(response);
}
