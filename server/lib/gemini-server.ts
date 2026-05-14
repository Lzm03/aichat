import { GoogleGenAI } from "@google/genai";
import { GoogleAuth } from "google-auth-library";
import fs from "fs";
import os from "os";
import path from "path";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
let injectedCredentialsPath: string | null = null;

function ensureGoogleCredentialsFromEnv() {
  const inlineJson = String(process.env.GCP_SERVICE_ACCOUNT_JSON || "").trim();
  if (!inlineJson) return;
  if (injectedCredentialsPath) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = injectedCredentialsPath;
    return;
  }

  const parsed = JSON.parse(inlineJson);
  const dir = path.join(os.tmpdir(), "gcp-creds");
  fs.mkdirSync(dir, { recursive: true });
  const targetPath = path.join(dir, "service-account.json");
  fs.writeFileSync(targetPath, JSON.stringify(parsed), { encoding: "utf8", mode: 0o600 });
  injectedCredentialsPath = targetPath;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = targetPath;
}

export function isVertexAIEnabled() {
  return (
    /^(1|true|yes|on)$/i.test(String(process.env.GOOGLE_GENAI_USE_VERTEXAI || "").trim()) ||
    Boolean(String(process.env.GOOGLE_CLOUD_PROJECT || "").trim())
  );
}

export function getVertexAIConfig() {
  const project = String(process.env.GOOGLE_CLOUD_PROJECT || "").trim();
  const location = String(process.env.GOOGLE_CLOUD_LOCATION || "global").trim() || "global";
  if (!project) throw new Error("Missing GOOGLE_CLOUD_PROJECT in env for Vertex AI.");
  return { project, location };
}

export async function getVertexAccessToken() {
  ensureGoogleCredentialsFromEnv();
  const auth = new GoogleAuth({
    scopes: [CLOUD_PLATFORM_SCOPE],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const accessToken = String(token.token || "").trim();
  if (!accessToken) throw new Error("Failed to acquire Vertex AI access token.");
  return accessToken;
}

export function getAI() {
  const useVertex = isVertexAIEnabled();

  if (useVertex) {
    const { project, location } = getVertexAIConfig();
    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
  }

  const serverKey = String(process.env.GEMINI_API_KEY || "").trim();
  const publicKey = String(process.env.NEXT_PUBLIC_GEMINI_API_KEY || "").trim();
  const apiKey =
    serverKey.startsWith("AIza") ? serverKey : publicKey.startsWith("AIza") ? publicKey : serverKey || publicKey;

  if (!apiKey) throw new Error("Missing Gemini API key in env.");
  return new GoogleGenAI({ apiKey });
}
