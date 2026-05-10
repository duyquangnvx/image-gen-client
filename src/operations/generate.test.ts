import { describe, expect, test, vi, beforeEach } from 'vitest';
import { runGenerate } from './generate.js';
import { ImageGenConfigError, ImageGenValidationError, ImageGenNetworkError, ImageGenProviderError } from '../errors.js';
import type { GenerateInput, ImageGenResult } from '../types.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../../tests/fixtures/pixel-1x1.png.base64.js';
import { mapAiSdkError } from './generate.js';
import {
  RateLimitError,
  AuthError,
  ContentPolicyError,
  ModelUnavailableError,
} from '../errors.js';

vi.mock('ai', () => ({
  generateImage: vi.fn(),
}));

import { generateImage } from 'ai';

describe('runGenerate — slice 1', () => {
  beforeEach(() => {
    vi.mocked(generateImage).mockReset();
  });

  test('happy path: builds request, runs chain, returns ImageGenResult', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        {
          base64: PIXEL_1X1_BASE64,
          uint8Array: PIXEL_1X1_BYTES,
          mediaType: 'image/png',
        },
      ],
    } as never);

    const input: GenerateInput = { prompt: 'a cat' };
    const result: ImageGenResult = await runGenerate({
      input,
      config: {
        mode: 'auto',
        defaultModel: 'openai/gpt-image-2',
        timeoutMs: 120_000,
        gatewayApiKey: 'k',
      },
      env: { AI_GATEWAY_API_KEY: 'k' },
    });

    expect(result.model).toBe('openai/gpt-image-2');
    expect(result.mode).toBe('gateway');
    expect(result.request.operation).toBe('generate');
    expect(result.request.prompt).toBe('a cat');
    expect(result.images).toHaveLength(1);
    expect(generateImage).toHaveBeenCalledOnce();
  });

  test('config error when no model resolvable', async () => {
    await expect(
      runGenerate({
        input: { prompt: 'a cat' },
        config: { mode: 'auto', timeoutMs: 120_000, gatewayApiKey: 'k' },
        env: { AI_GATEWAY_API_KEY: 'k' },
      }),
    ).rejects.toBeInstanceOf(ImageGenConfigError);
  });

  test('config error when model not in registry', async () => {
    await expect(
      runGenerate({
        input: { prompt: 'a cat', model: 'nope/missing' },
        config: { mode: 'auto', timeoutMs: 120_000, gatewayApiKey: 'k' },
        env: { AI_GATEWAY_API_KEY: 'k' },
      }),
    ).rejects.toBeInstanceOf(ImageGenConfigError);
  });

  test('validation error bubbles up before AI SDK is called', async () => {
    await expect(
      runGenerate({
        input: { prompt: '', model: 'openai/gpt-image-2' },
        config: { mode: 'auto', timeoutMs: 120_000, gatewayApiKey: 'k' },
        env: { AI_GATEWAY_API_KEY: 'k' },
      }),
    ).rejects.toBeInstanceOf(ImageGenValidationError);
    expect(generateImage).not.toHaveBeenCalled();
  });

  test('maps fetch/network errors to ImageGenNetworkError', async () => {
    vi.mocked(generateImage).mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));
    try {
      await runGenerate({
        input: { prompt: 'a cat' },
        config: {
          mode: 'auto',
          defaultModel: 'openai/gpt-image-2',
          timeoutMs: 120_000,
          gatewayApiKey: 'k',
        },
        env: { AI_GATEWAY_API_KEY: 'k' },
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ImageGenNetworkError);
      const e = err as ImageGenNetworkError;
      expect(e.code).toBe('NETWORK_ERROR');
      expect(e.modelId).toBe('openai/gpt-image-2');
    }
  });

  test('maps non-network errors to ImageGenProviderError', async () => {
    vi.mocked(generateImage).mockRejectedValue(new Error('something went wrong'));
    try {
      await runGenerate({
        input: { prompt: 'a cat' },
        config: {
          mode: 'auto',
          defaultModel: 'openai/gpt-image-2',
          timeoutMs: 120_000,
          gatewayApiKey: 'k',
        },
        env: { AI_GATEWAY_API_KEY: 'k' },
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ImageGenProviderError);
      const e = err as ImageGenProviderError;
      expect(e.code).toBe('PROVIDER_ERROR');
    }
  });

  test('maps non-Error throwables to ImageGenProviderError', async () => {
    vi.mocked(generateImage).mockRejectedValue('whoops');
    try {
      await runGenerate({
        input: { prompt: 'a cat' },
        config: {
          mode: 'auto',
          defaultModel: 'openai/gpt-image-2',
          timeoutMs: 120_000,
          gatewayApiKey: 'k',
        },
        env: { AI_GATEWAY_API_KEY: 'k' },
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ImageGenProviderError);
      const e = err as ImageGenProviderError;
      expect(e.code).toBe('PROVIDER_ERROR');
      expect(e.message).toContain('whoops');
    }
  });

  test('passes AbortError through unwrapped', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    vi.mocked(generateImage).mockRejectedValue(abortErr);
    await expect(
      runGenerate({
        input: { prompt: 'a cat' },
        config: {
          mode: 'auto',
          defaultModel: 'openai/gpt-image-2',
          timeoutMs: 120_000,
          gatewayApiKey: 'k',
        },
        env: { AI_GATEWAY_API_KEY: 'k' },
      }),
    ).rejects.toBe(abortErr);
  });
});

