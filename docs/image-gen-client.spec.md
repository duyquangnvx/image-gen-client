# Requirements Spec — `image-gen-client`

> Status: Draft v0.1 (requirements form)
> Owner: TBD
> Last updated: 2026-05-10

A TypeScript library that wraps Vercel AI SDK to provide a unified, DX-focused image generation client supporting multiple providers (OpenAI, Google, BFL, etc.) and multiple connection modes (Vercel AI Gateway and direct provider keys). CLI and HTTP API are thin wrappers built on the same core.

This document specifies **what** the system must do, not how to build it. Implementation choices — function signatures, type names, internal module layout — are left to the implementing agent. Field names, configuration keys, and method names mentioned below are recommendations that an implementer may adjust to fit the target language or framework idioms; the **behavior** they describe is binding.

---

## 1. Goals & Non-Goals

### 1.1 Goals

- **Unified API surface** for image generation across providers and across AI SDK's two underlying paths (image-only models versus multimodal models that emit images).
- **Dual provider mode**: support both Vercel AI Gateway (namespaced model strings such as `'openai/gpt-image-2'`) and direct provider SDKs within the same client instance.
- **First-class TypeScript DX**: full type inference, sensible defaults, helpful errors, no provider-specific quirks leaked to the caller.
- **Capability-aware**: a central model registry knows what each model supports (sizes, aspect ratios, edit, multi-reference, transparent background, n>1) and validates inputs before hitting the network.
- **Extensible**: register custom models/providers, add middleware (retry, logging, prompt rewriting), and plug in new modalities later.
- **Pure library**: no I/O side effects (no disk writes, no uploads). Caller decides what to do with bytes.
- **CLI and HTTP API are derived**: both are thin wrappers that compose the lib's public API. Anything the CLI can do, the lib can do programmatically.

### 1.2 Non-Goals (v1)

- **Storage / persistence**: no S3/R2/GCS upload, no DB, no cache. Caller handles output.
- **Auth / multi-tenancy**: no end-user accounts, API keys, or RBAC. The lib is consumed inside trusted code.
- **Cost tracking & billing**: no per-call usage logging, quotas, or budget enforcement. Hooks reserved for v2.
- **Client-side image processing**: no resize, crop, watermark, or format conversion beyond what providers natively offer. Distinct from AI-powered image transforms (background removal, upscaling, restoration); those are also out of v1 but are a planned addition — see §15.
- **Video / audio / 3D generation**: image-only.
- **Built-in UI**: no React components, no playground UI. Reference implementations may be shipped separately.

### 1.3 Design Principles

1. **Thin over thick** — if AI SDK already does it correctly, forward; don't re-implement.
2. **Fail fast with clarity** — invalid inputs detected before the network call when possible; errors include actionable next steps.
3. **Defaults that work, escape hatches that don't fight you** — a minimal call (model + prompt) should just work; advanced users can drop down to provider-specific options.
4. **Same shape, different provider** — the result of a generate call has the same shape regardless of provider; provider-specific extras live in a separate, typed metadata field.
5. **Lazy provider loading** — only `ai` and `@ai-sdk/gateway` are required dependencies; provider packages are optional peer dependencies loaded on demand.

---

## 2. Architecture

### 2.1 Layered overview

