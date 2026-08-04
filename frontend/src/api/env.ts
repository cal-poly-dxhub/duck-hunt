declare global {
  interface Window {
    __ENV__?: { API_BASE_URL?: string };
  }
}

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  }

  const url = window.__ENV__?.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!url) {
    throw new Error(
      "API base URL is not configured. Ensure /env.js sets window.__ENV__.API_BASE_URL or set NEXT_PUBLIC_API_BASE_URL for local dev."
    );
  }
  return url;
}
