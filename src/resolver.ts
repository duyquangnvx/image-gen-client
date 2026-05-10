import { ImageGenConfigError } from './errors.js';
import type { Mode, ModelId } from './types.js';

export interface ResolveModeArgs {
  readonly modelId: ModelId;
  readonly callOverride?: Mode;
  readonly clientMode?: Mode | 'auto';
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly gatewayApiKey?: string;
}

// §6.1 — slice-1 implementation: gateway only. Direct mode raises a typed
// config error with a clear message until slice 2 lands.
export function resolveMode(args: ResolveModeArgs): Mode {
  if (args.callOverride !== undefined) {
    return guardModeAvailable(args.callOverride);
  }

  const clientMode = args.clientMode ?? 'auto';
  if (clientMode !== 'auto') {
    return guardModeAvailable(clientMode);
  }

  if (args.gatewayApiKey !== undefined || args.env.AI_GATEWAY_API_KEY !== undefined) {
    return 'gateway';
  }

  throw new ImageGenConfigError(
    'no provider key available — set AI_GATEWAY_API_KEY (gateway mode) ' +
      'or pass gateway.apiKey at construction',
    'CONFIG_NO_PROVIDER',
    {
      modelId: args.modelId,
      hint: 'set AI_GATEWAY_API_KEY in your environment',
    },
  );
}

function guardModeAvailable(mode: Mode): Mode {
  if (mode === 'direct') {
    throw new ImageGenConfigError(
      "direct mode lands in slice 2; use 'gateway' for now",
      'CONFIG_DIRECT_MODE_NOT_AVAILABLE',
      { hint: 'use mode=gateway and set AI_GATEWAY_API_KEY' },
    );
  }
  return mode;
}
