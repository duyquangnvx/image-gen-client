import type { ImageGenResult, LogLevel, Logger, Mode, ModelId } from '../types.js';
import type { ResolvedRequest } from '../providers/adapter.js';

export interface Context {
  readonly startedAt: number;
  readonly modelId: ModelId;
  readonly mode: Mode;
  readonly attempt: number;
  readonly signal?: AbortSignal;
  readonly logger?: Logger;
}

export type Handler = (req: ResolvedRequest, ctx: Context) => Promise<ImageGenResult>;
export type Middleware = (next: Handler) => Handler;

// composeChain([A, B], T) = A(B(T)) — A wraps B which wraps T (outer → inner).
export function composeChain(middlewares: readonly Middleware[], terminal: Handler): Handler {
  return middlewares.reduceRight<Handler>((next, mw) => mw(next), terminal);
}

export type { LogLevel, Logger };
