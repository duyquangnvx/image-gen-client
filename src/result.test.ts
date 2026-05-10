import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { normalizeResult } from './result.js';
import type { ResolvedRequest } from './providers/adapter.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../tests/fixtures/pixel-1x1.png.base64.js';

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
  prompt: 'a cat',
  n: 1,
};

const timings = { start: 1000, finish: 1500 };

describe('normalizeResult — generateImage path', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('produces ImageGenResult shape (§3.5) from byte-bearing output', async () => {
    const aiSdkOutput = {
      images: [
        {
          base64: PIXEL_1X1_BASE64,
          uint8Array: PIXEL_1X1_BYTES,
          mediaType: 'image/png',
        },
      ],
    };
    const result = await normalizeResult(
      { fn: 'generateImage', output: aiSdkOutput },
      baseReq,
      timings,
    );
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.base64).toBe(PIXEL_1X1_BASE64);
    expect(result.images[0]?.uint8Array).toBeInstanceOf(Uint8Array);
    expect(result.images[0]?.mediaType).toBe('image/png');
    expect(result.model).toBe('openai/gpt-image-2');
    expect(result.mode).toBe('gateway');
    expect(result.request.operation).toBe('generate');
    expect(result.request.prompt).toBe('a cat');
    expect(result.request.n).toBe(1);
    expect(result.request.referenceCount).toBe(0);
    expect(result.timings.start).toBe(1000);
    expect(result.timings.finish).toBe(1500);
    expect(result.timings.durationMs).toBe(500);
    expect(result.mask).toBeUndefined();
  });

  test('decodes base64 when uint8Array missing', async () => {
    const aiSdkOutput = {
      images: [{ base64: PIXEL_1X1_BASE64, mediaType: 'image/png' }],
    };
    const result = await normalizeResult(
      { fn: 'generateImage', output: aiSdkOutput },
      baseReq,
      timings,
    );
    expect(result.images[0]?.uint8Array).toBeInstanceOf(Uint8Array);
    expect(result.images[0]?.uint8Array.length).toBe(PIXEL_1X1_BYTES.length);
  });

  test('downloads URL → bytes when output carries a URL', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: async () => PIXEL_1X1_BYTES.buffer,
    } as unknown as Response);
    globalThis.fetch = fakeFetch as unknown as typeof globalThis.fetch;
    const aiSdkOutput = { images: [{ url: 'https://example.com/img.png' }] };
    const result = await normalizeResult(
      { fn: 'generateImage', output: aiSdkOutput },
      baseReq,
      timings,
    );
    expect(fakeFetch).toHaveBeenCalledWith('https://example.com/img.png', expect.anything());
    expect(result.images[0]?.uint8Array).toBeInstanceOf(Uint8Array);
    expect(result.images[0]?.mediaType).toBe('image/png');
    expect(result.images[0]?.base64).toBeTruthy();
  });

  test('throws ImageGenProviderError when output has no images', async () => {
    const aiSdkOutput = { images: [] };
    await expect(
      normalizeResult({ fn: 'generateImage', output: aiSdkOutput }, baseReq, timings),
    ).rejects.toThrow(/no images/i);
  });

  test('preserves seed when provider returns one', async () => {
    const aiSdkOutput = {
      images: [
        {
          base64: PIXEL_1X1_BASE64,
          uint8Array: PIXEL_1X1_BYTES,
          mediaType: 'image/png',
          seed: 12345,
        },
      ],
    };
    const result = await normalizeResult(
      { fn: 'generateImage', output: aiSdkOutput },
      baseReq,
      timings,
    );
    expect(result.images[0]?.seed).toBe(12345);
  });
});
