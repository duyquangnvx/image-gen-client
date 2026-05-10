export interface ProbeResult {
  readonly reachable: boolean;
  readonly reason?: string;
}

export async function probeCxLocal(timeoutMs = 1_000): Promise<ProbeResult> {
  try {
    const response = await fetch('http://localhost:20128/v1/models', {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { reachable: false, reason: `http ${response.status}` };
    }
    return { reachable: true };
  } catch (err) {
    return { reachable: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
