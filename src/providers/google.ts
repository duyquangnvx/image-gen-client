import type { AdapterCall, ProviderAdapter, ResolvedRequest } from './adapter.js';

export interface GoogleDirectAdapterOptions {
  readonly apiKey: string;
  readonly modelName: string;
}

export async function createGoogleDirectAdapter(
  opts: GoogleDirectAdapterOptions,
): Promise<ProviderAdapter> {
  const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
  const google = createGoogleGenerativeAI({ apiKey: opts.apiKey });
  const imageModel = google.image(opts.modelName);

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
