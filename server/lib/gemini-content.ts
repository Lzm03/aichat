export const SUPPORTED_GEMINI_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type GeminiImageInput = {
  mimeType: string;
  data: string;
};

export type GeminiHistoryMessage = {
  role: "user" | "bot";
  content: string;
  images?: GeminiImageInput[];
};

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

const supportedMimeTypes = new Set<string>(SUPPORTED_GEMINI_IMAGE_MIME_TYPES);

export function normalizeGeminiImages(input: unknown): GeminiImageInput[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((image: any) => ({
      mimeType: String(image?.mimeType || "").toLowerCase().trim(),
      data: String(image?.data || "").trim(),
    }))
    .filter((image) => supportedMimeTypes.has(image.mimeType) && image.data.length > 0);
}

function partsForMessage(text: string, images: GeminiImageInput[]): GeminiPart[] {
  const parts: GeminiPart[] = [];
  const normalizedText = String(text || "").trim();
  if (normalizedText) parts.push({ text: normalizedText });
  for (const image of normalizeGeminiImages(images)) {
    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data,
      },
    });
  }
  return parts;
}

export function buildGeminiContents(
  userPrompt: string,
  currentImages: GeminiImageInput[] = [],
  history: GeminiHistoryMessage[] = []
): GeminiContent[] {
  const contents: GeminiContent[] = [];

  const append = (role: GeminiContent["role"], parts: GeminiPart[]) => {
    if (!parts.length) return;
    const previous = contents[contents.length - 1];
    if (previous?.role === role) {
      previous.parts.push(...parts);
      return;
    }
    contents.push({ role, parts });
  };

  for (const message of history) {
    append(
      message.role === "bot" ? "model" : "user",
      partsForMessage(message.content, message.images || [])
    );
  }

  append("user", partsForMessage(userPrompt, currentImages));
  return contents;
}

export function summarizeGeminiContents(contents: GeminiContent[]) {
  const mimeTypes = contents.flatMap((content) =>
    content.parts.flatMap((part) =>
      "inlineData" in part ? [part.inlineData.mimeType] : []
    )
  );
  return {
    multimodal: mimeTypes.length > 0,
    images: mimeTypes.length,
    mimeTypes,
  };
}
