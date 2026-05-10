import type { AdapterCall, ProviderAdapter, ResolvedRequest } from './adapter.js';

export interface OpenAIDirectAdapterOptions {
  readonly apiKey: string;
  readonly modelName: string;
}

export async function createOpenAIDirectAdapter(
  opts: OpenAIDirectAdapterOptions,
): Promise<ProviderAdapter> {
  const { createOpenAI } = await import('@ai-sdk/openai');
  const openai = createOpenAI({ apiKey: opts.apiKey });
  const imageModel = openai.image(opts.modelName);

  return {
    buildCall(req: ResolvedRequest): AdapterCall {
      return {
        fn: 'generateImage',
        args: {
          model: imageModel as unknown as string,
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
