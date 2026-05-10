import { ImageGenConfigError } from './errors.js';
import type { Mode, ModelId, ProviderConfig } from './types.js';

export interface ResolveModeArgs {
  readonly modelId: ModelId;
  readonly callOverride?: Mode;
  readonly clientMode?: Mode | 'auto';
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly gatewayApiKey?: string;
}

// §6.1 — auto resolves to gateway when a gateway key is available (config or
// env), else direct.
export function resolveMode(args: ResolveModeArgs): Mode {
  if (args.callOverride !== undefined) return args.callOverride;
  const clientMode = args.clientMode ?? 'auto';
  if (clientMode !== 'auto') return clientMode;
  const hasGatewayKey =
    args.gatewayApiKey !== undefined || args.env.AI_GATEWAY_API_KEY !== undefined;
  return hasGatewayKey ? 'gateway' : 'direct';
}

export type ResolvedProvider =
  | { readonly providerKey: string; readonly mode: 'gateway' }
  | {
      readonly providerKey: string;
      readonly mode: 'direct';
      readonly kind: 'native';
      readonly apiKey: string;
    }
  | {
      readonly providerKey: string;
      readonly mode: 'direct';
      readonly kind: 'openai-compatible';
      readonly apiKey: string;
      readonly baseURL: string;
      readonly name: string;
    };

export interface ResolveProviderArgs {
  readonly modelId: ModelId;
  readonly mode: Mode;
  readonly providers: Readonly<Record<string, ProviderConfig>>;
  readonly env: Readonly<Record<string, string | undefined>>;
}

const NATIVE_ENV_KEY: Readonly<Record<string, string>> = {
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

export function resolveProvider(args: ResolveProviderArgs): ResolvedProvider {
  const slash = args.modelId.indexOf('/');
  const providerKey = slash > 0 ? args.modelId.slice(0, slash) : args.modelId;

  if (args.mode === 'gateway') {
    return { providerKey, mode: 'gateway' };
  }

  const cfg = args.providers[providerKey];
  if (cfg !== undefined && cfg.kind === 'openai-compatible') {
    if (!cfg.baseURL) {
      throw new ImageGenConfigError(
        `provider '${providerKey}' is openai-compatible but baseURL is empty`,
        'CONFIG_NO_PROVIDER',
        {
          modelId: args.modelId,
          mode: 'direct',
          hint: `set providers.${providerKey}.baseURL`,
        },
      );
    }
    return {
      providerKey,
      mode: 'direct',
      kind: 'openai-compatible',
      apiKey: cfg.apiKey ?? '',
      baseURL: cfg.baseURL,
      name: cfg.name ?? providerKey,
    };
  }

  const apiKey = cfg?.apiKey ?? args.env[NATIVE_ENV_KEY[providerKey] ?? ''];
  if (apiKey === undefined || apiKey === '') {
    const envName = NATIVE_ENV_KEY[providerKey];
    const hint = envName
      ? `set ${envName} or pass providers.${providerKey}.apiKey`
      : `pass providers.${providerKey}.apiKey or use kind: 'openai-compatible' with a baseURL`;
    throw new ImageGenConfigError(
      `no api key for provider '${providerKey}' in direct mode`,
      'CONFIG_NO_PROVIDER',
      { modelId: args.modelId, mode: 'direct', hint },
    );
  }

  return { providerKey, mode: 'direct', kind: 'native', apiKey };
}
