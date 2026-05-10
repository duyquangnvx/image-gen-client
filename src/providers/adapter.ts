import type {
  ApiPath,
  Capability,
  Mode,
  ModelId,
  RequestOperation,
} from '../types.js';
import type { ImageGenError } from '../errors.js';

export interface ResolvedRequest {
  readonly operation: RequestOperation;
  readonly modelId: ModelId;
  readonly mode: Mode;
  readonly apiPath: ApiPath;
  readonly capability: Capability;
  readonly prompt?: string;
  readonly negativePrompt?: string;
  readonly size?: string;
  readonly aspectRatio?: string;
  readonly n: number;
  readonly seed?: number;
  readonly background?: 'opaque' | 'transparent';
  readonly format?: 'png' | 'webp' | 'jpeg';
  readonly references?: readonly Uint8Array[];
  readonly mask?: Uint8Array;
  readonly providerOptions?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

// AI SDK v6 generateImage args (slice-1 subset). Verified against ai@6.0.177:
// model is `string | ImageModelV3 | ImageModelV2` — the gateway path passes a
// gateway-style id string; native/openai-compatible adapters pass the SDK's
// opaque ImageModel handle. We type it `unknown` here so each adapter can pass
// whichever shape its provider expects without `as` casts; the terminal handler
// in operations/generate.ts re-casts to the SDK's parameter type at the call site.
// size is `${number}x${number}` in the SDK; we use string here at the adapter boundary
// since validation has already checked the format upstream.
export interface GenerateImageArgs {
  readonly model: unknown;
  readonly prompt: string;
  readonly n?: number;
  readonly size?: string;
  readonly seed?: number;
  readonly providerOptions?: Readonly<Record<string, unknown>>;
  readonly abortSignal?: AbortSignal;
}

// Slice-1 stub: generateText path lands in slice 2 alongside Gemini support.
export interface GenerateTextArgs {
  readonly model: string;
  readonly prompt: string;
  readonly abortSignal?: AbortSignal;
}

export type AdapterCall =
  | { readonly fn: 'generateImage'; readonly args: GenerateImageArgs }
  | { readonly fn: 'generateText'; readonly args: GenerateTextArgs };

// Slice 1 ships only buildCall + optional mapError. parseResponse joins the
// interface in slice 2 when per-provider response shapes diverge; until then,
// the terminal handler in operations/generate.ts calls normalizeResult directly.
export interface ProviderAdapter {
  buildCall(req: ResolvedRequest): AdapterCall;
  mapError?(err: unknown, req: ResolvedRequest): ImageGenError | undefined;
}
