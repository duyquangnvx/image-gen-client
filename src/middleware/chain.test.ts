import { describe, expect, test, vi } from 'vitest';
import { composeChain } from './chain.js';
import type { Handler, Middleware } from './chain.js';
import type { ResolvedRequest } from '../providers/adapter.js';
import type { ImageGenResult } from '../types.js';

const dummyReq: ResolvedRequest = {
  operation: 'generate',
  modelId: 'openai/gpt-image-2',
  mode: 'gateway',
  apiPath: 'generateImage',
  capability: {
    textToImage: true,
    imageEdit: true,
    multiReference: true,
    transparentBackground: true,
    maxN: 4,
    supportsSeed: true,
    supportsNegativePrompt: false,
    apiPath: 'generateImage',
  },
  prompt: 'a cat',
  n: 1,
};

const dummyResult = {
  images: [],
  model: 'openai/gpt-image-2',
  mode: 'gateway',
  request: { operation: 'generate', n: 1, referenceCount: 0 },
  timings: { start: 0, finish: 0, durationMs: 0 },
} as unknown as ImageGenResult;

const dummyCtx = {
  startedAt: 0,
  modelId: 'openai/gpt-image-2' as const,
  mode: 'gateway' as const,
  attempt: 1,
};

describe('composeChain', () => {
  test('runs middlewares outer → inner around terminal handler', async () => {
    const calls: string[] = [];
    const outer: Middleware = (next) => async (req, ctx) => {
      calls.push('outer-pre');
      const r = await next(req, ctx);
      calls.push('outer-post');
      return r;
    };
    const inner: Middleware = (next) => async (req, ctx) => {
      calls.push('inner-pre');
      const r = await next(req, ctx);
      calls.push('inner-post');
      return r;
    };
    const terminal: Handler = async () => {
      calls.push('terminal');
      return dummyResult;
    };

    const handler = composeChain([outer, inner], terminal);
    await handler(dummyReq, dummyCtx);
    expect(calls).toEqual(['outer-pre', 'inner-pre', 'terminal', 'inner-post', 'outer-post']);
  });

  test('middleware can short-circuit without calling next', async () => {
    const terminalSpy = vi.fn(async () => dummyResult);
    const blocking: Middleware = () => async () => dummyResult;
    const handler = composeChain([blocking], terminalSpy);
    await handler(dummyReq, dummyCtx);
    expect(terminalSpy).not.toHaveBeenCalled();
  });

  test('empty middleware list returns terminal handler unchanged', async () => {
    const terminalSpy = vi.fn(async () => dummyResult);
    const handler = composeChain([], terminalSpy);
    await handler(dummyReq, dummyCtx);
    expect(terminalSpy).toHaveBeenCalledOnce();
  });
});
