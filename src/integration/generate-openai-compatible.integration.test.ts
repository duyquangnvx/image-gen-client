import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createClient, defineModel } from '../index.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../../tests/fixtures/pixel-1x1.png.base64.js';

const cxImage = vi.fn(() => ({ __h: 'cx-handle' }));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => ({ imageModel: cxImage })),
}));

vi.mock('ai', () => ({
  generateImage: vi.fn(),
}));

import { generateImage } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

beforeEach(() => {
  vi.mocked(generateImage).mockReset();
  vi.mocked(createOpenAICompatible).mockClear();
  cxImage.mockClear();
});

describe('openai-compatible integration (slice 2) — cx local', () => {
  test('register cx/gpt-5.4-image and generate via openai-compatible adapter', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        {
          base64: PIXEL_1X1_BASE64,
          uint8Array: PIXEL_1X1_BYTES,
          mediaType: 'image/png',
        },
      ],
    } as never);

    const cx = defineModel('cx/gpt-5.4-image', 'cx', {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      transparentBackground: false,
      maxN: 1,
      supportsSeed: false,
      supportsNegativePrompt: false,
      apiPath: 'generateImage',
    });

    const client = createClient(
      {
        mode: 'direct',
        providers: {
          cx: {
            kind: 'openai-compatible',
            baseURL: 'http://localhost:20128/v1',
            apiKey: 'unused',
            name: 'cx',
          },
        },
        models: { 'cx/gpt-5.4-image': cx },
        defaultModel: 'cx/gpt-5.4-image',
      },
      {},
    );

    const result = await client.generate({ prompt: 'a red apple' });

    expect(result.model).toBe('cx/gpt-5.4-image');
    expect(result.mode).toBe('direct');
    expect(result.images[0]?.mediaType).toBe('image/png');
    expect(createOpenAICompatible).toHaveBeenCalledWith({
      baseURL: 'http://localhost:20128/v1',
      apiKey: 'unused',
      name: 'cx',
    });
    expect(cxImage).toHaveBeenCalledWith('gpt-5.4-image');
  });

  test('unknown model id throws CONFIG_UNKNOWN_MODEL before any network', async () => {
    const client = createClient(
      {
        mode: 'direct',
        providers: { cx: { kind: 'openai-compatible', baseURL: 'http://x/v1' } },
        defaultModel: 'cx/not-registered' as `${string}/${string}`,
      },
      {},
    );

    await expect(client.generate({ prompt: 'a cat' })).rejects.toMatchObject({
      code: 'CONFIG_UNKNOWN_MODEL',
    });
    expect(generateImage).not.toHaveBeenCalled();
  });
});
