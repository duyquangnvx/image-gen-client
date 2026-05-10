import type { Middleware } from './chain.js';

export function createLoggingMiddleware(): Middleware {
  return (next) => async (req, ctx) => {
    const log = ctx.logger;
    log?.('info', 'image-gen start', {
      modelId: ctx.modelId,
      mode: ctx.mode,
      operation: req.operation,
      n: req.n,
    });
    try {
      const result = await next(req, ctx);
      log?.('info', 'image-gen finish', {
        modelId: ctx.modelId,
        mode: ctx.mode,
        durationMs: result.timings.durationMs,
        imageCount: result.images.length,
      });
      return result;
    } catch (err) {
      log?.('error', 'image-gen error', {
        modelId: ctx.modelId,
        mode: ctx.mode,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}