const ctx = { modelId: 'openai/gpt-image-2' as const, mode: 'direct' as const };

interface FakeApiError extends Error {
  statusCode?: number;
  data?: { error?: { code?: string } };
}

function makeApiError(status: number, code = 'PROVIDER'): FakeApiError {
  const e = new Error(`API ${status}`) as FakeApiError;
  e.name = 'AI_APICallError';
  e.statusCode = status;
  e.data = { error: { code } };
  return e;
}

describe('mapAiSdkError — HTTP status → subtype (slice 2)', () => {
  test('429 → RateLimitError', () => {
    const out = mapAiSdkError(makeApiError(429), {
      ...ctx,
      operation: 'generate',
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
      n: 1,
    });
    expect(out).toBeInstanceOf(RateLimitError);
    expect((out as RateLimitError).code).toBe('RATE_LIMIT');
  });

  test('401 → AuthError', () => {
    const out = mapAiSdkError(makeApiError(401), {
      ...ctx,
      operation: 'generate',
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
      n: 1,
    });
    expect(out).toBeInstanceOf(AuthError);
  });

  test('403 → AuthError', () => {
    const out = mapAiSdkError(makeApiError(403), {
      ...ctx,
      operation: 'generate',
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
      n: 1,
    });
    expect(out).toBeInstanceOf(AuthError);
  });

  test('404 → ModelUnavailableError MODEL_NOT_FOUND retryable=false', () => {
    const out = mapAiSdkError(makeApiError(404), {
      ...ctx,
      operation: 'generate',
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
      n: 1,
    });
    expect(out).toBeInstanceOf(ModelUnavailableError);
    expect((out as ModelUnavailableError).code).toBe('MODEL_NOT_FOUND');
    expect((out as ModelUnavailableError).retryable).toBe(false);
  });

  test('503 → ModelUnavailableError MODEL_UNAVAILABLE retryable=true', () => {
    const out = mapAiSdkError(makeApiError(503), {
      ...ctx,
      operation: 'generate',
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
      n: 1,
    });
    expect(out).toBeInstanceOf(ModelUnavailableError);
    expect((out as ModelUnavailableError).code).toBe('MODEL_UNAVAILABLE');
    expect((out as ModelUnavailableError).retryable).toBe(true);
  });

  test('400 + content_policy_violation code → ContentPolicyError', () => {
    const out = mapAiSdkError(makeApiError(400, 'content_policy_violation'), {
      ...ctx,
      operation: 'generate',
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
      n: 1,
    });
    expect(out).toBeInstanceOf(ContentPolicyError);
  });
});
