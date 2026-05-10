# Build Design — `image-gen-client` v1

> Status: Approved 2026-05-10
> Companion to: `docs/image-gen-client.spec.md` (requirements spec, v0.1)
> Owner: duyquangnvx

This document is the **implementation design** for the `image-gen-client` library. It does not restate the requirements (those live in the spec); it locks the decisions the spec leaves open: project layout, the order in which v1 is built, internal abstractions, and the test strategy.

The spec defines **what**; this design defines **how**. If the two ever disagree, the spec wins for behavior and the design is updated.

---

## 0. Decisions confirmed before design

These were settled during brainstorming and frame everything below:

- **Scope**: Full v1 core library — `§1`–`§9` and `§12` of the spec. The CLI package (`§10`) and HTTP wrapper (`§11`) are out of scope for this build. Post-v1 transforms (`§15`) are not implemented but the v1 surface honors the four hooks listed in `§15.6`.
- **Tooling stack**: pnpm + tsup + vitest + `tsc --noEmit` for typecheck + eslint + prettier. ESM-only output. Node ≥ 20 (engines pin). Strict TS (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`).
- **Runtime dependencies**: `ai ^6`, `@ai-sdk/gateway ^1`, `zod ^3`. Provider SDKs (`@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/fal`, `@ai-sdk/replicate`, `@ai-sdk/togetherai`) are **optional peer dependencies** loaded via dynamic `import()` only when their provider is selected in direct mode. BFL and Recraft are reachable through Vercel AI Gateway in v1; direct-mode adapters for them land when their `@ai-sdk/*` package or vetted community equivalent is available, and are added by registering an override at construction time without changing core code.
- **Build approach**: Approach B — vertical slice end-to-end first, then expand on independent axes.

---

## 1. Project layout

```
image-gen-client/
├── src/
│   ├── index.ts                     # Public entry: createClient + exported types
│   ├── client.ts                    # Client facade
│   ├── config.ts                    # Resolve config: options → file → env → defaults
│   ├── registry.ts                  # Built-in models + registerModel
│   ├── capabilities.ts              # Capability type + matchers
│   ├── resolver.ts                  # Mode resolution + adapter dispatch
│   ├── validation.ts                # Pre-network checks
│   ├── result.ts                    # Normalize AI SDK output → ImageGenResult; URL→bytes
│   ├── images.ts                    # Coerce path/Blob/Buffer/base64/URL → bytes
│   ├── errors.ts                    # ImageGenError hierarchy + codes
│   ├── middleware/
│   │   ├── chain.ts                 # Compose ordered chain
│   │   ├── logging.ts
│   │   ├── retry.ts
│   │   ├── timeout.ts
│   │   └── validation-mw.ts
│   ├── providers/
│   │   ├── adapter.ts               # ProviderAdapter interface
│   │   ├── default.ts               # Gateway/direct default adapter
│   │   ├── openai.ts                # Lazy peer + adapter overrides
│   │   ├── google.ts
│   │   ├── bfl.ts
│   │   └── recraft.ts
│   ├── operations/
│   │   ├── generate.ts
│   │   ├── edit.ts
│   │   ├── variations.ts
│   │   └── batch.ts
│   ├── utils/                       # Subpath export: image-gen-client/utils
│   │   ├── index.ts
│   │   ├── to-buffer.ts
│   │   ├── to-data-url.ts
│   │   ├── save-to-file.ts          # Node-only; the only disk write
│   │   └── get-dimensions.ts
│   └── integration/                 # Cross-module integration tests
│       └── *.integration.test.ts
├── tests/fixtures/                  # Sample PNGs, captured provider response shapes
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── eslint.config.js
└── docs/
    ├── image-gen-client.spec.md     # Requirements (existing)
    └── superpowers/specs/            # Design docs (this file lives here)
```

Conventions:

- Colocated unit tests: `src/foo.ts` ↔ `src/foo.test.ts` (per `CLAUDE.md`).
- Cross-module integration tests: `src/integration/*.integration.test.ts`.
- Live smoke tests (real provider calls): `src/integration/live/*.live.test.ts`, gated by `IMAGE_GEN_E2E=1`, excluded from default `pnpm test`.
- `utils/` is its own package subpath export so the core entry imports zero `node:fs` / `node:path` code paths (spec `§5`).

File-size budgets per `coding-style.md`: 200-400 lines typical, 800 hard cap. Functions ≤ 50 lines. If a file outgrows the budget while implementing a slice, split before merging.

---

## 2. Vertical slice 1 — the smallest end-to-end

Goal: every layer touched by one feature that runs against a real gateway.

**Surface delivered:**

- `createClient({ defaultModel: 'openai/gpt-image-2' })` works when `AI_GATEWAY_API_KEY` is set.
- `client.generate({ prompt })` returns the normalized result of spec `§3.5`:
  - `images[0]` has `base64`, `uint8Array`, `mediaType`, plus `width`/`height` if known.
  - `model = 'openai/gpt-image-2'`, `mode = 'gateway'`.
  - `request` includes `operation: 'generate'`, `prompt`, `n: 1`, `referenceCount: 0`.
  - `timings` includes `start`, `finish`, `durationMs`.
- Helpers `toBuffer` and `saveToFile` exported from `image-gen-client/utils`.

**Slice contents:**

- Registry seeded with **only** `openai/gpt-image-2` (real entry per spec `§7.1`).
- Resolver: gateway mode only. Direct mode and fallback chain land in slice 2 / 6.
- Validation rules wired:
  - model exists in registry,
  - mode resolvable (`AI_GATEWAY_API_KEY` present),
  - prompt non-empty,
  - `n ≤ maxN`,
  - `size` matches `capability.sizes` when declared.
- Middleware chain: `logging → validation → provider-call`. Retry / timeout land in slice 3.
- Errors implemented: `ImageGenError` (base), `ImageGenConfigError`, `ImageGenValidationError`, `ImageGenProviderError`, `ImageGenNetworkError`. Subtypes (`RateLimitError`, `ContentPolicyError`, `AuthError`, `ModelUnavailableError`) added in slice 3 with their retry policy.
- Tests:
  - Unit: registry, validation, resolver, errors, result normalizer.
  - Integration: full `generate` with `vi.mock('ai', ...)` returning a fixture PNG; assert exact result shape.

**Definition of done for slice 1:**

- `pnpm test` green; coverage ≥ 80%.
- One integration test simulates `createClient({})` → `generate({ prompt })` → image bytes returned, with AI SDK mocked.
- Public API types compile under `--strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes`.
- No `any`, no `as` without a runtime verifier preceding it (per `typescript/types.md`).

---

## 3. Expansion milestones — slices 2 → 7

Each slice is an independently shippable `0.1.x` release that builds on the previous. Slices are sequenced by dependency — earlier slices unblock later ones. Within a slice, tasks can be parallelized.

### Slice 2 — Direct mode + multi-provider

- Implement direct mode resolution (auto resolution per spec `§6.1`).
- Per-call `mode` override.
- Lazy peer-load adapters for OpenAI, Google (Gemini + Imagen + Vertex flavor), BFL, Recraft, Fal, Replicate, Together. Missing peer → typed `ImageGenConfigError` with the install command (`pnpm add @ai-sdk/openai`, etc.).
- Registry expanded to all 12 models from spec `§7.1` plus aliases (`gpt-image`, `imagen`, `flux`).
- Validation gains: `aspectRatio` against `capability.aspectRatios`, `background: 'transparent'` against `capability.transparentBackground`.
- Tests: per-provider integration (mocked) for at least one model each.

### Slice 3 — Resilience middleware

- Retry middleware with default policy per spec `§8.2`. Honor `Retry-After`. Predicate overridable.
- Timeout middleware (default 120,000 ms). Per-call override.
- Full error hierarchy: `RateLimitError`, `ContentPolicyError`, `AuthError`, `ModelUnavailableError`. Per-provider error mappers translate AI SDK / fetch errors into the right subtype.
- AbortSignal threaded from public API → middleware → AI SDK call.
- Tests: retry behavior under rate limit, timeout firing, abort propagating, error mapping per provider.

### Slice 4 — `edit` + `variations`

- `images.ts`: coerce path (Node), Blob/File (web), Buffer, Uint8Array, base64 string, hosted URL into a normalized internal representation.
- Validation gains: `multiReference`, mask support, empty-`images` rejection.
- `edit` operation through the same middleware chain as `generate`.
- `variations` dispatches to `edit` per spec `§4.4` heuristic.
- Tests: image-input coercion matrix; multi-ref validation; mask validation; variations dispatch path.

### Slice 5 — `batch`

- Concurrency limiter (default 4).
- `onError: 'throw' | 'collect'` (default `'collect'`).
- Result `{ successes: { index, result }[]; failures: { index, error }[] }`.
- Honor global `signal`.
- Tests: partial-failure result shape; concurrency cap respected; signal aborts pending entries.

### Slice 6 — Introspection + fallback

- `listModels()`, `getModel(id)`, `checkCapability({ model, requirements })`, `health()` (gateway + per-configured-provider).
- Fallback chain (spec `§6.3`): try alternate models in order; gateway↔direct fallback when `fallbackMode` enabled. Skip fallback for validation / content-policy errors.
- Tests: capability filter scenarios; fallback fires only on retryable + model-unavailable; health reports `not-configured` cleanly.

### Slice 7 — Config file + presets + plugins

- `defineConfig` typed helper exported from package root.
- File discovery (`image-gen.config.{ts,js,json}`) walking up from `cwd`.
- Preset shallow-merge per spec `§9.4`.
- Plugin install: function receives client and may register middleware, models, adapters atomically. Constructor accepts `plugins: Plugin[]`.
- Tests: config-file precedence (options > file > env > defaults), preset override behavior, plugin install order.

---

## 4. Internal abstractions

### 4.1 Capability

Frozen literal in `registry.ts`. Shape is the exact one in spec `§3.4`:

```ts
type TransformKind = 'remove-background' | 'upscale' | 'restore' | 'outpaint';

type Capability = Readonly<{
  textToImage: boolean;
  imageEdit: boolean;
  multiReference: boolean;
  transparentBackground: boolean;
  aspectRatios?: readonly string[];
  sizes?: readonly string[];
  maxN: number;
  supportsSeed: boolean;
  supportsNegativePrompt: boolean;
  defaultSize?: string;
  defaultAspectRatio?: string;
  apiPath: 'generateImage' | 'generateText';
  transforms?: readonly TransformKind[]; // §15.6 — exported, never populated in v1
}>;
```

### 4.2 Resolved request

Output of resolver + validation; input to the middleware chain.

```ts
type ModelId = `${string}/${string}`;

type ResolvedRequest = Readonly<{
  operation: 'generate' | 'edit' | 'variations';
  modelId: ModelId;
  mode: 'gateway' | 'direct';
  apiPath: 'generateImage' | 'generateText';
  capability: Capability;

  prompt?: string;
  negativePrompt?: string;
  size?: string;
  aspectRatio?: string;
  n: number;
  seed?: number;
  background?: 'opaque' | 'transparent';
  format?: 'png' | 'webp' | 'jpeg';

  references?: readonly Uint8Array[];
  mask?: Uint8Array;

  providerOptions?: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
  timeoutMs?: number;
}>;
```

### 4.3 ProviderAdapter

The escape hatch from spec `§12.1`. Most providers route through `providers/default.ts`; per-provider files only override what differs.

```ts
interface ProviderAdapter {
  buildCall(req: ResolvedRequest):
    | { fn: 'generateImage'; args: GenerateImageArgs }
    | { fn: 'generateText'; args: GenerateTextArgs };

  parseResponse(raw: unknown, req: ResolvedRequest): Promise<ImageGenResult>;

  mapError?(err: unknown, req: ResolvedRequest): ImageGenError | undefined;
}
```

The default adapter dispatches on `(mode, apiPath)`:

- `(gateway, generateImage)` — call `generateImage` with the model string passed to the gateway.
- `(gateway, generateText)` — call `generateText` with the model string and a prompt-shaped message; extract image attachments from the response.
- `(direct, generateImage)` — load the provider's `@ai-sdk/<provider>` package via dynamic `import()`, call `provider.image(modelId.split('/')[1])`, then `generateImage`.
- `(direct, generateText)` — same lazy load, but pass to `generateText` and extract attachments.

Per-provider files (`providers/openai.ts`, `providers/google.ts`, `providers/bfl.ts`, `providers/recraft.ts`) are created **only when** a real quirk forces an override (e.g. Imagen aspect-ratio param naming, Recraft `style` mapping, BFL response field shape). Until a quirk is observed for a provider, no file exists for it and the registry entry simply omits the `adapter` field, which makes the resolver fall through to the default adapter. The skeleton in section 1 lists these files as a forward-looking placement; an actual file is added in the slice where its first quirk is found.

### 4.4 Middleware

```ts
type Context = Readonly<{
  startedAt: number;
  modelId: ModelId;
  mode: 'gateway' | 'direct';
  attempt: number;
  signal?: AbortSignal;
  logger?: Logger;
}>;

type Handler = (req: ResolvedRequest, ctx: Context) => Promise<ImageGenResult>;
type Middleware = (next: Handler) => Handler;
```

Built-in chain order, outer → inner, per spec `§12.3`:

```
logging → validation → retry → timeout → provider-call
```

User middleware default-injects between `validation` and `retry` so it observes a validated request but participates in retry. Constructor option `middleware: { user: Middleware[]; position?: 'outer' | 'before-retry' | 'before-provider' }` lets advanced callers pick a position.

### 4.5 Result normalizer

`result.ts` is the single module that knows about AI SDK's dual-path quirk. It exports one function:

```ts
function normalizeResult(
  raw: { fn: 'generateImage'; output: AiSdkGenerateImageResult }
     | { fn: 'generateText'; output: AiSdkGenerateTextResult },
  req: ResolvedRequest,
  timings: { start: number; finish: number }
): Promise<ImageGenResult>;
```

It also handles the URL→bytes download for providers that return URLs (spec `§3.5`). All other modules see the unified shape.

---

## 5. Test strategy

- **Unit tests** (colocated `*.test.ts`) for pure modules: `registry`, `capabilities`, `validation`, `errors`, `result`, `images` coercion matrix, individual middleware.
- **Integration tests** (`src/integration/*.integration.test.ts`) for end-to-end flows: `createClient` → operation → result. Mock at the AI SDK import boundary using `vi.mock('ai', ...)` and `vi.mock('@ai-sdk/openai', ...)`. Each public method has at least one happy-path and one error-path integration test (per `CLAUDE.md`).
- **Transport-seam tests**: integration tests that don't need to touch AI SDK internals use the `transport` option from spec `§12.2` to inject a fake fetch. Used for retry/timeout/abort scenarios where the seam is HTTP, not AI SDK shape.
- **Live smoke tests** (`src/integration/live/*.live.test.ts`): real provider calls, gated by `process.env.IMAGE_GEN_E2E === '1'`. `vitest.config.ts` excludes them from default runs. Used to validate response-shape fixtures stay accurate against current provider releases.
- **Fixtures** (`tests/fixtures/`):
  - `pixel-1x1.png` — 1×1 transparent (smallest possible).
  - `square-4x4.png` — 4×4 solid red.
  - `pixel-1x1.base64.txt` — base64 form of the first.
  - Provider response captures: redact API keys, commit. Re-capture during slice 3+ when a provider's shape drifts.
- **Coverage target**: 80% statements / branches per `common/testing.md`. Coverage report in CI; missing coverage on a public method blocks merge.

---

## 6. v1 commitments locked in this build

These four items are non-negotiable and are validated as part of slice 1's "definition of done" checklist (spec `§15.6`). They ship even though no v1 code path uses them, so post-v1 transforms remain a non-breaking addition.

1. `Capability.transforms?: readonly TransformKind[]` exported from the public types.
2. `TransformKind = 'remove-background' | 'upscale' | 'restore' | 'outpaint'` exported from the package root.
3. `ImageGenResult.request.operation` is a discriminator union of literal strings; v1 values are `'generate' | 'edit' | 'variations'`. Future transforms add to the union.
4. `ImageGenResult.mask?: GeneratedImage` field present on the type, always `undefined` in v1.

---

## 7. What this design does *not* decide

Open items deferred to implementation time, not blocking writing the plan:

- Exact tsup config (target ES2022 vs ES2024, minify on/off). Decided when slice 1 hits "ready to publish".
- ESLint ruleset (recommended-typescript vs strict). Decided when CI is wired.
- `defineConfig` implementation detail: function vs identity-typed const. Decided in slice 7.
- CHANGELOG strategy (changesets vs hand-written). Decided when slice 1 ships.
- Whether to publish `0.1.x` releases per slice or accumulate to `0.1.0` at slice 4.

These are picked up by `/superpowers:writing-plans` or during the slice that needs them, not now.
