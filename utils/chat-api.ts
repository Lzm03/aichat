import { API_BASE } from "./api";
import type {
  ConversationDetail,
  ConversationMessage,
  ConversationSummary,
  SendConversationMessageRequest,
} from "../types/chat";

async function parseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(String((data as any)?.error || "請求失敗"));
  }
  return data as T;
}

export async function listConversations(botId?: string, search?: string) {
  const params = new URLSearchParams();
  if (botId) params.set("botId", botId);
  if (search) params.set("search", search);
  const query = params.toString();
  const response = await fetch(`${API_BASE}/api/conversations${query ? `?${query}` : ""}`);
  const data = await parseJson<{ conversations: ConversationSummary[] }>(response);
  return data.conversations;
}

export async function createConversation(payload: {
  botId?: string;
  topicId?: string;
  title?: string;
  type?: string;
}) {
  const response = await fetch(`${API_BASE}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{ conversation: ConversationDetail }>(response);
  return data.conversation;
}

export async function updateConversationTopic(conversationId: string, topicId: string) {
  const response = await fetch(`${API_BASE}/api/conversations/${conversationId}/topic`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topicId }),
  });
  const data = await parseJson<{ conversation: ConversationDetail }>(response);
  return data.conversation;
}

export async function getConversation(conversationId: string) {
  const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`);
  const data = await parseJson<{ conversation: ConversationDetail }>(response);
  return data.conversation;
}

export async function renameConversation(conversationId: string, title: string) {
  const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  const data = await parseJson<{ conversation: ConversationDetail }>(response);
  return data.conversation;
}

export async function deleteConversation(conversationId: string) {
  const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
    method: "DELETE",
  });
  await parseJson<{ ok: true }>(response);
}

export async function getMessages(conversationId: string) {
  const response = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages`);
  const data = await parseJson<{ messages: ConversationMessage[] }>(response);
  return data.messages;
}

export async function saveMessage(
  conversationId: string,
  payload: {
    botId?: string;
    role: ConversationMessage["role"];
    content: string;
    messageType?: ConversationMessage["messageType"];
    metadata?: Record<string, any>;
  }
) {
  const response = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{ message: ConversationMessage }>(response);
  return data.message;
}

export async function sendConversationMessage(payload: SendConversationMessageRequest) {
  const hasImages = Array.isArray(payload.images) && payload.images.length > 0;
  const { signal, ...requestPayload } = payload;
  const response = await fetch(`${API_BASE}/api/ask`, {
    method: "POST",
    headers: hasImages ? undefined : { "Content-Type": "application/json" },
    signal,
    body: hasImages
      ? (() => {
          const form = new FormData();
          Object.entries(requestPayload).forEach(([key, value]) => {
            if (key === "images" || value === undefined || value === null) return;
            form.append(key, String(value));
          });
          requestPayload.images?.forEach((file) => form.append("images", file));
          return form;
        })()
      : JSON.stringify(requestPayload),
  });
  return { response, conversationId: response.headers.get("X-Conversation-Id") };
}
