import { afterEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveToFile } from './save-to-file.js';
import type { GeneratedImage } from '../types.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../../tests/fixtures/pixel-1x1.png.base64.js';

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('saveToFile', () => {
  test('writes the image bytes to disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'image-gen-test-'));
    tmpDirs.push(dir);
    const filePath = join(dir, 'out.png');
    const img: GeneratedImage = {
      base64: PIXEL_1X1_BASE64,
      uint8Array: PIXEL_1X1_BYTES,
      mediaType: 'image/png',
    };
    await saveToFile(img, filePath);
    const onDisk = readFileSync(filePath);
    expect(onDisk.equals(Buffer.from(PIXEL_1X1_BYTES))).toBe(true);
  });
});
