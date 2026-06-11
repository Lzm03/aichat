import axios, { AxiosHeaders } from "axios";
import { API_BASE } from "./api";
import type { UserPreferences } from "./userPreferences";

export type StoredAuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: "teacher" | "student" | "admin";
  avatarUrl?: string;
  preferences?: UserPreferences;
  createdAt: string;
  plan?: string;
  quota?: {
    monthlyLimit: number;
    used: number;
    remaining: number;
  };
  permissions?: {
    canManageAllAccounts: boolean;
    canResetOwnUsage: boolean;
    unlimitedAccount: boolean;
  };
};

export type AuthSession = {
  token: string;
  user: StoredAuthUser;
};

export const AUTH_TOKEN_KEY = "chopreality_auth_token";
export const AUTH_USER_KEY = "chopreality_auth_user";
export const AUTH_CHANGED_EVENT = "chopreality-auth-changed";
export const FEATURE_USAGE_CHANGED_EVENT = "chopreality-feature-usage-changed";

let authBridgeInstalled = false;
let axiosInterceptorInstalled = false;

function readFrom(storage: Storage | null) {
  if (!storage) return null;
  const token = storage.getItem(AUTH_TOKEN_KEY);
  const rawUser = storage.getItem(AUTH_USER_KEY);
  if (!token || !rawUser) return null;
  try {
    return {
      token,
      user: JSON.parse(rawUser) as StoredAuthUser,
    };
  } catch {
    return null;
  }
}

export function readAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  return readFrom(window.localStorage) || readFrom(window.sessionStorage);
}

export function getAuthToken() {
  return readAuthSession()?.token || null;
}

export function saveAuthSession(session: AuthSession, persist = true) {
  if (typeof window === "undefined") return;
  const storage = persist ? window.localStorage : window.sessionStorage;
  const otherStorage = persist ? window.sessionStorage : window.localStorage;
  otherStorage.removeItem(AUTH_TOKEN_KEY);
  otherStorage.removeItem(AUTH_USER_KEY);
  storage.setItem(AUTH_TOKEN_KEY, session.token);
  storage.setItem(AUTH_USER_KEY, JSON.stringify(session.user));
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function isAuthPersistedInLocalStorage() {
  if (typeof window === "undefined") return true;
  return Boolean(window.localStorage.getItem(AUTH_TOKEN_KEY));
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
  window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
  window.sessionStorage.removeItem(AUTH_USER_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function notifyFeatureUsageChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FEATURE_USAGE_CHANGED_EVENT));
}

function shouldAttachAuth(url: string) {
  if (typeof window === "undefined") return false;
  try {
    const target = new URL(url, window.location.origin);
    const apiOrigin = new URL(API_BASE, window.location.origin).origin;
    const isLocalApi = /^http:\/\/localhost:(3000|4000)$/i.test(target.origin);
    return target.pathname.startsWith("/api/") && (
      target.origin === window.location.origin ||
      target.origin === apiOrigin ||
      isLocalApi
    );
  } catch {
    return false;
  }
}

export function installAuthTransportBridge() {
  if (typeof window === "undefined") return;

  if (!authBridgeInstalled) {
    authBridgeInstalled = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (!shouldAttachAuth(requestUrl)) {
        return nativeFetch(input, init);
      }

      const token = getAuthToken();
      if (!token) {
        return nativeFetch(input, init);
      }

      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return nativeFetch(input, { ...init, headers });
    };
  }

  if (!axiosInterceptorInstalled) {
    axiosInterceptorInstalled = true;
    axios.interceptors.request.use((config) => {
      const token = getAuthToken();
      if (!token) return config;
      const headers = AxiosHeaders.from(config.headers);
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      config.headers = headers;
      return config;
    });
  }
}
