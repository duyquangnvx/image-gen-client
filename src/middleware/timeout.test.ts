import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createTimeoutMiddleware } from './timeout.js';
import { composeChain } from './chain.js';
import type { Context, Handler } from './chain.js';
import type { ResolvedRequest } from '../providers/adapter.js';
import { ImageGenNetworkError } from '../errors.js';

const baseReq: ResolvedRequest = {
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
  prompt: 'p',
  n: 1,
};

const baseCtx: Context = {
  startedAt: 0,
  modelId: 'openai/gpt-image-2',
  mode: 'gateway',
  attempt: 1,
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('timeout middleware', () => {
  test('passes through when handler resolves before timeout', async () => {
    const fastHandler: Handler = async () => ({
      images: [],
      model: 'openai/gpt-image-2',
      mode: 'gateway',
      request: { operation: 'generate', n: 1, referenceCount: 0 },
      timings: { start: 0, finish: 0, durationMs: 0 },
    });
    const wrapped = composeChain([createTimeoutMiddleware(50)], fastHandler);
    const result = await wrapped(baseReq, baseCtx);
    expect(result.model).toBe('openai/gpt-image-2');
  });

  test('rejects with ImageGenNetworkError code=TIMEOUT when handler exceeds timeoutMs', async () => {
    const slow: Handler = () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({} as never), 1000);
      });
    const wrapped = composeChain([createTimeoutMiddleware(50)], slow);
    const promise = wrapped(baseReq, baseCtx);
    const expectation = expect(promise).rejects.toMatchObject({
      name: 'ImageGenNetworkError',
      code: 'TIMEOUT',
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(50);
    await expectation;
  });

  test('uses ctx.signal as parent abort: handler receives abort when ctx aborts before timeout', async () => {
    let observedAbort: AbortSignal | undefined;
    const handler: Handler = async (_req, ctx) => {
      observedAbort = ctx.signal;
      return {
        images: [],
        model: 'openai/gpt-image-2',
        mode: 'gateway',
        request: { operation: 'generate', n: 1, referenceCount: 0 },
        timings: { start: 0, finish: 0, durationMs: 0 },
      };
    };
    const wrapped = composeChain([createTimeoutMiddleware(50)], handler);
    await wrapped(baseReq, baseCtx);
    expect(observedAbort).toBeInstanceOf(AbortSignal);
  });

  test('thrown error is an instance of ImageGenNetworkError', async () => {
    const slow: Handler = () => new Promise(() => {});
    const wrapped = composeChain([createTimeoutMiddleware(10)], slow);
    const p = wrapped(baseReq, baseCtx);
    const expectation = expect(p).rejects.toBeInstanceOf(ImageGenNetworkError);
    await vi.advanceTimersByTimeAsync(10);
    await expectation;
  });
});
