/**
 * Resolve the API base URL at runtime.
 *
 * In production the value is injected by CDK at deploy time via a small
 * `/env.js` script (see lib/frontend.ts) that sets `window.__ENV__`. This
 * decouples the static build from the API Gateway URL, which is only known
 * once the stack is deployed.
 *
 * For local development it falls back to `NEXT_PUBLIC_API_BASE_URL` (set in
 * frontend/.env.local).
 */
declare global {
  interface Window {
    __ENV__?: { API_BASE_URL?: string };
  }
}

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined" && window.__ENV__?.API_BASE_URL) {
    return window.__ENV__.API_BASE_URL;
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
}