```
┌─────────────────────────────────────────────────────────┐
│  Wrappers (separate packages)                           │
│  ┌─────────────────────┐   ┌─────────────────────────┐  │
│  │ image-gen-cli       │   │ image-gen-server        │  │
│  │ (commander/yargs)   │   │ (Hono/Express handlers) │  │
│  └──────────┬──────────┘   └────────────┬────────────┘  │
└─────────────┼──────────────────────────┼─────────────────┘
              │                          │
              ▼                          ▼
┌─────────────────────────────────────────────────────────┐
│  image-gen-client (core lib, this spec)                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ Client       │ │ Model        │ │ Middleware chain │ │
│  │ (facade)     │ │ Registry     │ │ (retry, log…)    │ │
│  └──────┬───────┘ └──────┬───────┘ └────────┬─────────┘ │
│         │                │                  │           │
│  ┌──────▼────────────────▼──────────────────▼─────────┐ │
│  │  Provider Resolver  (Gateway ⇄ Direct)             │ │
│  └──────────────────────┬─────────────────────────────┘ │
└─────────────────────────┼───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Vercel AI SDK ( ai, @ai-sdk/gateway, @ai-sdk/openai,   │
│                  @ai-sdk/google, @ai-sdk/fal, ... )     │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Package layout

Three packages, with the core having zero knowledge of CLI or HTTP concerns:

- `@your-org/image-gen-client` — core library (this spec).
- `@your-org/image-gen-cli` — CLI wrapper.
- `@your-org/image-gen-server` — HTTP API wrapper (future).

The CLI and server packages depend on the core.

### 2.3 Dependencies

| Package | Status | Used for |
|---|---|---|
| `ai` (>=6.0) | required | image generation, multimodal text-with-image, types |
| `@ai-sdk/gateway` | required | Gateway model resolution |
| `@ai-sdk/openai` | optional peer | Direct OpenAI access |
| `@ai-sdk/google` | optional peer | Direct Google access |
| `@ai-sdk/fal`, `@ai-sdk/replicate`, `@ai-sdk/togetherai`, etc. | optional peer | Direct provider access |
| `zod` | required | Runtime input validation |

Optional peers must be loaded only when the user actually selects that provider in direct mode (lazy/dynamic import). If a peer is missing when needed, the library must throw a typed configuration error that includes the install command for the missing package.

---

## 3. Core Concepts

### 3.1 Client

A single client object is the entry point. It is constructed once with configuration (provider mode preference, default model, middleware) and reused for many calls. It must be stateless from a network perspective and safe to share across concurrent requests in a server.

### 3.2 Provider Mode

Each call must resolve to one of two modes:

- **Gateway mode** — uses Vercel AI Gateway. Model is referenced by a namespaced string (`'<provider>/<model-id>'`). A single API key (`AI_GATEWAY_API_KEY`) authorizes all providers through one URL.
- **Direct mode** — uses the provider's own AI SDK package. Authorization uses the provider-specific API key (`OPENAI_API_KEY`, etc.).

Both modes must be able to coexist in the same client. Resolution rules in §6.

### 3.3 Model & Provider

A model is identified by a string ID in `'<provider>/<model-id>'` form across both modes — the gateway-style string is the canonical ID even when running direct. The provider is the prefix (`openai`, `google`, `bfl`, etc.).

### 3.4 Capability

Every registered model carries a capability descriptor declaring what it supports. The descriptor must include:

- **`textToImage`** (boolean) — supports prompt-only generation.
- **`imageEdit`** (boolean) — accepts at least one reference image.
- **`multiReference`** (boolean) — accepts more than one reference image.
- **`transparentBackground`** (boolean) — can produce images with transparent backgrounds.
- **`aspectRatios`** (optional list of strings, e.g. `'1:1'`, `'16:9'`, `'9:16'`, `'4:3'`, `'3:4'`) — supported aspect ratios. Absent means aspect ratios are not the model's input modality.
- **`sizes`** (optional list of pixel-dimension strings such as `'1024x1024'`, `'1536x1024'`, `'1024x1536'`) — supported explicit sizes. Absent means sizes are not the model's input modality.
- **`maxN`** (integer) — maximum images per call.
- **`supportsSeed`** (boolean) — accepts a seed for deterministic output.
- **`supportsNegativePrompt`** (boolean) — accepts a negative prompt.
- **`defaultSize`** (optional string) — default size when none is provided.
- **`defaultAspectRatio`** (optional string) — default aspect ratio when none is provided.
- **`apiPath`** — one of `'generateImage'` or `'generateText'`. Determines whether the library invokes AI SDK's image-only path or its multimodal text path that emits images.
- **`transforms`** (optional list) — reserved for §15 AI image transforms. Allowed values: `'remove-background'`, `'upscale'`, `'restore'`, `'outpaint'`. **No v1 model populates this.** Defined in v1 so transforms ship as a non-breaking addition.

The library must validate every call against the resolved model's capability and throw a typed validation error before any network call when an input is incompatible.

### 3.5 Result

Every successful call must return the same normalized shape regardless of provider. The result must include:

- **`images`** — an array of generated images, always an array even when `n = 1`.
- **`model`** — the canonical `'provider/model-id'` string used.
- **`mode`** — either `'gateway'` or `'direct'`.
- **`request`** — a description of what was requested, with the following fields:
  - **`operation`** — a discriminator. v1 values: `'generate'`, `'edit'`, `'variations'`. Future transforms (§15) extend this union; consumers that don't switch on it must remain unaffected.
  - **`prompt`** — present for prompt-bearing operations; omitted for prompt-less ops.
  - **`size`** — when applicable.
  - **`aspectRatio`** — when applicable.
  - **`n`** — number of images requested.
  - **`seed`** — when supplied or returned.
  - **`referenceCount`** — number of reference images supplied (0 for `generate`).
- **`mask`** (optional) — auxiliary output. **Reserved in v1 for §15 transforms** (e.g. binary segmentation mask returned alongside a background-removal cutout). Always undefined in v1.
- **`providerMetadata`** (optional) — provider-specific pass-through data, loosely typed; opt-in to use.
- **`timings`** — wall-clock timings: start, finish, duration in ms.

Each generated image must include:

- **`base64`** — always populated.
- **`uint8Array`** — always populated. The library may decode lazily but the field must be available without an additional round-trip.
- **`mediaType`** — e.g. `'image/png'`, `'image/webp'`.
- **`width`**, **`height`** — when known.
- **`seed`** — when the provider returned one.

The library must **not** return URLs to the caller. If a provider returns a URL, the library must download bytes before returning, so the caller never has to handle expiring URLs. This is the one I/O concession made for DX (it is network I/O, not disk).

### 3.6 Middleware

Calls must be processed through an ordered chain of middleware. Each middleware can:

- read or modify the request,
- observe or transform the response,
- short-circuit (e.g. cache hit) without calling downstream.

Built-in middleware: retry, timeout, logging. Users can add their own. Behavior in §12.3.

---

## 4. Functional Requirements — Public API

The library must expose a client-construction entry point and the following operations as methods on the client. All inputs are objects (named arguments). All operations return a normalized result (§3.5). All operations accept an optional cancellation signal that aborts the underlying network request.

### 4.1 Client construction

The construction entry point must accept the following configuration, all fields optional:

- **`mode`** — `'auto'` (default), `'gateway'`, or `'direct'`. Auto picks based on available env keys (see §6).
- **`defaultModel`** — canonical model ID used when a call omits the model.
- **`gateway`** — gateway-specific config (API key override, base URL override).
- **`providers`** — per-provider direct-mode config (API keys, base URLs, region-specific options like Google Vertex project/location, OpenAI org). Extensible per provider.
- **`middleware`** — ordered middleware list applied to every call.
- **`timeoutMs`** — single-attempt network timeout. Default 120,000 ms.
- **`retry`** — retry config: total attempts, base delay, max delay, optional predicate. Defaults in §8.2.
- **`models`** — custom or override model registrations (see §7).
- **`logger`** — optional logging callback receiving level, message, and metadata.

The minimal construction call (no arguments) must succeed and auto-detect provider config from env vars.

### 4.2 `generate` — text-to-image

**Inputs:**

- **`model`** (optional) — canonical model ID; falls back to `defaultModel`. If neither is set, throw a config error.
- **`prompt`** (required, non-empty).
- **`negativePrompt`** (optional) — only honored if the model supports it.
- **`size`** (optional) — pixel size string.
- **`aspectRatio`** (optional) — ratio string.
- **`n`** (optional) — count; default 1.
- **`seed`** (optional).
- **`background`** (optional) — `'opaque'` or `'transparent'`. Ignored if the model does not support transparent backgrounds (or rejected at validation; see §8.3).
- **`format`** (optional) — `'png'`, `'webp'`, or `'jpeg'`.
- **`providerOptions`** (optional) — provider-specific pass-through, typed per provider for autocomplete.
- **`mode`** (optional, per-call override) — `'gateway'` or `'direct'`.
- **`middleware`** (optional, per-call addition).
- **`signal`** (optional) — cancellation.

**Behavior:**

1. Resolve model (explicit > default > error).
2. Look up the model's capability.
3. Validate inputs against capability; throw a typed validation error before any network call when invalid.
4. Resolve the effective mode using §6 rules.
5. Build the underlying AI SDK call based on the model's `apiPath` (image-only path or multimodal text path emitting images).
6. Run through the middleware chain.
7. Normalize the response into the result shape (§3.5) and return.

### 4.3 `edit` — image-to-image / inpainting

**Inputs:**

- **`model`** (optional).
- **`prompt`** (required).
- **`images`** — one or many reference images. The library must accept buffers, byte arrays, base64 strings, file paths (Node), `Blob`s (web), and already-hosted-URL references.
- **`mask`** (optional) — for inpainting; provider must declare mask support.
- **`size`**, **`aspectRatio`**, **`n`**, **`seed`**, **`format`**, **`providerOptions`**, **`mode`**, **`signal`** — same as `generate` where applicable.

**Behavior:** Same flow as `generate`, with two extra validations: when more than one reference image is supplied, the model must declare `multiReference`; when a mask is supplied, the model must declare mask support. Failures must throw a typed validation error whose message lists models that *do* declare the missing capability (hint pattern in §8.3).

### 4.4 `variations` — convenience

**Inputs:** model (optional), single reference image, n, seed.

**Behavior:** Implemented internally as either:

- an `edit` call with empty prompt, when the resolved model accepts empty prompts; or
- an `edit` call with a synthetic "create variations of the input image" prompt, when it does not.

A capability flag (`supportsVariations`) determines which path is used; if neither path is available, throw a typed validation error suggesting models that do support variations.

### 4.5 `batch` — many prompts, controlled concurrency

**Inputs:**

- **`model`** (optional default for all entries).
- **`inputs`** — array of `generate` or `edit` inputs.
- **`concurrency`** — default 4.
- **`onError`** — `'throw'` or `'collect'`. Default `'collect'`.
- **`signal`** — cancels all outstanding work.

**Behavior:**

- Run all inputs through `generate` or `edit` as appropriate, capping concurrent in-flight calls at `concurrency`.
- Honor the global signal and per-input cancellation.
- v1 returns once all inputs have settled; no progressive streaming.
- The result must include two arrays: successful results (with original index) and failures (with original index and the typed error). Streaming variant deferred (see §14).

### 4.6 Introspection

The client must expose:

- **List models** — return all registered models with their full capability descriptors.
- **Get model by ID** — return the registered model or undefined.
- **Check capability** — given a model ID and a partial capability requirement set, return a structured `{ ok, reasons }` answer. Useful for callers that pick a model dynamically.
- **Health check** — async; report gateway reachability and per-configured-provider status (`'ok'`, `'fail'`, `'not-configured'`).

---

## 5. Result Shape & Image Helpers

The result (§3.5) must be plain data — JSON-serializable apart from the byte array on each image. Helper utilities for converting and saving images must be provided **as separate exported utilities, not methods on the result**, so the result remains serializable across worker / RSC boundaries.

The library must provide at least the following helpers:

- **`toBuffer(image)`** — return a Node Buffer.
- **`toDataURL(image)`** — return a `data:` URL string.
- **`saveToFile(image, path)`** — Node-only; the one disk-writing helper, opt-in. Must never be invoked automatically by `generate` or `edit`.
- **`getDimensions(image)`** — return width/height, decoding only as needed.

These helpers must be importable from a separate utility entry point (e.g. `@your-org/image-gen-client/utils`) so the core entry point stays free of disk-writing code paths.

---

## 6. Provider Resolution

### 6.1 Mode resolution algorithm

For each call, the effective mode is determined as follows. First match wins:

1. Per-call mode override.
2. Client-level mode if not `'auto'`.
3. Auto resolution:
   1. If `AI_GATEWAY_API_KEY` (or explicit gateway API key) is configured → `'gateway'`.
   2. Else if a direct provider key for the resolved model's provider is configured (e.g. `OPENAI_API_KEY` for an `openai/*` model) → `'direct'`.
   3. Else throw a typed configuration error listing the env vars to set.

### 6.2 Mode → AI SDK call mapping

The library must hide the branching between gateway and direct invocation. The caller always passes a canonical `'provider/model-id'` string; the resolver picks the appropriate underlying AI SDK call shape:

- In gateway mode, the model identifier is passed as a string, and routing is handled by the gateway.
- In direct mode, the model is constructed via the provider's own SDK factory.

The choice between the image-only call and the multimodal-text call is driven by the model's `apiPath`, not by the mode.

### 6.3 Optional fallback chain

The library must support fallback at both client and per-call level:

- **`fallback`** — an ordered list of model IDs to try in turn when the primary model fails.
- **`fallbackMode`** — when true, on gateway-mode failure the library tries direct mode (or vice versa) before declaring the call failed.

Fallback fires only on retryable and "model unavailable" failures **after** the in-attempt retry budget is exhausted. Fallback must **not** fire for validation errors or content-policy errors.

---

## 7. Model Registry

### 7.1 Built-in registrations (v1)

The library must ship with a curated registry. Capabilities verified against current public docs at release time; users can override per client. The v1 set:

| ID | Provider | apiPath | T2I | Edit | Multi-ref | Transparent BG | Aspect Ratios | Sizes (px) | maxN | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `openai/gpt-image-2` | OpenAI | `generateImage` | ✓ | ✓ | ✓ | ✓ | n/a | up to 4096×4096 | 4 | Thinking mode optional via providerOptions |
| `openai/gpt-image-1.5` | OpenAI | `generateImage` | ✓ | ✓ | ✓ | ✓ | n/a | 1024², 1536×1024, 1024×1536 | 4 | |
| `openai/gpt-image-1` | OpenAI | `generateImage` | ✓ | ✓ | ✓ | ✓ | n/a | 1024², 1536×1024, 1024×1536 | 4 | |
| `openai/dall-e-3` | OpenAI | `generateImage` | ✓ | — | — | — | n/a | 1024², 1792×1024, 1024×1792 | 1 | `style: vivid \| natural` |
| `google/gemini-3-pro-image` | Google | `generateText` | ✓ | ✓ | ✓ | — | n/a | up to 2K | 1 | "Nano Banana Pro" |
| `google/gemini-2.5-flash-image` | Google | `generateText` | ✓ | ✓ | ✓ | — | n/a | up to 1024² | 1 | "Nano Banana" |
| `google/imagen-4.0-ultra-generate-001` | Google | `generateImage` | ✓ | — | — | — | 1:1, 9:16, 16:9, 3:4, 4:3 | n/a | 1 | Highest quality |
| `google/imagen-4.0-generate-001` | Google | `generateImage` | ✓ | — | — | — | 1:1, 9:16, 16:9, 3:4, 4:3 | n/a | 4 | |
| `google/imagen-4.0-fast-generate-001` | Google | `generateImage` | ✓ | — | — | — | 1:1, 9:16, 16:9, 3:4, 4:3 | n/a | 4 | Speed-optimized |
| `bfl/flux-2-flex` | BFL | `generateImage` | ✓ | ✓ | — | — | 1:1, 16:9, 9:16, 4:3, 3:4, 21:9 | varies | 4 | |
| `bfl/flux-1.1-pro` | BFL | `generateImage` | ✓ | — | — | — | 1:1, 16:9, 9:16, 4:3, 3:4 | varies | 4 | |
| `recraft/recraft-v3` | Recraft | `generateImage` | ✓ | — | — | ✓ | n/a | varies | 1 | Vector-friendly |

**Aliases** must be shipped alongside canonical IDs:

- `'gpt-image'` → `'openai/gpt-image-2'`
- `'imagen'` → `'google/imagen-4.0-generate-001'`
- `'flux'` → `'bfl/flux-2-flex'`

Aliases must be versioned in the changelog. Production callers should pin to canonical IDs; this must be documented.

### 7.2 Registering custom or new models

The library must allow callers to register additional models — either at client-construction time (via the `models` config) or imperatively via a `registerModel` method on the client.

A registration must include: the canonical ID, the provider name, the full capability descriptor, and an optional adapter (see §12.1) for non-standard provider quirks. The default adapter (gateway-style or direct-style based on provider) must work without writing anything for typical cases.

### 7.3 Updating built-ins

The registry version must ship with each release. The library must allow per-client override of any built-in model — typically used to bump a capability that the model gained between library releases. Overrides affect only the instance on which they are applied.

---

## 8. Error Model

### 8.1 Error hierarchy

The library must expose a typed error hierarchy with at least the following categories:

```
ImageGenError                       # base
├── ImageGenConfigError             # missing API key, bad config
├── ImageGenValidationError         # invalid input vs capability
├── ImageGenProviderError           # provider returned non-2xx or threw
│   ├── RateLimitError              # 429 / quota
│   ├── ContentPolicyError          # safety block, prompt rejected
│   ├── AuthError                   # 401 / 403
│   └── ModelUnavailableError       # 404 model, deprecated, gateway routing failure
├── ImageGenNetworkError            # timeout, connection reset
└── ImageGenAbortedError            # AbortSignal triggered
```

Every error must carry the following properties:

- **`code`** — stable string code (e.g. `'RATE_LIMIT'`).
- **`category`** — one of `'config'`, `'validation'`, `'provider'`, `'network'`, `'abort'`.
- **`retryable`** — boolean.
- **`modelId`** (when known) — the canonical model ID being called.
- **`mode`** (when known) — `'gateway'` or `'direct'`.
- **`cause`** (optional) — the original underlying error from AI SDK or fetch.
- **`providerError`** (optional) — provider-reported details: HTTP status, type, message.
- **`hint`** (optional) — a short string suggesting a fix when applicable.

### 8.2 Retry policy

Default retry behavior:

| Error | Retried? | Notes |
|---|---|---|
| `RateLimitError` | yes | Honor `Retry-After` if present, else exponential backoff |
| `ImageGenNetworkError` | yes | Exponential backoff |
| `ModelUnavailableError` (5xx) | yes | Capped attempts |
| `ModelUnavailableError` (404) | no | Permanent |
| `ContentPolicyError` | no | Caller intervention required |
| `AuthError` | no | Caller intervention required |
| `ImageGenValidationError` | no | Bug in caller code |
| `ImageGenAbortedError` | no | Explicit cancel |

Default config: 3 total attempts (including the first), base delay 500 ms (exponential to 1000 ms, 2000 ms, …), max delay 10,000 ms. The default predicate keys on the `retryable` property; callers must be able to override the predicate.

After retries are exhausted, the fallback chain (§6.3) fires if configured; otherwise the error propagates to the caller.

### 8.3 Validation — what gets checked

Pre-network validations must throw a typed validation error for at least:

- Model is not in the registry.
- Mode cannot be resolved (no provider key available).
- `n` exceeds `maxN`.
- `size` is not in the model's declared `sizes` (when sizes are declared).
- `aspectRatio` is not in the model's declared `aspectRatios` (when declared).
- More than one reference image passed to a model that does not declare `multiReference`.
- Mask passed to a model that does not declare mask support.
- `background: 'transparent'` requested for a model that does not declare `transparentBackground`.
- Empty prompt passed to `generate`.
- Empty `images` list passed to `edit`.

Validation error messages must include the model ID, the offending field, the allowed values, and a one-line hint pointing at compatible models. Example shape:

```
ImageGenValidationError: 'aspectRatio' = '21:9' not supported by 'google/imagen-4.0-generate-001'.
  Allowed: 1:1, 9:16, 16:9, 3:4, 4:3.
  Hint: bfl/flux-2-flex supports 21:9.
```

---

## 9. Configuration

### 9.1 Sources, in precedence order

Configuration is resolved in this precedence order (earlier wins):

1. Explicit options to the client constructor.
2. Config file (`image-gen.config.{ts,js,json}`) discovered upward from cwd.
3. Environment variables.
4. Built-in defaults.

### 9.2 Environment variables

The library must read at least:

```
AI_GATEWAY_API_KEY            # enables gateway mode
AI_GATEWAY_BASE_URL           # optional; defaults to Vercel AI Gateway

OPENAI_API_KEY                # enables direct mode for openai/*
OPENAI_BASE_URL               # optional
OPENAI_ORG_ID                 # optional

GOOGLE_GENERATIVE_AI_API_KEY  # enables direct mode for google/* (AI Studio key)
# OR Vertex flavor:
GOOGLE_VERTEX_PROJECT
GOOGLE_VERTEX_LOCATION
GOOGLE_APPLICATION_CREDENTIALS

BFL_API_KEY                   # enables direct mode for bfl/*
FAL_API_KEY                   # enables direct mode for fal/*
REPLICATE_API_TOKEN           # enables direct mode for replicate/*
TOGETHER_API_KEY              # enables direct mode for togetherai/*
```

### 9.3 Config file

The library must support a config file with at least the following sections:

- mode
- defaultModel
- retry
- custom model registrations
- **presets** — named option bundles for reuse from CLI and from code.

Examples of useful presets a team might define: `hero-banner` (specific model, `1536x1024`, n=1), `product-shot` (multimodal model, `1:1`), `social-square` (Flux family, `1:1`, n=4). The library does not ship preset content; it ships the mechanism.

A typed `defineConfig` helper must be provided so config files written in TypeScript get autocomplete.

### 9.4 Preset semantics

A preset is a partial set of generate/edit options. Options provided at call time must **override** preset values field-by-field (shallow merge). Presets live in config; they are not a runtime mutable concept.

---

## 10. CLI Layer (`@your-org/image-gen-cli`)

The CLI is a thin wrapper over the library. It must support at least the following invocations:

```bash
image-gen "A serene mountain landscape at sunset"
# uses default model, writes ./image-1.png to cwd

image-gen -m openai/gpt-image-2 -s 1536x1024 -n 4 \
  -o ./out "A futuristic city skyline at night"

image-gen edit -i ./photo.jpg "Replace the background with a beach"

image-gen --preset hero-banner "Q4 launch campaign hero"

image-gen batch ./prompts.jsonl -o ./out --concurrency 4

image-gen models                # list registered models with capabilities
image-gen health                # check gateway + each configured provider
```

### 10.1 Common flags

```
-m, --model <id>              canonical model id
-p, --preset <name>           apply named preset from config
-s, --size <WxH>
-a, --aspect-ratio <RATIO>
-n, --count <N>
    --seed <int>
    --negative <text>
    --background <opaque|transparent>
    --format <png|webp|jpeg>
-i, --image <path>            reference image (repeat for multi-ref)
    --mask <path>             inpainting mask
-o, --out <dir>               output directory (default: cwd)
    --filename <pattern>      e.g. '{prompt-slug}-{n}-{ts}.{ext}'
    --json                    write metadata sidecar `<name>.json`
    --mode <gateway|direct|auto>
    --no-color
    --dry-run                 validate inputs and show resolved call without firing
    --verbose
```

### 10.2 Batch input file format

Batch input is JSONL — one JSON object per line, each matching the shape of a `generate` or `edit` input:

```jsonl
{"prompt":"A red apple on white background","model":"openai/gpt-image-2","n":2}
{"prompt":"A blue car","preset":"social-square"}
{"prompt":"Replace background","images":["./refs/cat.jpg"]}
```

The CLI must report per-line success/failure and write failed lines to `<out>/.failures.jsonl` so the user can re-run only the failed entries.

### 10.3 Filename pattern tokens

The CLI must support these tokens in the `--filename` pattern:

- `{prompt-slug}` — kebab-case, truncated to 40 chars
- `{model-slug}`
- `{n}` — 1-based index in the result
- `{ts}` — ISO compact timestamp
- `{seed}`
- `{ext}`

Default pattern: `'{prompt-slug}-{n}.{ext}'`.

### 10.4 What the CLI does *not* do

- No upload to cloud storage. Consistent with the library's no-side-effects principle; users compose with `aws s3 cp` and similar.
- No interactive REPL (deferred).
- No image preview in terminal (deferred; could ship as a separate `image-gen-tui` package).

---

## 11. HTTP API Layer (future, design-only)

Not v1. Sketched here so the core library does not paint itself into a corner.

### 11.1 Endpoints

```
POST /v1/images/generate    body: GenerateInput     → ImageResult
POST /v1/images/edit        multipart or JSON       → ImageResult
POST /v1/images/batch       body: { inputs: [...] } → BatchResult
GET  /v1/models             → RegisteredModel[]
GET  /v1/health             → { gateway, providers }
```

### 11.2 Auth

Out of scope for v1 of the library. The HTTP layer (when built) will sit behind the consumer's existing auth (API gateway, BFF, internal service mesh). The library itself must not perform auth.

### 11.3 Streaming

Deferred. AI SDK's image generation functions do not stream today. Once they do, the HTTP layer will add an SSE variant (e.g. a `?stream=1` query parameter) emitting progress events and final image bytes, and the library will expose a corresponding streaming method.

---

## 12. Extensibility

### 12.1 Custom providers / models

A custom model registration may include an **adapter** for providers not handled natively by AI SDK or for non-standard request shapes. An adapter must provide at least:

- a request-builder that takes a normalized library input and returns the parameters to pass to the underlying AI SDK call;
- a response-parser that converts the provider's raw response into the normalized image array;
- (optional) a custom error mapper that converts provider-specific errors into the library's typed error hierarchy.

For most cases, the default adapter (gateway-style or direct-style based on the model's provider key) must work without the caller writing anything. Adapters are an escape hatch.

### 12.2 Custom transports

The client must accept an optional **transport** option that lets the caller substitute the underlying fetch — for testing, proxying, or custom retry/observability. Default: native `fetch`. The library must not depend on undici-specific features that are unavailable in browsers.

### 12.3 Middleware

Middleware is an ordered chain wrapping the provider call. Each middleware is a function that receives the next handler and returns a new handler; a handler receives a normalized request and a context object and returns a normalized result.

Built-in middleware, composed in this order (outermost first):

1. **`logging`** — info-level start/finish logs with redaction.
2. **`validation`** — capability + schema checks.
3. **`retry`** — see §8.2.
4. **`timeout`** — wraps the handler with a cancellation signal.
5. **`provider-call`** — innermost; the actual AI SDK invocation.

Examples of useful custom middleware (the library does not ship these but its surface must allow them):

- **Prompt rewriter / safety filter** — replaces or augments the prompt; useful for brand-voice prefixing or PII stripping.
- **LLM-based prompt enhancer** (opt-in) — calls a text model via AI SDK to expand a short user prompt before generation. Off by default to avoid surprise costs.
- **Cache** — keys on `(model, normalized prompt, seed, options)` to short-circuit identical re-runs in development.
- **Observability** — emit OpenTelemetry spans.

### 12.4 Plugins

A plugin is a function that takes the client and applies a bundle of middleware, model registrations, and adapters under a single install. Useful for sharing org-wide configuration. The client constructor must accept a list of plugins to apply on construction.

---

## 13. DX & Usage Scenarios

The following scenarios describe expected usage and must be supported end-to-end. They are not implementation; they are acceptance scenarios for the public surface.

### 13.1 Hello world

A caller imports the client constructor and a `saveToFile` helper, constructs a client with a default model, calls `generate` with only a prompt, and writes the first returned image to disk. Total code: roughly five lines. No env var beyond either `AI_GATEWAY_API_KEY` or `OPENAI_API_KEY` is required.

### 13.2 Edit with reference

A caller passes a model that supports image edit, a single local file path as the reference image, and a prompt describing the desired transformation. The library must accept the file path directly without requiring the caller to read bytes themselves.

### 13.3 Batch with mixed models

A caller submits a batch where each entry specifies a different model and prompt (e.g. one OpenAI, one BFL, one Google), with a concurrency cap. The library must run them concurrently up to the cap and return successes and failures separately.

### 13.4 Picking a model dynamically by capability

A caller queries `listModels()`, filters by capability (e.g. supports image edit and transparent background), and uses the first match. The capability descriptors must carry enough information for this filter to be expressed without secondary lookups.

### 13.5 Custom middleware — prompt prefix for brand voice

A caller registers a middleware that prefixes every prompt with a brand-voice phrase before the call reaches the provider. The middleware surface must allow read/write access to the request before the provider call.

### 13.6 Server usage (Next.js route handler)

A caller uses the library inside a server-rendered framework's request handler, takes a JSON body containing a prompt and an optional preset name, calls `generate`, and streams the first image's bytes back as the HTTP response. The result shape (§3.5) must be usable directly without conversion in this scenario.

---

## 14. Open Questions & Future Work

- **Streaming** — depends on AI SDK adding streaming for image generation. When available, expose a streaming method.
- **Cost tracking** — middleware-based: a `cost` middleware reads model + size and emits usage events. Pricing-data maintenance burden needs assessment before shipping.
- **Auth in HTTP layer** — likely delegated to the host application; the library stays auth-free.
- **Caching** — middleware-based; key strategy needs design (prompt normalization, seed handling).
- **Server-side rate limiting** — out of scope for the library; HTTP wrapper concern.
- **Image variations as first-class** — currently routed through `edit`; some providers expose a true variations endpoint we could prefer.
- **Prompt enhancer middleware** — opt-in LLM call; needs to be gated on explicit user enable to avoid surprise costs and latency.
- **Model deprecation handling** — registry could carry a `deprecated: { since, replaceWith }` field and warn at runtime.
- **Browser support** — the core lib is isomorphic; the CLI is Node-only. File-path inputs need a Node-only branch; web inputs accept `Blob`/`File`. Document clearly in the README.
- **Telemetry** — optional OpenTelemetry middleware; ship as a separate package to keep core deps minimal.
- **AI image transforms** (background removal, upscale, restoration, outpaint) — see §15. Background removal is the lead next capability after v1 ships. The v1 surface already reserves the hooks needed (`Capability.transforms`, `request.operation`, `result.mask`) so the addition is non-breaking.

---

## 15. Planned: AI Image Transforms (post-v1)

Beyond text-to-image and edit, several AI-powered image operations fit the same input-image → output-image pattern this library serves. The team has flagged **background removal** as the next priority capability. Other transforms (upscale, restoration, outpaint) sit in the same family and are expected to follow the same shape.

This section is **design-only**. None of it ships in v1. It is included so v1 decisions do not paint the implementation into a corner — the type and registry hooks needed to add §15 cleanly are already committed in v1 (see §15.6).

### 15.1 Why these belong in this library

The library's job is "image bytes in → image bytes out via an AI model, with a normalized API". Background removal fits exactly: caller supplies an image, a segmentation model returns the foreground on transparent background. The plumbing — provider resolution, capability validation, retry, error normalization, registry — is identical to `generate` and `edit`. Forking transforms into a separate library would duplicate roughly 80% of the core.

Boundary: this is **not** the same as the "client-side image processing" non-goal in §1.2. Resize/crop/watermark are local computational ops with no model involvement; those remain out of scope. AI-powered transforms call a model and are in scope (post-v1).

### 15.2 Lead use case: background removal

Common requirements observed in product workflows:

- Single image in → transparent-background image out.
- Default to PNG output (preserves alpha); WebP optional.
- Optionally return the binary segmentation mask alongside the cutout for downstream compositing or QA.
- Edge-refinement options where the chosen provider exposes them (feathering, threshold, model-quality tier).

A `removeBackground` operation must accept:

- **`model`** (optional) — canonical ID of a model whose capability declares `'remove-background'`.
- **`image`** — the input image.
- **`format`** — `'png'` (default) or `'webp'`.
- **`providerOptions`** — provider-specific knobs (edge feathering, mask-only mode, quality tier, etc.).
- **`returnMask`** — when true, the segmentation mask is returned in the result's `mask` field.
- **`mode`**, **`signal`**, **`timeoutMs`** — same semantics as other operations.

The returned shape must reuse the existing result (§3.5):

- `images` contains exactly one image — the cutout.
- `mask` is present iff `returnMask` was true.
- `request.operation` is `'remove-background'` (extending the v1 discriminator union; v1 consumers that do not switch on this field remain unaffected).
- `request.referenceCount` is 1; `request.n` is 1.
- `prompt` and `aspectRatio` are absent for this op.

### 15.3 Candidate providers / models

Final selection deferred to implementation time. Initial candidates:

| Candidate model id | Provider | Notes |
|---|---|---|
| `bria/remove-background-2.0` | Bria (direct or via Fal) | High-quality general purpose; commercial-license friendly |
| `fal/birefnet` | Fal | Open weights; strong on hair/fur edges |
| `replicate/851-labs/background-remover` | Replicate | Easy availability, sensible defaults |
| `photoroom/remove-background` | Photoroom | Commercial API tuned for product photography |
| `openai/gpt-image-2` (edit + `background: 'transparent'`) | OpenAI | Already reachable via existing `edit`; not a dedicated removal path. Lower quality and higher cost than dedicated models for this task — fallback only |

Shipping with **two or more** providers from day one is a soft requirement: a single bg-removal vendor going down should not break the team's pipelines. Registry registrations must include `transforms: ['remove-background']` for each.

### 15.4 Capability extension

The capability descriptor reserves the relevant field in v1 (§3.4). Validation rule for `removeBackground`: the resolved model's capability must include `'remove-background'` in its `transforms` list. Failure must throw a validation error listing all registered models that *do* declare it (§8.3 pattern).

Models that do **not** declare `transforms` (i.e. every v1 generation model) are unaffected. Adding §15 must not require touching their registrations.

### 15.5 Surface considerations

**Method placement.** v1 keeps a flat method surface (`generate`, `edit`, `variations`). `removeBackground` joins them flat. Once a third transform ships (e.g. `upscale`), revisit grouping under a `transforms.*` namespace. Migration must be additive (keep flat methods as aliases) to avoid breaking callers.

**Why not route through `edit`?** Tempting because both are "image in, image out". Rejected: `edit` is keyed to creative, prompt-driven transformation; bg removal is deterministic, prompt-less, and has different defaults (output format, mask return, quality tiers). Conflating them would muddy validation, defaults, and discoverability.

**Why not a generic `transform({ operation, ... })` method?** More extensible but less discoverable in IDE autocomplete and harder to type precisely (each operation has different required fields). Rejected for the same reason `generate` and `edit` are not collapsed today.

**Why not v1?** Three reasons. (1) Generation is the team's primary need today; shipping a focused v1 lets us learn the abstraction's pain points before extending. (2) The transform-model landscape is still consolidating — pinning provider choices early risks rework. (3) Adding it later is non-breaking provided v1 commits to the hooks in §15.6.

### 15.6 v1 commitments that enable §15 without breakage

To make §15 land cleanly later, **v1 must ship the following surface elements even though no v1 code path uses them**:

1. The capability descriptor must include the optional `transforms` field (§3.4).
2. The transform-operation enumeration (`'remove-background'`, `'upscale'`, `'restore'`, `'outpaint'`) must be exported by the package so user code can already reference it.
3. The result's `request.operation` must be a discriminator. v1 values: `'generate'`, `'edit'`, `'variations'`. Future transforms add values to this union; consumers that do not switch on it must remain unaffected.
4. The result must include the optional `mask` field (§3.5). Always undefined in v1.

These four are non-negotiable for v1. Implementation review must verify they exist before the v1 release. Skipping them turns §15 into a breaking change.

### 15.7 Beyond background removal

Same machinery applies to other AI transforms that may follow:

- **Upscale** — `upscale({ image, factor: 2 | 4, model })`. Candidate models: ESRGAN variants on Replicate, Topaz APIs, Magnific, ClarityUpscaler. Capability flag `'upscale'`.
- **Restore** — `restore({ image, model })` for face/photo restoration. Candidate models: GFPGAN, CodeFormer. Capability flag `'restore'`.
- **Outpaint** — `outpaint({ image, prompt, direction, model })` for canvas extension. Most generation models that support edit + mask can do this; this method may collapse into a richer `edit` instead of a dedicated entry.

Listed for design completeness only. Each gets its own design pass when prioritized.

---

*End of v0.1 requirements spec. Review feedback welcome before implementation kickoff.*