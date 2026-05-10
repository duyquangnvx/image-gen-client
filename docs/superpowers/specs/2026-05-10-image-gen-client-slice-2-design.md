# Slice 2 Design — Direct mode + Multi-provider

> Status: Approved 2026-05-10
> Companion to: `docs/image-gen-client.spec.md` (requirements), `docs/superpowers/specs/2026-05-10-image-gen-client-build-design.md` (overall build design)
> Owner: duyquangnvx
> Supersedes: §3 "Slice 2" of the build-design doc — that section was a sketch; this is the locked design.

## Goal

End-to-end **direct mode** with three providers wired (OpenAI native, Google native, OpenAI-compatible custom endpoint), validated by a real E2E test against a local OpenAI-compatible endpoint at `http://localhost:20128/v1` (`cx` provider, exposes models such as `cx/gpt-5.4-image`).

Slice 1 already shipped gateway mode with `openai/gpt-image-2`. Slice 2 keeps slice-1 behavior intact and adds direct mode as a peer path.

## Decisions (recap)

These were settled during brainstorming for slice 2:

1. **Scope**: 2 native providers (OpenAI, Google) + 1 dynamic kind (OpenAI-compatible). Other built-in providers (BFL, Fal, Replicate, Together) defer to slice 3.
2. **OpenAI-compatible**: provider config carries a `kind` discriminator. `kind: 'openai-compatible'` activates `@ai-sdk/openai-compatible` with caller-supplied `baseURL`.
3. **Model registration**: constructor `models` option only. Helper `defineModel()` exported. Imperative `client.registerModel()` defers to slice 3.
4. **E2E**: dedicated `pnpm test:e2e` script. Auto-skip when `localhost:20128` is unreachable. Default `pnpm test` stays hermetic.
5. **Built-in registry adds**: `google/imagen-4`. `cx/*` is **never** built-in — it is the canonical example of user-registered models.
6. **Error subtypes**: ship `RateLimitError`, `AuthError`, `ContentPolicyError`, `ModelUnavailableError` in slice 2 (direct mode means real network errors that need classification before retry policy lands).
7. **Timeout middleware**: ship in slice 2 (real network E2E without timeout produces flakes). Retry middleware defers to slice 3 alongside fallback chain.

## Public API additions

### `createClient` options

```ts
createClient({
  // existing (slice 1)
  defaultModel?: ModelId;
  gateway?: { apiKey?: string };
  middleware?: Middleware[];
  logger?: Logger;

  // existing — extended
  mode?: 'gateway' | 'direct' | 'auto'; // 'auto' = gateway if AI_GATEWAY_API_KEY present, else direct
  // slice 1 supported only 'gateway'; slice 2 adds 'direct' and 'auto'.
  // Default changes from 'gateway' to 'auto'.

  // new in slice 2
  providers?: Record<string, ProviderConfig>;  // direct-mode credentials & per-provider settings
  models?: Record<ModelId, RegisteredModel>;   // user-registered models, overrides built-ins
  timeoutMs?: number;                          // default 120_000
})
```

### `ProviderConfig`

A discriminated union on `kind`:

```ts
type ProviderConfig =
  | { kind?: 'native'; apiKey?: string }
  | { kind: 'openai-compatible'; baseURL: string; apiKey?: string; name?: string };
```

- `kind` defaults to `'native'`. For `'native'`, the provider key (e.g. `'openai'`, `'google'`) selects which AI-SDK package to dynamic-import.
- For `'openai-compatible'`, the adapter calls `createOpenAICompatible({ baseURL, apiKey, name })` regardless of the provider key. `name` defaults to the provider key.

### `defineModel` helper

```ts
defineModel(id: ModelId, providerKey: string, capability: Capability): RegisteredModel
```

Returns a deep-frozen `RegisteredModel`. Validates that `providerKey` is the prefix of `id` (split on `/`). Used for the `models` constructor option and for built-in registry entries.

### Error subtypes

All extend `ImageGenProviderError`. Each has a stable `code`. `retryable` follows spec §8.2:

