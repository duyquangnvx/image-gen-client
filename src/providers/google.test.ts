import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createGoogleDirectAdapter } from './google.js';
import type { ResolvedRequest } from './adapter.js';

const imageHandle = { __image: true, model: 'imagen-4' };
const imageFactory = vi.fn(() => imageHandle);
const createGoogleMock = vi.fn(() => ({ image: imageFactory }));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: createGoogleMock,
}));

const baseReq: ResolvedRequest = {
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
};

beforeEach(() => {
  imageFactory.mockClear();
  createGoogleMock.mockClear();
});

describe('Google direct adapter', () => {
  test('factory dynamic-imports @ai-sdk/google and bakes the image handle', async () => {
    const adapter = await createGoogleDirectAdapter({ apiKey: 'k', modelName: 'imagen-4' });
    expect(createGoogleMock).toHaveBeenCalledWith({ apiKey: 'k' });
    expect(imageFactory).toHaveBeenCalledWith('imagen-4');
    expect(adapter.buildCall).toBeTypeOf('function');
  });

  test('buildCall returns generateImage with handle and prompt', async () => {
    const adapter = await createGoogleDirectAdapter({ apiKey: 'k', modelName: 'imagen-4' });
    const call = adapter.buildCall(baseReq);
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.model).toBe(imageHandle);
    expect(call.args.prompt).toBe('a cat');
    expect(call.args.n).toBe(1);
  });
});
