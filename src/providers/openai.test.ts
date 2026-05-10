import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createOpenAIDirectAdapter } from './openai.js';
import type { ResolvedRequest } from './adapter.js';

const imageHandle = { __image: true, model: 'gpt-image-2' };
const imageFactory = vi.fn(() => imageHandle);
const createOpenAIMock = vi.fn(() => ({ image: imageFactory }));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock,
}));

const baseReq: ResolvedRequest = {
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
};

beforeEach(() => {
  imageFactory.mockClear();
  createOpenAIMock.mockClear();
});

describe('OpenAI direct adapter', () => {
  test('factory dynamic-imports @ai-sdk/openai with apiKey and bakes the model handle', async () => {
    const adapter = await createOpenAIDirectAdapter({ apiKey: 'sk-test', modelName: 'gpt-image-2' });
    expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: 'sk-test' });
    expect(imageFactory).toHaveBeenCalledWith('gpt-image-2');
    expect(adapter.buildCall).toBeTypeOf('function');
  });

  test('buildCall returns generateImage with the pre-built model handle', async () => {
    const adapter = await createOpenAIDirectAdapter({ apiKey: 'sk-test', modelName: 'gpt-image-2' });
    const call = adapter.buildCall(baseReq);
    expect(call.fn).toBe('generateImage');
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.model).toBe(imageHandle);
    expect(call.args.prompt).toBe('a cat');
    expect(call.args.n).toBe(1);
  });

  test('buildCall threads optional fields (size, seed, providerOptions, abortSignal)', async () => {
    const adapter = await createOpenAIDirectAdapter({ apiKey: 'sk-test', modelName: 'gpt-image-2' });
    const ctrl = new AbortController();
    const call = adapter.buildCall({
      ...baseReq,
      size: '1024x1024',
      seed: 7,
      providerOptions: { quality: 'high' },
      signal: ctrl.signal,
    });
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.size).toBe('1024x1024');
    expect(call.args.seed).toBe(7);
    expect(call.args.providerOptions).toEqual({ quality: 'high' });
    expect(call.args.abortSignal).toBe(ctrl.signal);
  });
});
