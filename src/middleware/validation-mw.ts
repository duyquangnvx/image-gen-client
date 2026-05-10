import { validateGenerate } from '../validation.js';
import type { Middleware } from './chain.js';

export function createValidationMiddleware(): Middleware {
  return (next) => async (req, ctx) => {
    if (req.operation === 'generate') {
      validateGenerate(
        {
          prompt: req.prompt ?? '',
          ...(req.size !== undefined && { size: req.size }),
          ...(req.n !== undefined && { n: req.n }),
        },
        req.capability,
        { modelId: ctx.modelId },
      );
    }
    return next(req, ctx);
  };
}
