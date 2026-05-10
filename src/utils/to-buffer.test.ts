import { describe, expect, test } from 'vitest';
import { toBuffer } from './to-buffer.js';
import type { GeneratedImage } from '../types.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../../tests/fixtures/pixel-1x1.png.base64.js';

describe('toBuffer', () => {
  test('returns a Node Buffer with the same bytes as uint8Array', () => {
    const img: GeneratedImage = {
      base64: PIXEL_1X1_BASE64,
      uint8Array: PIXEL_1X1_BYTES,
      mediaType: 'image/png',
    };
    const buf = toBuffer(img);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.equals(Buffer.from(PIXEL_1X1_BYTES))).toBe(true);
  });
});
