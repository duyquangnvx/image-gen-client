import { ImageGenNetworkError } from '../errors.js';
import type { Context, Middleware } from './chain.js';

export function createTimeoutMiddleware(timeoutMs: number): Middleware {
  return (next) => async (req, ctx) => {
    const controller = new AbortController();
    if (ctx.signal !== undefined) {
      if (ctx.signal.aborted) controller.abort();
      else ctx.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const handle = setTimeout(() => controller.abort(), timeoutMs);
    const childCtx: Context = { ...ctx, signal: controller.signal };
    try {
      return await Promise.race([
        next(req, childCtx),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => {
              if (ctx.signal?.aborted) {
                reject(ctx.signal.reason ?? new Error('aborted'));
              } else {
                reject(
                  new ImageGenNetworkError(
                    `request exceeded timeoutMs=${timeoutMs}`,
                    'TIMEOUT',
                    {
                      modelId: ctx.modelId,
                      mode: ctx.mode,
                      retryable: true,
                      hint: 'increase timeoutMs at createClient or per-call',
                    },
                  ),
                );
              }
            },
            { once: true },
          );
        }),
      ]);
    } finally {
      clearTimeout(handle);
    }
  };
}
