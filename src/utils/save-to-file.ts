import { writeFile } from 'node:fs/promises';
import type { GeneratedImage } from '../types.js';

export async function saveToFile(image: GeneratedImage, path: string): Promise<void> {
  await writeFile(path, image.uint8Array);
}
