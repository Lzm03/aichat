const envBase = import.meta.env.VITE_API_URL?.trim();

// Use configured backend in production; fallback to same-origin in local/dev.
export const API_BASE = (envBase && envBase.length > 0 ? envBase : window.location.origin).replace(/\/$/, "");

