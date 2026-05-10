import type { AdapterCall, ProviderAdapter, ResolvedRequest } from './adapter.js';

export interface OpenAICompatibleAdapterOptions {
  readonly baseURL: string;
  readonly apiKey: string;
  readonly name: string;
  readonly modelName: string;
}

export async function createOpenAICompatibleAdapter(
  opts: OpenAICompatibleAdapterOptions,
): Promise<ProviderAdapter> {
  const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
  const provider = createOpenAICompatible({
    baseURL: opts.baseURL,
    apiKey: opts.apiKey,
    name: opts.name,
  });
  const imageModel = provider.imageModel(opts.modelName);

  return {
    buildCall(req: ResolvedRequest): AdapterCall {
      return {
        fn: 'generateImage',
        args: {
          model: imageModel,
          prompt: req.prompt ?? '',
          n: req.n,
          ...(req.size !== undefined && { size: req.size }),
          ...(req.seed !== undefined && { seed: req.seed }),
          ...(req.providerOptions !== undefined && { providerOptions: req.providerOptions }),
          ...(req.signal !== undefined && { abortSignal: req.signal }),
        },
      };
    },
  };
}
