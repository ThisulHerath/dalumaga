export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 10000,
  request: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await request(url, { ...options, signal: controller.signal });
    const data: unknown = response.ok ? await response.json() : null;
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
}
