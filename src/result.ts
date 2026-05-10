import { ImageGenProviderError } from './errors.js';
import type { GeneratedImage, ImageGenResult } from './types.js';
import type { ResolvedRequest } from './providers/adapter.js';

interface RawImage {
  readonly base64?: string;
  readonly uint8Array?: Uint8Array;
  readonly url?: string;
  readonly mediaType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
}

interface RawGenerateImageOutput {
  readonly images?: readonly RawImage[];
  readonly providerMetadata?: Readonly<Record<string, unknown>>;
}

export type RawAiSdkOutput =
  | { readonly fn: 'generateImage'; readonly output: unknown }
  | { readonly fn: 'generateText'; readonly output: unknown };

export interface Timings {
  readonly start: number;
  readonly finish: number;
}

export async function normalizeResult(
  raw: RawAiSdkOutput,
  req: ResolvedRequest,
  timings: Timings,
): Promise<ImageGenResult> {
  if (raw.fn !== 'generateImage') {
    throw new Error('generateText path lands in slice 2');
  }
  const out = raw.output as RawGenerateImageOutput;
  const rawImages = out.images ?? [];
  if (rawImages.length === 0) {
    throw new ImageGenProviderError(
      'provider returned no images',
      'PROVIDER_NO_IMAGES',
      { modelId: req.modelId, mode: req.mode },
    );
  }

  const images: GeneratedImage[] = await Promise.all(rawImages.map((img) => normalizeImage(img)));

  return {
    images,
    model: req.modelId,
    mode: req.mode,
    request: {
      operation: req.operation,
      ...(req.prompt !== undefined && { prompt: req.prompt }),
      ...(req.size !== undefined && { size: req.size }),
      ...(req.aspectRatio !== undefined && { aspectRatio: req.aspectRatio }),
      n: req.n,
      ...(req.seed !== undefined && { seed: req.seed }),
      referenceCount: req.references?.length ?? 0,
    },
    timings: {
      start: timings.start,
      finish: timings.finish,
      durationMs: timings.finish - timings.start,
    },
    ...(out.providerMetadata !== undefined && { providerMetadata: out.providerMetadata }),
  };
}

async function normalizeImage(raw: RawImage): Promise<GeneratedImage> {
  let uint8Array: Uint8Array | undefined = raw.uint8Array;
  let base64: string | undefined = raw.base64;
  let mediaType = raw.mediaType ?? 'image/png';

  if (uint8Array === undefined && base64 !== undefined) {
    uint8Array = Uint8Array.from(Buffer.from(base64, 'base64'));
  }

  // §3.5: If a provider returns a URL, download bytes before returning so callers
  // never have to handle expiring URLs.
  if (uint8Array === undefined && raw.url !== undefined) {
    const downloaded = await downloadUrl(raw.url);
    uint8Array = downloaded.bytes;
    mediaType = downloaded.mediaType ?? mediaType;
  }

  if (uint8Array === undefined) {
    throw new ImageGenProviderError(
      'provider image had neither bytes nor URL',
      'PROVIDER_EMPTY_IMAGE',
    );
  }

  if (base64 === undefined) {
    base64 = Buffer.from(uint8Array).toString('base64');
  }

  return {
    base64,
    uint8Array,
    mediaType,
    ...(raw.width !== undefined && { width: raw.width }),
    ...(raw.height !== undefined && { height: raw.height }),
    ...(raw.seed !== undefined && { seed: raw.seed }),
  };
}

async function downloadUrl(url: string): Promise<{ bytes: Uint8Array; mediaType?: string }> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new ImageGenProviderError(
      `failed to download image: ${response.status} ${response.statusText}`,
      'PROVIDER_DOWNLOAD_FAILED',
    );
  }
  const buf = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') ?? undefined;
  return {
    bytes: new Uint8Array(buf),
    ...(contentType !== undefined && { mediaType: contentType }),
  };
}
