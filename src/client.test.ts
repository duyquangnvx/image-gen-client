import { describe, expect, test, vi, beforeEach } from 'vitest';
import { Client } from './client.js';
import { ImageGenConfigError } from './errors.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../tests/fixtures/pixel-1x1.png.base64.js';

vi.mock('ai', () => ({ generateImage: vi.fn() }));

import { generateImage } from 'ai';

describe('Client — slice 1', () => {
  beforeEach(() => {
    vi.mocked(generateImage).mockReset();
  });

  test('generate returns normalized result with mocked AI SDK', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        { base64: PIXEL_1X1_BASE64, uint8Array: PIXEL_1X1_BYTES, mediaType: 'image/png' },
      ],
    } as never);

    const client = new Client(
      { defaultModel: 'openai/gpt-image-2' },
      { AI_GATEWAY_API_KEY: 'k' },
    );
    const result = await client.generate({ prompt: 'a cat' });
    expect(result.images).toHaveLength(1);
    expect(result.model).toBe('openai/gpt-image-2');
  });

  test('generate without defaultModel throws config error', async () => {
    const client = new Client({}, { AI_GATEWAY_API_KEY: 'k' });
    await expect(client.generate({ prompt: 'a cat' })).rejects.toBeInstanceOf(ImageGenConfigError);
  });

  test('generate without gateway key falls back to direct mode (slice 2)', async () => {
    const client = new Client({ defaultModel: 'openai/gpt-image-2' }, {});
    await expect(client.generate({ prompt: 'a cat' })).rejects.toThrow();
  });

  test('logger is invoked when provided', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        { base64: PIXEL_1X1_BASE64, uint8Array: PIXEL_1X1_BYTES, mediaType: 'image/png' },
      ],
    } as never);
    const calls: string[] = [];
    const client = new Client(
      {
        defaultModel: 'openai/gpt-image-2',
        logger: (level, message) => calls.push(`${level}:${message}`),
      },
      { AI_GATEWAY_API_KEY: 'k' },
    );
    await client.generate({ prompt: 'a cat' });
    expect(calls.some((c) => c.startsWith('info:image-gen start'))).toBe(true);
    expect(calls.some((c) => c.startsWith('info:image-gen finish'))).toBe(true);
  });
});
