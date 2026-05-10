import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '../index.js';
import { saveToFile, toBuffer } from '../utils/index.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../../tests/fixtures/pixel-1x1.png.base64.js';

vi.mock('ai', () => ({
  generateImage: vi.fn(),
}));

import { generateImage } from 'ai';

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  vi.mocked(generateImage).mockReset();
});

describe('integration: createClient → generate → saveToFile', () => {
  test('full slice-1 flow with AI SDK mocked', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        {
          base64: PIXEL_1X1_BASE64,
          uint8Array: PIXEL_1X1_BYTES,
          mediaType: 'image/png',
          width: 1,
          height: 1,
          seed: 42,
        },
      ],
      providerMetadata: { foo: 'bar' },
    } as never);

    const logs: string[] = [];
    const client = createClient(
      {
        defaultModel: 'openai/gpt-image-2',
        logger: (level, message) => logs.push(`${level}:${message}`),
      },
      { AI_GATEWAY_API_KEY: 'k' },
    );

    const result = await client.generate({ prompt: 'a cat in a hat' });

    // §3.5 result shape
    expect(result.images).toHaveLength(1);
    const img = result.images[0];
    expect(img).toBeDefined();
    expect(img?.base64).toBe(PIXEL_1X1_BASE64);
    expect(img?.uint8Array).toBeInstanceOf(Uint8Array);
    expect(img?.mediaType).toBe('image/png');
    expect(img?.width).toBe(1);
    expect(img?.height).toBe(1);
    expect(img?.seed).toBe(42);

    expect(result.model).toBe('openai/gpt-image-2');
    expect(result.mode).toBe('gateway');
    expect(result.request.operation).toBe('generate');
    expect(result.request.prompt).toBe('a cat in a hat');
    expect(result.request.n).toBe(1);
    expect(result.request.referenceCount).toBe(0);
    expect(result.providerMetadata).toEqual({ foo: 'bar' });
    expect(result.timings.start).toBeGreaterThan(0);
    expect(result.timings.finish).toBeGreaterThanOrEqual(result.timings.start);
    expect(result.timings.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.mask).toBeUndefined();

    // logging middleware fired
    expect(logs.some((l) => l.startsWith('info:image-gen start'))).toBe(true);
    expect(logs.some((l) => l.startsWith('info:image-gen finish'))).toBe(true);

    // utils helpers integrate
    if (!img) throw new Error('img missing');
    const buf = toBuffer(img);
    expect(buf.equals(Buffer.from(PIXEL_1X1_BYTES))).toBe(true);

    const dir = mkdtempSync(join(tmpdir(), 'image-gen-int-'));
    tmpDirs.push(dir);
    const filePath = join(dir, 'cat.png');
    await saveToFile(img, filePath);
    expect(readFileSync(filePath).equals(Buffer.from(PIXEL_1X1_BYTES))).toBe(true);

    // AI SDK was called once with the gateway-style model id
    expect(generateImage).toHaveBeenCalledOnce();
    expect(vi.mocked(generateImage).mock.calls[0]?.[0]).toMatchObject({
      model: 'openai/gpt-image-2',
      prompt: 'a cat in a hat',
      n: 1,
    });
  });
});
