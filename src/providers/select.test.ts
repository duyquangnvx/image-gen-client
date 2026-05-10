import { describe, expect, test, vi, beforeEach } from 'vitest';
import { selectAdapter } from './select.js';
import { ImageGenConfigError } from '../errors.js';

const openaiHandle = { __h: 'openai' };
const googleHandle = { __h: 'google' };
const oaiCompatHandle = { __h: 'oaicompat' };

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({ image: vi.fn(() => openaiHandle) })),
}));
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => ({ image: vi.fn(() => googleHandle) })),
}));
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => ({ imageModel: vi.fn(() => oaiCompatHandle) })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('selectAdapter', () => {
  test('gateway returns the default adapter (sync-resolved)', async () => {
    const adapter = await selectAdapter(
      { providerKey: 'openai', mode: 'gateway' },
      { modelId: 'openai/gpt-image-2', modelName: 'gpt-image-2' },
    );
    const call = adapter.buildCall({
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
    });
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.model).toBe('openai/gpt-image-2');
  });

  test('direct + native + openai uses the OpenAI adapter', async () => {
    const adapter = await selectAdapter(
      { providerKey: 'openai', mode: 'direct', kind: 'native', apiKey: 'k' },
      { modelId: 'openai/gpt-image-2', modelName: 'gpt-image-2' },
    );
    const call = adapter.buildCall({
      operation: 'generate',
      modelId: 'openai/gpt-image-2',
      mode: 'direct',
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
    });
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.model).toBe(openaiHandle);
  });

  test('direct + native + google uses the Google adapter', async () => {
    const adapter = await selectAdapter(
      { providerKey: 'google', mode: 'direct', kind: 'native', apiKey: 'k' },
      { modelId: 'google/imagen-4', modelName: 'imagen-4' },
    );
    const call = adapter.buildCall({
      operation: 'generate',
      modelId: 'google/imagen-4',
      mode: 'direct',
      apiPath: 'generateImage',
      capability: {
        textToImage: true,
        imageEdit: false,
        multiReference: false,
        transparentBackground: false,
        maxN: 4,
        supportsSeed: true,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      },
      prompt: 'a cat',
      n: 1,
    });
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.model).toBe(googleHandle);
  });

  test('direct + openai-compatible uses the openai-compatible adapter', async () => {
    const adapter = await selectAdapter(
      {
        providerKey: 'cx',
        mode: 'direct',
        kind: 'openai-compatible',
        apiKey: 'k',
        baseURL: 'http://localhost/v1',
        name: 'cx',
      },
      { modelId: 'cx/gpt-5.4-image', modelName: 'gpt-5.4-image' },
    );
    const call = adapter.buildCall({
      operation: 'generate',
      modelId: 'cx/gpt-5.4-image',
      mode: 'direct',
      apiPath: 'generateImage',
      capability: {
        textToImage: true,
        imageEdit: false,
        multiReference: false,
        transparentBackground: false,
        maxN: 1,
        supportsSeed: false,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      },
      prompt: 'a cat',
      n: 1,
    });
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.model).toBe(oaiCompatHandle);
  });

  test('direct + native + unknown provider key throws CONFIG_UNSUPPORTED_PROVIDER', async () => {
    await expect(
      selectAdapter(
        { providerKey: 'unknown', mode: 'direct', kind: 'native', apiKey: 'k' },
        { modelId: 'unknown/foo', modelName: 'foo' },
      ),
    ).rejects.toBeInstanceOf(ImageGenConfigError);
  });
});
