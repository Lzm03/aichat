import { API_BASE } from "./api";

export type PlatformVoice = Record<string, unknown> & {
  voice_id?: string;
  voice_name?: string;
  name?: string;
};

let cachedVoices: PlatformVoice[] | null = null;
let voicesRequest: Promise<PlatformVoice[]> | null = null;

export function getCachedVoices() {
  return cachedVoices;
}

export function preloadVoices(): Promise<PlatformVoice[]> {
  if (cachedVoices) return Promise.resolve(cachedVoices);
  if (voicesRequest) return voicesRequest;

  voicesRequest = fetch(`${API_BASE}/api/voices`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Voice list failed: ${response.status}`);
      const data = await response.json();
      cachedVoices = Array.isArray(data?.voices) ? data.voices : [];
      return cachedVoices;
    })
    .finally(() => {
      voicesRequest = null;
    });

  return voicesRequest;
}
