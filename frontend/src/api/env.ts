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
