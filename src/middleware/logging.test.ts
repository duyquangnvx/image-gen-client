import { describe, expect, test, vi } from 'vitest';
import { createLoggingMiddleware } from './logging.js';
import type { Handler } from './chain.js';
import type { ResolvedRequest } from '../providers/adapter.js';
import type { ImageGenResult, Logger } from '../types.js';

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

describe('logging middleware', () => {
  test('emits info before and after the call', async () => {
    const logs: Array<[string, string, Record<string, unknown>?]> = [];
    const logger: Logger = (level, message, meta) => {
      logs.push([level, message, meta]);
    };
    const terminal: Handler = async () => dummyResult;
    const mw = createLoggingMiddleware();
    const handler = mw(terminal);
    await handler(dummyReq, {
      startedAt: 1000,
      modelId: 'openai/gpt-image-2',
      mode: 'gateway',
      attempt: 1,
      logger,
    });
    expect(logs.length).toBe(2);
    expect(logs[0]?.[0]).toBe('info');
    expect(logs[0]?.[1]).toMatch(/start/i);
    expect(logs[1]?.[0]).toBe('info');
    expect(logs[1]?.[1]).toMatch(/finish|done|complete/i);
    expect(logs[1]?.[2]?.modelId).toBe('openai/gpt-image-2');
  });

  test('emits error log when handler throws, then re-throws', async () => {
    const logs: Array<[string, string]> = [];
    const logger: Logger = (level, message) => {
      logs.push([level, message]);
    };
    const terminal: Handler = async () => {
      throw new Error('boom');
    };
    const mw = createLoggingMiddleware();
    const handler = mw(terminal);
    await expect(
      handler(dummyReq, {
        startedAt: 1000,
        modelId: 'openai/gpt-image-2',
        mode: 'gateway',
        attempt: 1,
        logger,
      }),
    ).rejects.toThrow('boom');
    expect(logs.find(([level]) => level === 'error')).toBeDefined();
  });

  test('no-ops when no logger is provided', async () => {
    const terminal: Handler = vi.fn(async () => dummyResult);
    const handler = createLoggingMiddleware()(terminal);
    await handler(dummyReq, {
      startedAt: 0,
      modelId: 'openai/gpt-image-2',
      mode: 'gateway',
      attempt: 1,
    });
    expect(terminal).toHaveBeenCalledOnce();
  });
});
