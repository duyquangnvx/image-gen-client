import type { AdapterCall, ProviderAdapter, ResolvedRequest } from './adapter.js';

export function createDefaultAdapter(): ProviderAdapter {
  return {
    buildCall(req: ResolvedRequest): AdapterCall {
      if (req.mode === 'direct') {
        throw new Error('direct mode lands in slice 2; default adapter is gateway-only');
      }
      if (req.apiPath === 'generateText') {
        throw new Error('generateText apiPath lands in slice 2; default adapter handles generateImage only');
      }

      return {
        fn: 'generateImage',
        args: {
          model: req.modelId,
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
