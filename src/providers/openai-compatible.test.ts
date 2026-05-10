import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createOpenAICompatibleAdapter } from './openai-compatible.js';
import type { ResolvedRequest } from './adapter.js';

const imageHandle = { __image: true, model: 'gpt-5.4-image' };
const imageFactory = vi.fn(() => imageHandle);
const createOAICompat = vi.fn(() => ({ imageModel: imageFactory }));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: createOAICompat,
}));

const baseReq: ResolvedRequest = {
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
};

beforeEach(() => {
  imageFactory.mockClear();
  createOAICompat.mockClear();
});

describe('OpenAI-compatible adapter', () => {
  test('factory dynamic-imports @ai-sdk/openai-compatible with full config', async () => {
    const adapter = await createOpenAICompatibleAdapter({
      baseURL: 'http://localhost:20128/v1',
      apiKey: 'unused',
      name: 'cx',
      modelName: 'gpt-5.4-image',
    });
    expect(createOAICompat).toHaveBeenCalledWith({
      baseURL: 'http://localhost:20128/v1',
      apiKey: 'unused',
      name: 'cx',
    });
    expect(imageFactory).toHaveBeenCalledWith('gpt-5.4-image');
    expect(adapter.buildCall).toBeTypeOf('function');
  });

  test('buildCall returns generateImage with handle and prompt', async () => {
    const adapter = await createOpenAICompatibleAdapter({
      baseURL: 'http://x/v1',
      apiKey: '',
      name: 'cx',
      modelName: 'gpt-5.4-image',
    });
    const call = adapter.buildCall(baseReq);
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.model).toBe(imageHandle);
    expect(call.args.prompt).toBe('a cat');
  });
});