| Subtype | Trigger | code | retryable |
|---|---|---|---|
| `RateLimitError` | HTTP 429 | `RATE_LIMIT` | true |
| `AuthError` | HTTP 401 / 403 | `AUTH` | false |
| `ContentPolicyError` | safety/policy block (provider-specific signal) | `CONTENT_POLICY` | false |
| `ModelUnavailableError` | HTTP 404 | `MODEL_NOT_FOUND` | false |
| `ModelUnavailableError` | HTTP 5xx | `MODEL_UNAVAILABLE` | true |

Slice 2 does not implement automatic retry — the `retryable` flag is correctly set so slice 3 can read it without re-classifying.

## Built-in registry additions

`src/registry.ts` adds:

- `google/imagen-4` — `apiPath: 'generateImage'`, single-image text-to-image. Exact capability shape derived from Google's published constraints (sizes, aspect ratios) at implementation time via the AI-SDK skill / Google docs.

`openai/gpt-image-2` (slice 1) is unchanged.

Aliases (`gpt-image`, `imagen`, `flux`) and the rest of the spec §7.1 table defer to slice 3.

## Internal architecture

### Resolver

`src/resolver.ts` extends:

```ts
type ResolvedProvider =
  | { providerKey: string; mode: 'gateway' }
  | { providerKey: string; mode: 'direct'; kind: 'native'; apiKey: string }
  | { providerKey: string; mode: 'direct'; kind: 'openai-compatible'; apiKey: string; baseURL: string; name: string };
```

`resolveMode` accepts `'auto'` and resolves to gateway when `AI_GATEWAY_API_KEY` is present, else `'direct'`. Per-call `mode` override (slice 1 already supports the type field) flows in unchanged.

`resolveProvider(modelId, mode, config, env)` is new. Logic:

1. Extract `providerKey` from `modelId` (text before `'/'`).
2. If `mode === 'gateway'`: return `{ providerKey, mode: 'gateway' }` (gateway uses gateway key, not per-provider keys).
3. If `mode === 'direct'`:
   - Look up `config.providers[providerKey]`. If absent → check env for `<PROVIDER>_API_KEY` (e.g. `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`). Native providers fall back to env; openai-compatible has no env fallback (baseURL is required and must come from config).
   - If `kind === 'openai-compatible'`: require `baseURL`, return openai-compatible variant.
   - Else: return native variant.
4. If neither resolves: throw `ImageGenConfigError({ code: 'CONFIG_NO_PROVIDER' })` with a hint listing what was tried.

### Provider adapters

`src/providers/` gains 3 files:

- `openai.ts` — dynamic-imports `@ai-sdk/openai`, calls `createOpenAI({ apiKey })` and returns the model handle for `generateImage`.
- `google.ts` — dynamic-imports `@ai-sdk/google`, calls `createGoogleGenerativeAI({ apiKey })`.
- `openai-compatible.ts` — dynamic-imports `@ai-sdk/openai-compatible`, calls `createOpenAICompatible({ baseURL, apiKey, name })`. Provider key is informational; the SDK call shape is the same.

`src/providers/select.ts` is new:

```ts
selectAdapter(resolved: ResolvedProvider): ProviderAdapter
```

Returns `defaultAdapter` (slice 1) for gateway, otherwise the matching direct-mode adapter. Each direct-mode adapter knows how to construct its model handle from `ResolvedProvider`.

`src/providers/default.ts` (slice 1) keeps its current behavior — gateway only. No change.

`src/providers/adapter.ts` (interface) does not change in slice 2; `parseResponse` remains deferred per slice 1's convention (normalization lives in `result.ts`).

Lazy peer-load: each provider adapter performs the dynamic import inside `buildCall`, not at module load. Missing peer → `ImageGenConfigError({ code: 'CONFIG_PEER_MISSING', hint: 'pnpm add @ai-sdk/openai' })`.

### Timeout middleware

`src/middleware/timeout.ts`:

- Wraps the next handler in a race against `setTimeout(timeoutMs)`.
- On timeout: aborts via `AbortController` and throws `ImageGenNetworkError({ code: 'TIMEOUT', retryable: true })`.
- Reads `timeoutMs` from `ResolvedRequest` (per-call override) or falls back to client config.
- Forwards an existing `signal` from the request, so user aborts still propagate.
- `ImageGenAbortedError` (spec §8.1) is reserved for user-supplied AbortSignal triggering — not for timeout. Slice 2 does not yet thread a public `signal` option through `generate`; that lands with the retry/abort work in slice 3.

