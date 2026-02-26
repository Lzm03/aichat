import { GoogleGenAI } from "@google/genai";

export function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in env.");
  return new GoogleGenAI({ apiKey });
}