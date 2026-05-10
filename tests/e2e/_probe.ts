export interface ProbeResult {
  readonly reachable: boolean;
  readonly reason?: string;
}

const BASE_URL = 'http://localhost:20128/v1';
const UNREADY_BODY_KEYWORDS = ['credentials', 'api key', 'api_key', 'auth'];

export async function probeCxLocal(timeoutMs = 3_000): Promise<ProbeResult> {
  try {
    const modelsResponse = await fetch(`${BASE_URL}/models`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!modelsResponse.ok) {
      return { reachable: false, reason: `models http ${modelsResponse.status}` };
    }

    const genResponse = await fetch(`${BASE_URL}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'cx/gpt-5.4-image', prompt: 'ping', n: 1 }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (genResponse.status === 401 || genResponse.status === 403 || genResponse.status >= 500) {
      return { reachable: false, reason: `generations http ${genResponse.status}` };
    }

    if (genResponse.status === 400) {
      const body = await genResponse.text();
      const lower = body.toLowerCase();
      if (UNREADY_BODY_KEYWORDS.some((kw) => lower.includes(kw))) {
        const snippet = body.slice(0, 200);
        return { reachable: false, reason: `generations 400: ${snippet}` };
      }
    }

    return { reachable: true };
  } catch (err) {
    return { reachable: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
