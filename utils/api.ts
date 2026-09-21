const envBase = import.meta.env.VITE_API_URL?.trim();
const isBrowserOnLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const envPointsToLocalhost = (() => {
  if (!envBase) return false;
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(envBase).hostname);
  } catch {
    return false;
  }
})();

// Never let a production page call a localhost backend embedded at build time.
// Local development uses Vite's same-origin /api proxy to port 4000.
export const API_BASE = (
  envBase && !(envPointsToLocalhost && !isBrowserOnLocalhost)
    ? envBase
    : window.location.origin
).replace(/\/$/, "");
