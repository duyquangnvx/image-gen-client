import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createClient } from '../index.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../../tests/fixtures/pixel-1x1.png.base64.js';

const openaiImage = vi.fn(() => ({ __h: 'openai-handle' }));
const googleImage = vi.fn(() => ({ __h: 'google-handle' }));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({ image: openaiImage })),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => ({ image: googleImage })),
}));

vi.mock('ai', () => ({
  generateImage: vi.fn(),
}));

import { generateImage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

beforeEach(() => {
  vi.mocked(generateImage).mockReset();
  vi.mocked(createOpenAI).mockClear();
  vi.mocked(createGoogleGenerativeAI).mockClear();
  openaiImage.mockClear();
  googleImage.mockClear();
});

describe('direct-mode integration (slice 2) — OpenAI', () => {
  test('createClient direct + openai/gpt-image-2 → generate → normalized result', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        {
          base64: PIXEL_1X1_BASE64,
          uint8Array: PIXEL_1X1_BYTES,
          mediaType: 'image/png',
          width: 1,
          height: 1,
        },
      ],
    } as never);

    const client = createClient(
      {
        mode: 'direct',
        providers: { openai: { apiKey: 'sk-x' } },
        defaultModel: 'openai/gpt-image-2',
      },
      {},
    );

    const result = await client.generate({ prompt: 'a cat' });

    expect(result.model).toBe('openai/gpt-image-2');
    expect(result.mode).toBe('direct');
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.mediaType).toBe('image/png');
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: 'sk-x' });
    expect(openaiImage).toHaveBeenCalledWith('gpt-image-2');
  });

  test('OPENAI_API_KEY env fallback works when providers config is empty', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [{ base64: PIXEL_1X1_BASE64, uint8Array: PIXEL_1X1_BYTES, mediaType: 'image/png' }],
    } as never);

    const client = createClient(
      { mode: 'direct', defaultModel: 'openai/gpt-image-2' },
      { OPENAI_API_KEY: 'sk-env' },
    );

    const result = await client.generate({ prompt: 'a cat' });

    expect(result.mode).toBe('direct');
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: 'sk-env' });
  });
});

describe('direct-mode integration (slice 2) — Google', () => {
  test('createClient direct + google/imagen-4.0-generate-001 → generate → normalized result', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        { base64: PIXEL_1X1_BASE64, uint8Array: PIXEL_1X1_BYTES, mediaType: 'image/png' },
      ],
    } as never);

    const client = createClient(
      {
        mode: 'direct',
        providers: { google: { apiKey: 'g-key' } },
        defaultModel: 'google/imagen-4.0-generate-001',
      },
      {},
    );

    const result = await client.generate({ prompt: 'a cat' });

    expect(result.model).toBe('google/imagen-4.0-generate-001');
    expect(result.mode).toBe('direct');
    expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: 'g-key' });
    expect(googleImage).toHaveBeenCalledWith('imagen-4.0-generate-001');
  });
});
