import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createDefaultAdapter } from './default.js';
import type { ResolvedRequest } from './adapter.js';

vi.mock('ai', () => ({
  generateImage: vi.fn(),
}));

describe('default adapter — gateway + generateImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('buildCall returns generateImage shape with model string for gateway', () => {
    const adapter = createDefaultAdapter();
    const req: ResolvedRequest = {
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
    const call = adapter.buildCall(req);
    expect(call.fn).toBe('generateImage');
    expect(call.args.model).toBe('openai/gpt-image-2');
    expect(call.args.prompt).toBe('a cat');
    expect(call.args.n).toBe(1);
  });

  test('buildCall passes size when present', () => {
    const adapter = createDefaultAdapter();
    const req: ResolvedRequest = {
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
      n: 2,
      size: '1024x1024',
      seed: 42,
    };
    const call = adapter.buildCall(req);
    if (call.fn === 'generateImage') {
      expect(call.args.size).toBe('1024x1024');
      expect(call.args.seed).toBe(42);
      expect(call.args.n).toBe(2);
    } else {
      throw new Error('expected generateImage call');
    }
  });

  test('buildCall throws for direct mode (slice-1 boundary)', () => {
    const adapter = createDefaultAdapter();
    const req: ResolvedRequest = {
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
    expect(() => adapter.buildCall(req)).toThrow(/direct mode/i);
  });

  test('buildCall throws for generateText apiPath (slice-1 boundary)', () => {
    const adapter = createDefaultAdapter();
    const req: ResolvedRequest = {
      operation: 'generate',
      modelId: 'google/gemini-2.5-flash-image',
      mode: 'gateway',
      apiPath: 'generateText',
      capability: {
        textToImage: true,
        imageEdit: true,
        multiReference: true,
        transparentBackground: false,
        maxN: 1,
        supportsSeed: false,
        supportsNegativePrompt: false,
        apiPath: 'generateText',
      },
      prompt: 'a cat',
      n: 1,
    };
    expect(() => adapter.buildCall(req)).toThrow(/generateText/i);
  });
});
