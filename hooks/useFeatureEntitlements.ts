import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../utils/api";
import { AUTH_CHANGED_EVENT, FEATURE_USAGE_CHANGED_EVENT, readAuthSession } from "../utils/auth";

export type FeatureEntitlement = {
  key: string;
  label: string;
  limit: number;
  used: number;
  remaining: number | null;
  locked: boolean;
  unlimited?: boolean;
  description: string;
  upgradeMessage: string;
  countUnit: string;
};

function getFeatureCacheKey(userId: string) {
  return `chopreality_feature_cache:${userId}`;
}

export function useFeatureEntitlements() {
  const [features, setFeatures] = useState<FeatureEntitlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const refresh = useCallback(async () => {
    const session = readAuthSession();
    if (!session?.token) {
      setFeatures([]);
      setInitialized(true);
      return [];
    }

    if (typeof window !== "undefined") {
      const cached = window.sessionStorage.getItem(getFeatureCacheKey(session.user.id));
      if (cached && !initialized) {
        try {
          const parsed = JSON.parse(cached) as FeatureEntitlement[];
          if (Array.isArray(parsed)) {
            setFeatures(parsed);
            setInitialized(true);
          }
        } catch {
          // ignore bad cache
        }
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/features`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      const data = await res.json().catch(() => null);
      const next = Array.isArray(data?.features) ? data.features : [];
      setFeatures(next);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(getFeatureCacheKey(session.user.id), JSON.stringify(next));
      }
      setInitialized(true);
      return next;
    } catch (error) {
      setInitialized(true);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [initialized]);

  const consume = useCallback(async (key: string, amount = 1, meta: Record<string, unknown> = {}) => {
    const session = readAuthSession();
    if (!session?.token) {
      throw new Error("登入狀態已失效，請重新登入");
    }

    const res = await fetch(`${API_BASE}/api/auth/features/${key}/consume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ amount, meta }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || "功能使用次數不足");
    }
    if (Array.isArray(data?.features)) {
      setFeatures(data.features);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(getFeatureCacheKey(session.user.id), JSON.stringify(data.features));
      }
    }
    return data;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => {
      void refresh();
    };
    window.addEventListener(AUTH_CHANGED_EVENT, handler);
    window.addEventListener(FEATURE_USAGE_CHANGED_EVENT, handler);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handler);
      window.removeEventListener(FEATURE_USAGE_CHANGED_EVENT, handler);
    };
  }, [refresh]);

  return { features, loading, initialized, refresh, consume };
}