Middleware chain order in slice 2: `logging → validation → timeout → terminal`.

### Registry merge

`src/registry.ts` adds `mergeModels(builtIn, userModels)`:

- User entries with the same `id` override built-ins (per spec §7.3).
- Returns a frozen merged record.
- Called once during `resolveConfig`. Lookups in `generate` go through the merged registry.

### Config

`src/config.ts` `resolveConfig` extends to:

1. Validate `providers` shape (each entry matches the discriminated union; `'openai-compatible'` requires `baseURL`).
2. Apply `defineModel`-shape validation to each entry of `models` (id format, prefix matches `providerKey`, capability complete).
3. Merge built-in registry with user models.
4. Default `timeoutMs` to `120_000`.
5. Default `mode` to `'auto'`.

## Peer dependencies added

```json
{
  "peerDependencies": {
    "@ai-sdk/openai": "^3.0.0",
    "@ai-sdk/google": "^3.0.0",
    "@ai-sdk/openai-compatible": "^1.0.0"
  },
  "peerDependenciesMeta": {
    "@ai-sdk/openai":           { "optional": true },
    "@ai-sdk/google":           { "optional": true },
    "@ai-sdk/openai-compatible":{ "optional": true }
  }
}
```

Exact version ranges to be verified against the live npm registry during the first task of the implementation plan, using the same procedure as slice 1 (where plan-stated `^1`/`^2` ranges had to be bumped to actual current majors). The plan must instruct the implementer to verify and adjust before pinning.

## Test strategy

### `pnpm test` (default — hermetic)

All slice-1 tests stay green. New tests:

- `src/resolver.test.ts` — `resolveMode('auto')` branches on env; `resolveProvider` covers gateway / native-direct / openai-compatible / env-fallback / missing-provider.
- `src/providers/openai.test.ts`, `google.test.ts`, `openai-compatible.test.ts` — each mocks its respective `@ai-sdk/*` package (`vi.mock('@ai-sdk/openai', ...)` etc.) and verifies adapter wires through.
- `src/providers/select.test.ts` — input matrix → expected adapter.
- `src/errors.test.ts` (extended) — instances + codes for the 4 new subtypes.
- `src/operations/generate.test.ts` — `mapAiSdkError` matrix covers all five rows of the subtype table: 429 → `RateLimitError`, 401 → `AuthError`, 403 → `AuthError`, 404 → `ModelUnavailableError(MODEL_NOT_FOUND)`, 5xx → `ModelUnavailableError(MODEL_UNAVAILABLE)`, plus a content-policy signal → `ContentPolicyError`. Existing slice-1 fall-through tests for non-Error/AbortError/network stay green.
- `src/middleware/timeout.test.ts` — fake timers; verifies abort fires at `timeoutMs`, error is `ImageGenNetworkError` with `code: 'TIMEOUT'`.
- `src/registry.test.ts` (extended) — `mergeModels` user override; `defineModel` deep-freeze + id/prefix validation.
- `src/integration/generate-direct.integration.test.ts` — `createClient({ mode: 'direct', providers: { openai: { apiKey: 'x' } } }).generate(...)` → mocked OpenAI SDK returns fixture image, asserts result shape.
- `src/integration/generate-openai-compatible.integration.test.ts` — same with `providers: { cx: { kind: 'openai-compatible', baseURL: '...', apiKey: 'x' } }` and a user-registered model via `models`.

Coverage target: ≥ 80% lines, on par with slice 1.

### `pnpm test:e2e` (opt-in)

`tests/e2e/cx-local.e2e.test.ts`:

