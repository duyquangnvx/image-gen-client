import { describe, expect, test, vi } from 'vitest';
import { createValidationMiddleware } from './validation-mw.js';
import { ImageGenValidationError } from '../errors.js';
import type { Handler } from './chain.js';
import type { ResolvedRequest } from '../providers/adapter.js';
import type { ImageGenResult } from '../types.js';

const cap = {
  textToImage: true,
  imageEdit: true,
  multiReference: true,
  transparentBackground: true,
  maxN: 4,
  supportsSeed: true,
  supportsNegativePrompt: false,
  apiPath: 'generateImage' as const,
  sizes: ['1024x1024'] as const,
};

const dummyResult = {
  images: [],
  model: 'openai/gpt-image-2',
  mode: 'gateway',
  request: { operation: 'generate', n: 1, referenceCount: 0 },
  timings: { start: 0, finish: 0, durationMs: 0 },
} as unknown as ImageGenResult;

const ctx = {
  startedAt: 0,
  modelId: 'openai/gpt-image-2' as const,
  mode: 'gateway' as const,
  attempt: 1,
};

describe('validation middleware', () => {
  test('passes valid generate request to next handler', async () => {
    const next: Handler = vi.fn(async () => dummyResult);
    const mw = createValidationMiddleware();
    const handler = mw(next);
    const req: ResolvedRequest = {
      operation: 'generate',
      modelId: 'openai/gpt-image-2',
      mode: 'gateway',
      apiPath: 'generateImage',
      capability: cap,
      prompt: 'a cat',
      n: 1,
    };
    await handler(req, ctx);
    expect(next).toHaveBeenCalledOnce();
  });

  test('throws when prompt is empty', async () => {
    const next: Handler = vi.fn(async () => dummyResult);
    const mw = createValidationMiddleware();
    const handler = mw(next);
    const req: ResolvedRequest = {
      operation: 'generate',
      modelId: 'openai/gpt-image-2',
      mode: 'gateway',
      apiPath: 'generateImage',
      capability: cap,
      prompt: '',
      n: 1,
    };
    await expect(handler(req, ctx)).rejects.toBeInstanceOf(ImageGenValidationError);
    expect(next).not.toHaveBeenCalled();
  });

  test('throws when size violates capability', async () => {
    const next: Handler = vi.fn(async () => dummyResult);
    const mw = createValidationMiddleware();
    const handler = mw(next);
    const req: ResolvedRequest = {
      operation: 'generate',
      modelId: 'openai/gpt-image-2',
      mode: 'gateway',
      apiPath: 'generateImage',
      capability: cap,
      prompt: 'a cat',
      size: '999x999',
      n: 1,
    };
    await expect(handler(req, ctx)).rejects.toBeInstanceOf(ImageGenValidationError);
    expect(next).not.toHaveBeenCalled();
  });
});
