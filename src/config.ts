import type { ClientOptions, Logger, Mode, ModelId } from './types.js';

export interface ResolvedConfig {
  readonly mode: Mode | 'auto';
  readonly defaultModel?: ModelId;
  readonly logger?: Logger;
  readonly timeoutMs: number;
  readonly gatewayApiKey?: string;
  readonly gatewayBaseURL?: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export function resolveConfig(
  options: ClientOptions,
  env: Readonly<Record<string, string | undefined>>,
): ResolvedConfig {
  const gatewayApiKey = options.gateway?.apiKey ?? env.AI_GATEWAY_API_KEY;
  const gatewayBaseURL = options.gateway?.baseURL ?? env.AI_GATEWAY_BASE_URL;

  return {
    mode: options.mode ?? 'auto',
    ...(options.defaultModel !== undefined && { defaultModel: options.defaultModel }),
    ...(options.logger !== undefined && { logger: options.logger }),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ...(gatewayApiKey !== undefined && { gatewayApiKey }),
    ...(gatewayBaseURL !== undefined && { gatewayBaseURL }),
  };
}