- `beforeAll`: probe `GET http://localhost:20128/v1/models` with `AbortSignal.timeout(1000)`. Unreachable → `describe.skip` with `console.warn('cx unreachable, skipping E2E')`.
- Test 1 — registers `cx/gpt-5.4-image`:
  ```ts
  const client = createClient({
    mode: 'direct',
    providers: { cx: { kind: 'openai-compatible', baseURL: 'http://localhost:20128/v1', apiKey: 'unused' } },
    models: {
      'cx/gpt-5.4-image': defineModel('cx/gpt-5.4-image', 'cx', {
        textToImage: true,
        imageEdit: false,
        multiReference: false,
        transparentBackground: false,
        maxN: 1,
        supportsSeed: false,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      }),
    },
    defaultModel: 'cx/gpt-5.4-image',
  });
  const r = await client.generate({ prompt: 'a red apple on a white table' });
  ```
  Asserts: `r.images[0].uint8Array.length > 0`, `r.images[0].mediaType` is image/*, `r.model === 'cx/gpt-5.4-image'`, `r.mode === 'direct'`.
- Test 2 — invalid model id (no registry entry, no user model): asserts `ImageGenValidationError` thrown synchronously in pre-flight (no network).

`vitest.config.e2e.ts` includes only `tests/e2e/**`. Default `vitest.config.ts` excludes it.

`package.json` scripts:
```json
{
  "test": "vitest run",
  "test:e2e": "vitest run --config vitest.config.e2e.ts"
}
```

CI: not wired in slice 2. Future CI work runs `test:e2e` only on infra that has the cx endpoint reachable.

## Files inventory

### New

```
src/providers/openai.ts
src/providers/google.ts
src/providers/openai-compatible.ts
src/providers/select.ts
src/middleware/timeout.ts
src/define-model.ts
tests/e2e/cx-local.e2e.test.ts
tests/e2e/_probe.ts
vitest.config.e2e.ts
```

Plus colocated `*.test.ts` for each new source file.

### Modified

```
src/types.ts            — ProviderConfig, mode 'auto', timeoutMs, providers/models, RegisteredModel
src/errors.ts           — 4 subtype classes
src/registry.ts         — google/imagen-4 entry, mergeModels
src/resolver.ts         — direct/auto branch, resolveProvider
src/config.ts           — providers/models validation & merging, default mode 'auto'
src/operations/generate.ts — selectAdapter integration, timeout middleware in chain, mapAiSdkError extended
src/client.ts           — pass providers/models through
src/index.ts            — export defineModel, ProviderConfig, RegisteredModel, 4 error subtypes
package.json            — 3 peer deps + test:e2e script
vitest.config.ts        — exclude tests/e2e/**
```

## Acceptance

1. `createClient({ mode: 'direct', providers: { openai: { apiKey } }, defaultModel: 'openai/gpt-image-2' }).generate({ prompt })` → mocked OpenAI SDK returns image, normalized result with `mode: 'direct'`.
2. Same for `google/imagen-4` via mocked `@ai-sdk/google`.
3. `cx/gpt-5.4-image` registered via `models` + `providers.cx.kind: 'openai-compatible'` → real call to `localhost:20128` succeeds in `pnpm test:e2e` when cx is running; cleanly skips when not.
4. `mapAiSdkError` correctly classifies the 5 trigger conditions in the error subtypes table.
5. Timeout middleware fires `ImageGenNetworkError({ code: 'TIMEOUT' })` when handler exceeds `timeoutMs`.
6. `pnpm test` (no cx required) — green, ≥ 80% line coverage.
7. `pnpm typecheck` — 0 errors.
8. `pnpm lint` — 0 errors.
9. `pnpm build` — produces `dist/index.{js,d.ts}` + `dist/utils/index.{js,d.ts}`; bundle does not statically import any provider package (verified by inspecting `dist/index.js`).
10. Slice 1 acceptance criteria still hold (no regression).

## Out of scope (deferred)

| Item | Slice |
|---|---|
| Imperative `client.registerModel()` | 3 |
| Retry middleware (§8.2) + fallback chain (§6.3) | 3 |
| AbortSignal threading through public API | 3 |
| BFL, Fal, Replicate, Together built-ins + adapters | 3 |
| `edit` / `variations` operations | 4 |
| `generateText` path (Nano Banana, gemini-3-pro-image multimodal) | 4 |
| `batch` operation | 5 |
| `listModels`, `getModel`, `checkCapability`, `health` | 6 |
| Plugin system (§12.4), config file, presets | 7 |
| Custom transport (§12.2) | post-v1 |

If something on this list is genuinely needed mid-slice, surface it before adding code.
