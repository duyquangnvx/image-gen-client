import { ImageGenConfigError } from '../errors.js';
import type { ModelId } from '../types.js';
import type { ResolvedProvider } from '../resolver.js';
import { createDefaultAdapter } from './default.js';
import { createOpenAIDirectAdapter } from './openai.js';
import { createGoogleDirectAdapter } from './google.js';
import { createOpenAICompatibleAdapter } from './openai-compatible.js';
import type { ProviderAdapter } from './adapter.js';

export interface SelectAdapterContext {
  readonly modelId: ModelId;
  readonly modelName: string;
}

export async function selectAdapter(
  resolved: ResolvedProvider,
  ctx: SelectAdapterContext,
): Promise<ProviderAdapter> {
  if (resolved.mode === 'gateway') {
    return createDefaultAdapter();
  }
  if (resolved.kind === 'openai-compatible') {
    return createOpenAICompatibleAdapter({
      baseURL: resolved.baseURL,
      apiKey: resolved.apiKey,
      name: resolved.name,
      modelName: ctx.modelName,
    });
  }
  if (resolved.providerKey === 'openai') {
    return createOpenAIDirectAdapter({ apiKey: resolved.apiKey, modelName: ctx.modelName });
  }
  if (resolved.providerKey === 'google') {
    return createGoogleDirectAdapter({ apiKey: resolved.apiKey, modelName: ctx.modelName });
  }
  throw new ImageGenConfigError(
    `provider '${resolved.providerKey}' is not supported in slice 2 native mode`,
    'CONFIG_UNSUPPORTED_PROVIDER',
    {
      modelId: ctx.modelId,
      mode: 'direct',
      hint: `use kind: 'openai-compatible' with a baseURL, or wait for slice 3`,
    },
  );
}
