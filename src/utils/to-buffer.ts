import type { GeneratedImage } from '../types.js';

export function toBuffer(image: GeneratedImage): Buffer {
  return Buffer.from(image.uint8Array);
}
