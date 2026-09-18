import { API_BASE } from "./api";

type CacheEntry = {
  data?: any;
  updatedAt: number;
  request?: Promise<any>;
};

const cache = new Map<string, CacheEntry>();
const DEFAULT_MAX_AGE_MS = 60_000;

const absoluteUrl = (path: string) => path.startsWith("http") ? path : `${API_BASE}${path}`;

export function peekTeacherData<T>(path: string): T | null {
  return (cache.get(absoluteUrl(path))?.data as T | undefined) ?? null;
}

export function loadTeacherData<T>(path: string, maxAgeMs = DEFAULT_MAX_AGE_MS): Promise<T> {
  const url = absoluteUrl(path);
  const entry = cache.get(url);
  if (entry?.data !== undefined && Date.now() - entry.updatedAt < maxAgeMs) {
    return Promise.resolve(entry.data as T);
  }
  if (entry?.request) return entry.request as Promise<T>;

  const request = fetch(url)
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || `Request failed: ${response.status}`));
      cache.set(url, { data, updatedAt: Date.now() });
      return data as T;
    })
    .catch((error) => {
      if (entry?.data !== undefined) return entry.data as T;
      throw error;
    })
    .finally(() => {
      const current = cache.get(url);
      if (current?.request) cache.set(url, { ...current, request: undefined });
    });

  cache.set(url, { data: entry?.data, updatedAt: entry?.updatedAt || 0, request });
  return request;
}

export function invalidateTeacherData(pathPrefix: string) {
  const prefix = absoluteUrl(pathPrefix);
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function preloadTeacherWorkspace() {
  return Promise.allSettled([
    loadTeacherData("/api/bots"),
    loadTeacherData("/api/students"),
    loadTeacherData("/api/bots/teacher/assessment-report"),
    loadTeacherData("/api/bots/teacher/progress-overview"),
    loadTeacherData("/api/bots/classes"),
    loadTeacherData("/api/teachers/me/ability-report?period=30d"),
    loadTeacherData("/api/teachers/me/grading-summary"),
  ]);
}
