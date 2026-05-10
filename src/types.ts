// §15.6 commitment 1+2: Capability.transforms? + TransformKind exported.
export type TransformKind = 'remove-background' | 'upscale' | 'restore' | 'outpaint';

// §15.6 commitment 3: operation discriminator. v1 values only; future transforms extend.
export type RequestOperation = 'generate' | 'edit' | 'variations';

// Canonical model id format §3.3.
export type ModelId = `${string}/${string}`;

export type Mode = 'gateway' | 'direct';
export type ApiPath = 'generateImage' | 'generateText';

// §3.4 Capability descriptor.
export interface Capability {
  readonly textToImage: boolean;
  readonly imageEdit: boolean;
  readonly multiReference: boolean;
  readonly transparentBackground: boolean;
  readonly aspectRatios?: readonly string[];
  readonly sizes?: readonly string[];
  readonly maxN: number;
  readonly supportsSeed: boolean;
  readonly supportsNegativePrompt: boolean;
  readonly defaultSize?: string;
  readonly defaultAspectRatio?: string;
  readonly apiPath: ApiPath;
  readonly transforms?: readonly TransformKind[];
}

// §3.5 GeneratedImage shape.
export interface GeneratedImage {
  readonly base64: string;
  readonly uint8Array: Uint8Array;
  readonly mediaType: string;
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
}

// §3.5 Result.request shape.
export interface ResultRequest {
  readonly operation: RequestOperation;
  readonly prompt?: string;
  readonly size?: string;
  readonly aspectRatio?: string;
  readonly n: number;
  readonly seed?: number;
  readonly referenceCount: number;
}

// §3.5 normalized result shape.
export interface ImageGenResult {
  readonly images: readonly GeneratedImage[];
  readonly model: ModelId;
  readonly mode: Mode;
  readonly request: ResultRequest;
  readonly mask?: GeneratedImage;
  readonly providerMetadata?: Readonly<Record<string, unknown>>;
  readonly timings: {
    readonly start: number;
    readonly finish: number;
    readonly durationMs: number;
  };
}

// §4.2 generate inputs.
export interface GenerateInput {
  readonly model?: ModelId;
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly size?: string;
  readonly aspectRatio?: string;
  readonly n?: number;
  readonly seed?: number;
  readonly background?: 'opaque' | 'transparent';
  readonly format?: 'png' | 'webp' | 'jpeg';
  readonly providerOptions?: Readonly<Record<string, unknown>>;
  readonly mode?: Mode;
  readonly signal?: AbortSignal;
}

// Logging surface (§4.1).
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Logger = (level: LogLevel, message: string, meta?: Record<string, unknown>) => void;

// §4.1 client construction options (slice-1 subset; expanded in later slices).
export interface ClientOptions {
  readonly mode?: Mode | 'auto';
  readonly defaultModel?: ModelId;
  readonly logger?: Logger;
  readonly timeoutMs?: number;
  readonly gateway?: {
    readonly apiKey?: string;
    readonly baseURL?: string;
  };
}
