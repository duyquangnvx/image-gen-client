# image-gen-client v1 — Slice 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direct mode + multi-provider support to the slice-1 library. Three providers go online: OpenAI native, Google native, and OpenAI-compatible (covering the local `cx` endpoint at `http://localhost:20128/v1`). Validated by both mocked unit/integration tests and an opt-in real-network E2E suite.

**Architecture:** Extend the existing layered library. Resolver gains a `direct` branch and a new `resolveProvider` that returns a discriminated `ResolvedProvider`. New per-provider adapters dynamic-import their AI-SDK packages and pre-build the AI-SDK image-model handle. A `selectAdapter` factory dispatches on `ResolvedProvider`. Operations/generate.ts threads the new adapter selection and the new `timeout` middleware. Public surface adds `defineModel`, `ProviderConfig`, `RegisteredModel`, and four error subtypes.

**Tech Stack:** TypeScript 5 (strict, ESM-only), Node ≥ 20, pnpm, tsup, vitest, eslint, prettier. Runtime deps: `ai ^6`, `@ai-sdk/gateway ^3`, `zod ^3`. Optional peers added: `@ai-sdk/openai-compatible`. (`@ai-sdk/openai`, `@ai-sdk/google` already declared in slice 1.)

---

## Source-of-Truth Documents

Open in a side window:

- `docs/image-gen-client.spec.md` — requirements (v0.1).
- `docs/superpowers/specs/2026-05-10-image-gen-client-build-design.md` — overall build design.
- `docs/superpowers/specs/2026-05-10-image-gen-client-slice-2-design.md` — slice-2 locked design (this plan implements it).

When the docs disagree, the requirements spec wins for behavior. Update the design or this plan if needed.

## What Slice 2 Includes

- `mode: 'direct'` and `mode: 'auto'` resolve correctly. `'auto'` maps to gateway when `AI_GATEWAY_API_KEY` is set, otherwise direct.
- Three direct-mode adapters: OpenAI (`openai/*`), Google (`google/*`), OpenAI-compatible (any provider key with `kind: 'openai-compatible'`).
- `providers` constructor option (per-provider credentials/baseURL).
- `models` constructor option + exported `defineModel(id, providerKey, capability)` helper.
- Registry adds `google/imagen-4`. Built-ins are merged with user-supplied `models` (user override wins, per spec §7.3).
- Error subtypes: `RateLimitError`, `AuthError`, `ContentPolicyError`, `ModelUnavailableError`. `mapAiSdkError` classifies AI-SDK errors by HTTP status / content-policy signal.
- Timeout middleware (default 120,000 ms; per-call override via `timeoutMs` not yet exposed in `GenerateInput` — slice 3).
- `pnpm test:e2e` script + `vitest.config.e2e.ts` + a single E2E test that talks to local cx, with auto-skip when unreachable.

## What Slice 2 Does NOT Include

- Imperative `client.registerModel()` (slice 3).
- Retry middleware (§8.2) + fallback chain (§6.3) (slice 3).
- AbortSignal threading through the public `GenerateInput` surface (slice 3 — the field exists in types but isn't yet wired to a public option that overrides `timeoutMs` on a per-call basis).
- Other built-in providers: BFL, Fal, Replicate, Together (slice 3).
- `edit`, `variations`, `batch` operations (slices 4, 5).
- `generateText` API path (Nano Banana, gemini-3-pro-image multimodal) (slice 4).
- Plugin system, config file, presets (slice 7).

If a task seems to need something from a deferred slice, stop and re-read the slice-2 design doc.

## File Inventory

Created in this plan (relative to repo root):

```
src/define-model.ts
src/define-model.test.ts
src/providers/openai.ts
src/providers/openai.test.ts
src/providers/google.ts
src/providers/google.test.ts
src/providers/openai-compatible.ts
src/providers/openai-compatible.test.ts
src/providers/select.ts
src/providers/select.test.ts
src/middleware/timeout.ts
src/middleware/timeout.test.ts
src/integration/generate-direct.integration.test.ts
src/integration/generate-openai-compatible.integration.test.ts
tests/e2e/_probe.ts
tests/e2e/cx-local.e2e.test.ts
vitest.config.e2e.ts
```

Modified:

```
package.json                 — add @ai-sdk/openai-compatible peer dep + test:e2e script
src/types.ts                 — add ProviderConfig, extend ClientOptions (providers, models)
src/types.test-d.ts          — type-level tests for new fields
src/errors.ts                — 4 new subtype classes
src/errors.test.ts           — tests for the 4 subtypes
src/registry.ts              — add google/imagen-4 entry, mergeModels function, re-export defineModel
src/registry.test.ts         — tests for mergeModels + new entry
src/resolver.ts              — auto→direct branch, new resolveProvider
src/resolver.test.ts         — tests for new branches
src/config.ts                — providers/models in ResolvedConfig, merged registry
src/config.test.ts           — tests for new fields
src/operations/generate.ts   — wire resolveProvider + selectAdapter + timeout, extend mapAiSdkError
src/operations/generate.test.ts — extend tests
src/client.ts                — pass providers/models through (no test change beyond config flow)
src/index.ts                 — export defineModel, ProviderConfig, 4 error subtypes
vitest.config.ts             — exclude tests/e2e/**
```

## Working Conventions

- **TDD discipline.** Every task that produces runtime code starts with a failing test. No implementation without a red test.
- **AI SDK v6 verification.** Tasks 7, 8, 9 touch `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`. Before implementing, invoke `Skill:ai-sdk` to confirm the current factory shape (most likely `provider.image('model-name')` vs `provider.imageModel('model-name')`). Adjust the implementation code shown in the task accordingly. The test code in the task does not depend on the exact factory name.
- **Spec citations.** Code comments may cite spec sections as `§N` when behavior is non-obvious. Don't write comments otherwise.
- **No `any`.** No `as` without a runtime verifier preceding it. No `!`.
- **Surgical edits.** Only touch code listed in the task's Files block.
- **`exactOptionalPropertyTypes`.** Use the `&&`-spread pattern when assigning optional fields: `...(x !== undefined && { key: x })`. Don't widen types with `as`.
- **Frequent commits.** One commit per task. Conventional Commits style.
- **Tests pass before commit.** `pnpm test` and `pnpm typecheck` are green at every commit. `pnpm lint` should also be green; if it goes red, fix in the same commit.

---

## Task 1: Peer dependency for OpenAI-compatible

**Files:**
- Modify: `package.json`

This task has no runtime test of its own — its verification is that the package resolves and `pnpm install` succeeds.

- [ ] **Step 1: Verify the current latest major of `@ai-sdk/openai-compatible` on npm**

Run: `pnpm view @ai-sdk/openai-compatible version`

Expected: prints a single version string, e.g. `1.0.27`. Note the major and minor.

- [ ] **Step 2: Update `package.json`**

Path: `package.json` — modify `peerDependencies` and `peerDependenciesMeta`. Replace those two blocks with:

```json
  "peerDependencies": {
    "@ai-sdk/openai": "^3.0.0",
    "@ai-sdk/google": "^3.0.0",
    "@ai-sdk/openai-compatible": "^<MAJOR>.0.0",
    "@ai-sdk/fal": "^2.0.0",
    "@ai-sdk/replicate": "^2.0.0",
    "@ai-sdk/togetherai": "^2.0.0"
  },
  "peerDependenciesMeta": {
    "@ai-sdk/openai": { "optional": true },
    "@ai-sdk/google": { "optional": true },
    "@ai-sdk/openai-compatible": { "optional": true },
    "@ai-sdk/fal": { "optional": true },
    "@ai-sdk/replicate": { "optional": true },
    "@ai-sdk/togetherai": { "optional": true }
  },
```

Replace `<MAJOR>` with the major number from Step 1. If the major in `@ai-sdk/openai` or `@ai-sdk/google` has moved past `^3` since slice 1, bump those too and note the change in this task's commit message.

- [ ] **Step 3: Add `test:e2e` script**

Path: `package.json` — modify `scripts` block. Add the `test:e2e` line so the block reads:

```json
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "vitest run --config vitest.config.e2e.ts",
    "lint": "eslint src",
    "format": "prettier --write \"src/**/*.ts\""
  },
```

- [ ] **Step 4: Install peer dep as a dev dep so adapter tests can `vi.mock` it**

Run: `pnpm add -D @ai-sdk/openai-compatible@<MAJOR>`

Expected: pnpm reports the package added to `devDependencies`. (Real consumers install it themselves as a peer; the dev-dep makes it resolvable in our test environment.)

- [ ] **Step 5: Verify `@ai-sdk/openai` and `@ai-sdk/google` are also installed as dev deps**

Run: `pnpm ls @ai-sdk/openai @ai-sdk/google`

Expected: both shown in dependencies tree. If either is missing, run `pnpm add -D @ai-sdk/openai @ai-sdk/google` to install both.

- [ ] **Step 6: Verify install + existing suite**

Run: `pnpm install && pnpm test && pnpm typecheck && pnpm lint`

Expected: all four green. Slice-1 tests must still pass (no change to runtime code yet).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @ai-sdk/openai-compatible peer dep and test:e2e script"
```

---

## Task 2: Extend public types — ProviderConfig + ClientOptions

**Files:**
- Modify: `src/types.ts`
- Modify: `src/types.test-d.ts`

- [ ] **Step 1: Write the failing type-level test**

Path: `src/types.test-d.ts` — append at end of file:

```typescript
import { expectTypeOf, test } from 'vitest';
import type { ClientOptions, ProviderConfig, ProviderConfigNative, ProviderConfigOpenAICompatible } from './types.js';

test('ProviderConfig is a discriminated union on kind', () => {
  expectTypeOf<ProviderConfig>().toMatchTypeOf<ProviderConfigNative | ProviderConfigOpenAICompatible>();
});

test('ProviderConfigNative shape', () => {
  expectTypeOf<ProviderConfigNative['kind']>().toEqualTypeOf<'native' | undefined>();
  expectTypeOf<ProviderConfigNative['apiKey']>().toEqualTypeOf<string | undefined>();
});

test('ProviderConfigOpenAICompatible requires baseURL', () => {
  expectTypeOf<ProviderConfigOpenAICompatible['kind']>().toEqualTypeOf<'openai-compatible'>();
  expectTypeOf<ProviderConfigOpenAICompatible['baseURL']>().toBeString();
});

test('ClientOptions has providers and models fields', () => {
  expectTypeOf<ClientOptions['providers']>().toEqualTypeOf<Readonly<Record<string, ProviderConfig>> | undefined>();
  expectTypeOf<ClientOptions['models']>().not.toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/types.test-d.ts`

Expected: TypeScript errors — `ProviderConfig`, `ProviderConfigNative`, `ProviderConfigOpenAICompatible` not exported from types; `providers`/`models` not on `ClientOptions`.

- [ ] **Step 3: Extend `src/types.ts`**

Path: `src/types.ts` — add after the existing `ApiPath` type and before `Capability`:

```typescript
export interface ProviderConfigNative {
  readonly kind?: 'native';
  readonly apiKey?: string;
}

export interface ProviderConfigOpenAICompatible {
  readonly kind: 'openai-compatible';
  readonly baseURL: string;
  readonly apiKey?: string;
  readonly name?: string;
}

export type ProviderConfig = ProviderConfigNative | ProviderConfigOpenAICompatible;
```

Then move the `RegisteredModel` interface here from `src/registry.ts` (we will update `registry.ts` in Task 5; for now, add the type to `types.ts`):

```typescript
export interface RegisteredModel {
  readonly id: ModelId;
  readonly provider: string;
  readonly capability: Capability;
}
```

Finally, extend `ClientOptions` (modify the existing interface):

```typescript
export interface ClientOptions {
  readonly mode?: Mode | 'auto';
  readonly defaultModel?: ModelId;
  readonly logger?: Logger;
  readonly timeoutMs?: number;
  readonly gateway?: {
    readonly apiKey?: string;
    readonly baseURL?: string;
  };
  readonly providers?: Readonly<Record<string, ProviderConfig>>;
  readonly models?: Readonly<Record<ModelId, RegisteredModel>>;
}
```

- [ ] **Step 4: Run type-level tests**

Run: `pnpm test src/types.test-d.ts`

Expected: PASS.

- [ ] **Step 5: Run full suite + typecheck**

Run: `pnpm test && pnpm typecheck`

Expected: green. (Existing slice-1 tests do not touch the new fields. `registry.ts` still has its own `RegisteredModel` declaration — both declarations co-exist briefly until Task 5 removes the duplicate.)

> If `pnpm typecheck` fails because `RegisteredModel` is declared in two places with conflicting shapes: confirm both shapes are character-identical. If TypeScript still complains, leave the duplicate as-is in this task and Task 5 will replace `registry.ts`'s copy with an import from `types.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/types.test-d.ts
git commit -m "feat(types): add ProviderConfig and extend ClientOptions for slice 2"
```

---

## Task 3: Error subtypes — Rate-limit / Auth / ContentPolicy / ModelUnavailable

**Files:**
- Modify: `src/errors.ts`
- Modify: `src/errors.test.ts`

- [ ] **Step 1: Write the failing tests**

Path: `src/errors.test.ts` — append:

```typescript
import {
  RateLimitError,
  AuthError,
  ContentPolicyError,
  ModelUnavailableError,
  ImageGenProviderError,
} from './errors.js';

describe('error subtypes (slice 2)', () => {
  test('RateLimitError extends ImageGenProviderError, retryable=true, code=RATE_LIMIT', () => {
    const err = new RateLimitError('rate limit hit', { modelId: 'openai/gpt-image-2', mode: 'direct' });
    expect(err).toBeInstanceOf(ImageGenProviderError);
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.category).toBe('provider');
    expect(err.retryable).toBe(true);
    expect(err.modelId).toBe('openai/gpt-image-2');
    expect(err.name).toBe('RateLimitError');
  });

  test('AuthError code=AUTH retryable=false', () => {
    const err = new AuthError('bad key');
    expect(err).toBeInstanceOf(ImageGenProviderError);
    expect(err.code).toBe('AUTH');
    expect(err.retryable).toBe(false);
    expect(err.name).toBe('AuthError');
  });

  test('ContentPolicyError code=CONTENT_POLICY retryable=false', () => {
    const err = new ContentPolicyError('blocked');
    expect(err.code).toBe('CONTENT_POLICY');
    expect(err.retryable).toBe(false);
    expect(err.name).toBe('ContentPolicyError');
  });

  test('ModelUnavailableError defaults to MODEL_UNAVAILABLE retryable=true', () => {
    const err = new ModelUnavailableError('upstream 503');
    expect(err.code).toBe('MODEL_UNAVAILABLE');
    expect(err.retryable).toBe(true);
    expect(err.name).toBe('ModelUnavailableError');
  });

  test('ModelUnavailableError can be constructed with code=MODEL_NOT_FOUND retryable=false', () => {
    const err = new ModelUnavailableError('404 model not found', { code: 'MODEL_NOT_FOUND', retryable: false });
    expect(err.code).toBe('MODEL_NOT_FOUND');
    expect(err.retryable).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/errors.test.ts`

Expected: imports for `RateLimitError`, `AuthError`, `ContentPolicyError`, `ModelUnavailableError` resolve to undefined → tests fail.

- [ ] **Step 3: Implement the four subtype classes**

Path: `src/errors.ts` — append at end of file:

```typescript
export interface RateLimitInit extends SubtypeInit {
  readonly retryAfterMs?: number;
}

export class RateLimitError extends ImageGenProviderError {
  readonly retryAfterMs?: number;
  constructor(message: string, init: RateLimitInit = {}) {
    super(message, 'RATE_LIMIT', { ...init, retryable: init.retryable ?? true });
    this.name = 'RateLimitError';
    if (init.retryAfterMs !== undefined) this.retryAfterMs = init.retryAfterMs;
  }
}

export class AuthError extends ImageGenProviderError {
  constructor(message: string, init: SubtypeInit = {}) {
    super(message, 'AUTH', { ...init, retryable: init.retryable ?? false });
    this.name = 'AuthError';
  }
}

export class ContentPolicyError extends ImageGenProviderError {
  constructor(message: string, init: SubtypeInit = {}) {
    super(message, 'CONTENT_POLICY', { ...init, retryable: init.retryable ?? false });
    this.name = 'ContentPolicyError';
  }
}

export interface ModelUnavailableInit extends SubtypeInit {
  readonly code?: 'MODEL_NOT_FOUND' | 'MODEL_UNAVAILABLE';
}

export class ModelUnavailableError extends ImageGenProviderError {
  constructor(message: string, init: ModelUnavailableInit = {}) {
    const code = init.code ?? 'MODEL_UNAVAILABLE';
    const retryable = init.retryable ?? code === 'MODEL_UNAVAILABLE';
    super(message, code, { ...init, retryable });
    this.name = 'ModelUnavailableError';
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/errors.test.ts`

Expected: PASS — all 5 new tests + existing slice-1 error tests.

- [ ] **Step 5: Run full suite + typecheck**

Run: `pnpm test && pnpm typecheck`

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/errors.ts src/errors.test.ts
git commit -m "feat(errors): add RateLimit/Auth/ContentPolicy/ModelUnavailable subtypes"
```

---

## Task 4: defineModel helper

**Files:**
- Create: `src/define-model.ts`
- Create: `src/define-model.test.ts`

- [ ] **Step 1: Write the failing tests**

Path: `src/define-model.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { defineModel } from './define-model.js';
import { ImageGenConfigError } from './errors.js';

describe('defineModel', () => {
  test('returns a frozen RegisteredModel', () => {
    const model = defineModel('foo/bar', 'foo', {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      transparentBackground: false,
      maxN: 1,
      supportsSeed: false,
      supportsNegativePrompt: false,
      apiPath: 'generateImage',
      sizes: ['1024x1024'],
    });

    expect(model.id).toBe('foo/bar');
    expect(model.provider).toBe('foo');
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.capability)).toBe(true);
    expect(Object.isFrozen(model.capability.sizes)).toBe(true);
  });

  test('throws ImageGenConfigError when id prefix does not match providerKey', () => {
    expect(() =>
      defineModel('foo/bar', 'baz', {
        textToImage: true,
        imageEdit: false,
        multiReference: false,
        transparentBackground: false,
        maxN: 1,
        supportsSeed: false,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      }),
    ).toThrow(ImageGenConfigError);
  });

  test('throws when id has no slash', () => {
    expect(() =>
      defineModel('badid' as `${string}/${string}`, 'foo', {
        textToImage: true,
        imageEdit: false,
        multiReference: false,
        transparentBackground: false,
        maxN: 1,
        supportsSeed: false,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      }),
    ).toThrow(/must be 'provider\/model'/);
  });

  test('mutating the returned capability throws (deep frozen)', () => {
    const model = defineModel('foo/bar', 'foo', {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      transparentBackground: false,
      maxN: 1,
      supportsSeed: false,
      supportsNegativePrompt: false,
      apiPath: 'generateImage',
      sizes: ['1024x1024'],
    });

    expect(() => {
      (model.capability.sizes as string[]).push('512x512');
    }).toThrow(TypeError);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/define-model.test.ts`

Expected: import resolves to undefined; tests fail.

- [ ] **Step 3: Implement `defineModel`**

Path: `src/define-model.ts`:

```typescript
import { freezeCapability } from './capabilities.js';
import { ImageGenConfigError } from './errors.js';
import type { Capability, ModelId, RegisteredModel } from './types.js';

export function defineModel(
  id: ModelId,
  providerKey: string,
  capability: Capability,
): RegisteredModel {
  const slash = id.indexOf('/');
  if (slash <= 0 || slash === id.length - 1) {
    throw new ImageGenConfigError(
      `model id '${id}' must be 'provider/model' (got no '/' or empty side)`,
      'CONFIG_BAD_MODEL_ID',
      { hint: "use 'providerKey/modelName' format" },
    );
  }
  const prefix = id.slice(0, slash);
  if (prefix !== providerKey) {
    throw new ImageGenConfigError(
      `model id '${id}' prefix '${prefix}' does not match providerKey '${providerKey}'`,
      'CONFIG_MODEL_ID_MISMATCH',
      { hint: `change id to '${providerKey}/${id.slice(slash + 1)}' or providerKey to '${prefix}'` },
    );
  }

  return Object.freeze({
    id,
    provider: providerKey,
    capability: freezeCapability(capability),
  });
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/define-model.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full suite + typecheck**

Run: `pnpm test && pnpm typecheck`

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/define-model.ts src/define-model.test.ts
git commit -m "feat: add defineModel helper with id/prefix validation"
```

---

## Task 5: Registry — google/imagen-4 + mergeModels

**Files:**
- Modify: `src/registry.ts`
- Modify: `src/registry.test.ts`

- [ ] **Step 1: Write the failing tests**

Path: `src/registry.test.ts` — append:

```typescript
import { mergeModels, BUILT_IN_MODELS } from './registry.js';
import { defineModel } from './define-model.js';

describe('google/imagen-4 built-in entry', () => {
  test('exists in BUILT_IN_MODELS with apiPath=generateImage', () => {
    const m = BUILT_IN_MODELS['google/imagen-4'];
    expect(m).toBeDefined();
    expect(m?.provider).toBe('google');
    expect(m?.capability.apiPath).toBe('generateImage');
    expect(m?.capability.textToImage).toBe(true);
  });
});

describe('mergeModels', () => {
  const cxModel = defineModel('cx/test-image', 'cx', {
    textToImage: true,
    imageEdit: false,
    multiReference: false,
    transparentBackground: false,
    maxN: 1,
    supportsSeed: false,
    supportsNegativePrompt: false,
    apiPath: 'generateImage',
  });

  test('returns built-ins when user record is empty', () => {
    const merged = mergeModels(BUILT_IN_MODELS, {});
    expect(merged['openai/gpt-image-2']).toBeDefined();
    expect(merged['google/imagen-4']).toBeDefined();
  });

  test('adds user models alongside built-ins', () => {
    const merged = mergeModels(BUILT_IN_MODELS, { 'cx/test-image': cxModel });
    expect(merged['cx/test-image']).toBe(cxModel);
    expect(merged['openai/gpt-image-2']).toBeDefined();
  });

  test('user override wins on the same id', () => {
    const overridden = defineModel('openai/gpt-image-2', 'openai', {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      transparentBackground: false,
      maxN: 99,
      supportsSeed: false,
      supportsNegativePrompt: false,
      apiPath: 'generateImage',
    });
    const merged = mergeModels(BUILT_IN_MODELS, { 'openai/gpt-image-2': overridden });
    expect(merged['openai/gpt-image-2']?.capability.maxN).toBe(99);
  });

  test('returned record is frozen', () => {
    const merged = mergeModels(BUILT_IN_MODELS, {});
    expect(Object.isFrozen(merged)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/registry.test.ts`

Expected: failures — `mergeModels` not exported, `google/imagen-4` not in BUILT_IN_MODELS.

- [ ] **Step 3: Verify Google Imagen 4 capabilities**

Invoke `Skill:ai-sdk` with: "What sizes and aspect ratios does the Google Imagen 4 model support via @ai-sdk/google v3 generateImage? Confirm the model id string (`imagen-4` vs `imagen-4.0-generate-001` etc.)."

Use the verified info to fill the capability descriptor below. If the skill returns uncertain results, default to a permissive descriptor: no `sizes` array, no `aspectRatios` array, `maxN: 4`. The tests above only assert structural fields; specific sizes/ratios aren't enforced by tests.

- [ ] **Step 4: Implement registry changes**

Path: `src/registry.ts` — replace the file with:

```typescript
import { defineModel } from './define-model.js';
import type { ModelId, RegisteredModel } from './types.js';

export type { RegisteredModel } from './types.js';
export { defineModel } from './define-model.js';

// §7.1 — slice 1 shipped openai/gpt-image-2; slice 2 adds google/imagen-4.
// Other models land in slice 3.
export const BUILT_IN_MODELS: Readonly<Record<ModelId, RegisteredModel>> = Object.freeze({
  'openai/gpt-image-2': defineModel('openai/gpt-image-2', 'openai', {
    textToImage: true,
    imageEdit: true,
    multiReference: true,
    transparentBackground: true,
    maxN: 4,
    supportsSeed: true,
    supportsNegativePrompt: false,
    apiPath: 'generateImage',
    sizes: ['1024x1024', '1536x1024', '1024x1536', '2048x2048', '4096x4096'],
  }),
  'google/imagen-4': defineModel('google/imagen-4', 'google', {
    textToImage: true,
    imageEdit: false,
    multiReference: false,
    transparentBackground: false,
    maxN: 4,
    supportsSeed: true,
    supportsNegativePrompt: false,
    apiPath: 'generateImage',
    aspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9'],
  }),
});

export function getModel(id: string): RegisteredModel | undefined {
  return BUILT_IN_MODELS[id as ModelId];
}

export function listRegisteredModelIds(): readonly ModelId[] {
  return Object.keys(BUILT_IN_MODELS) as ModelId[];
}

export function mergeModels(
  builtIn: Readonly<Record<ModelId, RegisteredModel>>,
  userModels: Readonly<Record<ModelId, RegisteredModel>>,
): Readonly<Record<ModelId, RegisteredModel>> {
  return Object.freeze({ ...builtIn, ...userModels });
}
```

If the verified Imagen 4 model id string is something other than `google/imagen-4` (e.g. `google/imagen-4.0-generate-001`), use that as the canonical id. The tests above use `google/imagen-4` — update them in lockstep if the canonical id differs.

- [ ] **Step 5: Run tests**

Run: `pnpm test src/registry.test.ts`

Expected: PASS.

- [ ] **Step 6: Run full suite + typecheck**

Run: `pnpm test && pnpm typecheck`

Expected: green. (Tasks 2 and 4 already aligned the type imports; this task removes the old in-file `defineModel` and `RegisteredModel` declarations.)

- [ ] **Step 7: Commit**

```bash
git add src/registry.ts src/registry.test.ts
git commit -m "feat(registry): add google/imagen-4 + mergeModels"
```

---

## Task 6: Resolver — auto branch + resolveProvider

**Files:**
- Modify: `src/resolver.ts`
- Modify: `src/resolver.test.ts`

- [ ] **Step 1: Write the failing tests**

Path: `src/resolver.test.ts` — replace existing tests for the `'direct mode lands in slice 2'` guard with the new behavior, and add tests for `resolveProvider`.

The full new content of `src/resolver.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { resolveMode, resolveProvider } from './resolver.js';
import type { ResolvedProvider } from './resolver.js';
import { ImageGenConfigError } from './errors.js';

describe('resolveMode', () => {
  test('per-call gateway override returns gateway', () => {
    expect(
      resolveMode({ modelId: 'openai/gpt-image-2', callOverride: 'gateway', env: {} }),
    ).toBe('gateway');
  });

  test('per-call direct override returns direct', () => {
    expect(
      resolveMode({ modelId: 'openai/gpt-image-2', callOverride: 'direct', env: {} }),
    ).toBe('direct');
  });

  test('explicit clientMode=gateway returns gateway', () => {
    expect(
      resolveMode({ modelId: 'openai/gpt-image-2', clientMode: 'gateway', env: {} }),
    ).toBe('gateway');
  });

  test('explicit clientMode=direct returns direct', () => {
    expect(
      resolveMode({ modelId: 'openai/gpt-image-2', clientMode: 'direct', env: {} }),
    ).toBe('direct');
  });

  test('auto + AI_GATEWAY_API_KEY => gateway', () => {
    expect(
      resolveMode({
        modelId: 'openai/gpt-image-2',
        clientMode: 'auto',
        env: { AI_GATEWAY_API_KEY: 'k' },
      }),
    ).toBe('gateway');
  });

  test('auto + gatewayApiKey from config => gateway', () => {
    expect(
      resolveMode({
        modelId: 'openai/gpt-image-2',
        clientMode: 'auto',
        env: {},
        gatewayApiKey: 'k',
      }),
    ).toBe('gateway');
  });

  test('auto + no gateway key => direct', () => {
    expect(
      resolveMode({ modelId: 'openai/gpt-image-2', clientMode: 'auto', env: {} }),
    ).toBe('direct');
  });
});

describe('resolveProvider', () => {
  test('gateway mode returns ResolvedProvider gateway variant', () => {
    const res = resolveProvider({
      modelId: 'openai/gpt-image-2',
      mode: 'gateway',
      providers: {},
      env: { AI_GATEWAY_API_KEY: 'k' },
    });
    expect(res.mode).toBe('gateway');
    expect(res.providerKey).toBe('openai');
  });

  test('direct + native provider with apiKey in providers config', () => {
    const res = resolveProvider({
      modelId: 'openai/gpt-image-2',
      mode: 'direct',
      providers: { openai: { apiKey: 'sk-x' } },
      env: {},
    });
    expect(res.mode).toBe('direct');
    if (res.mode !== 'direct' || res.kind !== 'native') throw new Error('unexpected variant');
    expect(res.apiKey).toBe('sk-x');
    expect(res.providerKey).toBe('openai');
  });

  test('direct + native + apiKey from env when providers config absent', () => {
    const res = resolveProvider({
      modelId: 'openai/gpt-image-2',
      mode: 'direct',
      providers: {},
      env: { OPENAI_API_KEY: 'sk-env' },
    });
    if (res.mode !== 'direct' || res.kind !== 'native') throw new Error('unexpected variant');
    expect(res.apiKey).toBe('sk-env');
  });

  test('direct + google reads GOOGLE_GENERATIVE_AI_API_KEY env', () => {
    const res = resolveProvider({
      modelId: 'google/imagen-4',
      mode: 'direct',
      providers: {},
      env: { GOOGLE_GENERATIVE_AI_API_KEY: 'sk-g' },
    });
    if (res.mode !== 'direct' || res.kind !== 'native') throw new Error('unexpected variant');
    expect(res.apiKey).toBe('sk-g');
  });

  test('direct + openai-compatible returns variant with baseURL and name', () => {
    const res = resolveProvider({
      modelId: 'cx/gpt-5.4-image',
      mode: 'direct',
      providers: {
        cx: { kind: 'openai-compatible', baseURL: 'http://localhost:20128/v1', apiKey: 'k', name: 'cx' },
      },
      env: {},
    });
    if (res.mode !== 'direct' || res.kind !== 'openai-compatible') throw new Error('unexpected variant');
    expect(res.baseURL).toBe('http://localhost:20128/v1');
    expect(res.apiKey).toBe('k');
    expect(res.name).toBe('cx');
    expect(res.providerKey).toBe('cx');
  });

  test('direct + openai-compatible defaults name to providerKey when name not set', () => {
    const res = resolveProvider({
      modelId: 'cx/gpt-5.4-image',
      mode: 'direct',
      providers: { cx: { kind: 'openai-compatible', baseURL: 'http://x/v1' } },
      env: {},
    });
    if (res.mode !== 'direct' || res.kind !== 'openai-compatible') throw new Error('unexpected variant');
    expect(res.name).toBe('cx');
    expect(res.apiKey).toBe('');
  });

  test('direct + openai-compatible without baseURL throws CONFIG_NO_PROVIDER', () => {
    expect(() =>
      resolveProvider({
        modelId: 'cx/gpt-5.4-image',
        mode: 'direct',
        providers: { cx: { kind: 'openai-compatible', baseURL: '' } },
        env: {},
      }),
    ).toThrow(ImageGenConfigError);
  });

  test('direct mode + no key anywhere throws CONFIG_NO_PROVIDER', () => {
    expect(() =>
      resolveProvider({
        modelId: 'openai/gpt-image-2',
        mode: 'direct',
        providers: {},
        env: {},
      }),
    ).toThrow(ImageGenConfigError);
  });

  test('ResolvedProvider type matches union', () => {
    const x: ResolvedProvider = { providerKey: 'openai', mode: 'gateway' };
    expect(x.mode).toBe('gateway');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/resolver.test.ts`

Expected: existing direct-mode-throws test passes only because slice-1 throws; new tests fail because `resolveProvider` doesn't exist and auto+no-key currently throws instead of returning 'direct'.

- [ ] **Step 3: Replace `src/resolver.ts`**

Path: `src/resolver.ts`:

```typescript
import { ImageGenConfigError } from './errors.js';
import type { Mode, ModelId, ProviderConfig } from './types.js';

export interface ResolveModeArgs {
  readonly modelId: ModelId;
  readonly callOverride?: Mode;
  readonly clientMode?: Mode | 'auto';
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly gatewayApiKey?: string;
}

// §6.1 — auto resolves to gateway when a gateway key is available (config or
// env), else direct.
export function resolveMode(args: ResolveModeArgs): Mode {
  if (args.callOverride !== undefined) return args.callOverride;
  const clientMode = args.clientMode ?? 'auto';
  if (clientMode !== 'auto') return clientMode;
  const hasGatewayKey =
    args.gatewayApiKey !== undefined || args.env.AI_GATEWAY_API_KEY !== undefined;
  return hasGatewayKey ? 'gateway' : 'direct';
}

export type ResolvedProvider =
  | { readonly providerKey: string; readonly mode: 'gateway' }
  | {
      readonly providerKey: string;
      readonly mode: 'direct';
      readonly kind: 'native';
      readonly apiKey: string;
    }
  | {
      readonly providerKey: string;
      readonly mode: 'direct';
      readonly kind: 'openai-compatible';
      readonly apiKey: string;
      readonly baseURL: string;
      readonly name: string;
    };

export interface ResolveProviderArgs {
  readonly modelId: ModelId;
  readonly mode: Mode;
  readonly providers: Readonly<Record<string, ProviderConfig>>;
  readonly env: Readonly<Record<string, string | undefined>>;
}

const NATIVE_ENV_KEY: Readonly<Record<string, string>> = {
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

export function resolveProvider(args: ResolveProviderArgs): ResolvedProvider {
  const slash = args.modelId.indexOf('/');
  const providerKey = slash > 0 ? args.modelId.slice(0, slash) : args.modelId;

  if (args.mode === 'gateway') {
    return { providerKey, mode: 'gateway' };
  }

  const cfg = args.providers[providerKey];
  if (cfg !== undefined && cfg.kind === 'openai-compatible') {
    if (!cfg.baseURL) {
      throw new ImageGenConfigError(
        `provider '${providerKey}' is openai-compatible but baseURL is empty`,
        'CONFIG_NO_PROVIDER',
        {
          modelId: args.modelId,
          mode: 'direct',
          hint: `set providers.${providerKey}.baseURL`,
        },
      );
    }
    return {
      providerKey,
      mode: 'direct',
      kind: 'openai-compatible',
      apiKey: cfg.apiKey ?? '',
      baseURL: cfg.baseURL,
      name: cfg.name ?? providerKey,
    };
  }

  const apiKey = cfg?.apiKey ?? args.env[NATIVE_ENV_KEY[providerKey] ?? ''];
  if (apiKey === undefined || apiKey === '') {
    const envName = NATIVE_ENV_KEY[providerKey];
    const hint = envName
      ? `set ${envName} or pass providers.${providerKey}.apiKey`
      : `pass providers.${providerKey}.apiKey or use kind: 'openai-compatible' with a baseURL`;
    throw new ImageGenConfigError(
      `no api key for provider '${providerKey}' in direct mode`,
      'CONFIG_NO_PROVIDER',
      { modelId: args.modelId, mode: 'direct', hint },
    );
  }

  return { providerKey, mode: 'direct', kind: 'native', apiKey };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/resolver.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full suite — expect existing slice-1 tests to flag the deleted error**

Run: `pnpm test`

Expected: most tests still pass; any slice-1 test that asserted `'CONFIG_DIRECT_MODE_NOT_AVAILABLE'` no longer applies. If any test fails due to that obsolete code, fix the test inline by changing the expectation to `mode === 'direct'` returned cleanly. Do not skip the test.

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/resolver.ts src/resolver.test.ts
git commit -m "feat(resolver): auto-mode fallback to direct + new resolveProvider"
```

---

## Task 7: OpenAI direct adapter

**Files:**
- Create: `src/providers/openai.ts`
- Create: `src/providers/openai.test.ts`

- [ ] **Step 1: Verify the AI SDK image-model factory shape**

Invoke `Skill:ai-sdk` with: "In `@ai-sdk/openai` v3, what is the function to create an image model handle from a configured provider? Specifically: after `const openai = createOpenAI({apiKey})`, do I call `openai.image('gpt-image-2')`, `openai.imageModel('gpt-image-2')`, or something else? Confirm with a code example."

Note the answer. The implementation below uses `provider.image(modelName)`. If the verified API differs, swap that one call. Tests assert on the call site, so they will surface a wrong choice immediately.

- [ ] **Step 2: Write the failing tests**

Path: `src/providers/openai.test.ts`:

```typescript
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createOpenAIDirectAdapter } from './openai.js';
import type { ResolvedRequest } from './adapter.js';

const imageHandle = { __image: true, model: 'gpt-image-2' };
const imageFactory = vi.fn(() => imageHandle);
const createOpenAIMock = vi.fn(() => ({ image: imageFactory }));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock,
}));

const baseReq: ResolvedRequest = {
  operation: 'generate',
  modelId: 'openai/gpt-image-2',
  mode: 'direct',
  apiPath: 'generateImage',
  capability: {
    textToImage: true,
    imageEdit: true,
    multiReference: true,
    transparentBackground: true,
    maxN: 4,
    supportsSeed: true,
    supportsNegativePrompt: false,
    apiPath: 'generateImage',
  },
  prompt: 'a cat',
  n: 1,
};

beforeEach(() => {
  imageFactory.mockClear();
  createOpenAIMock.mockClear();
});

describe('OpenAI direct adapter', () => {
  test('factory dynamic-imports @ai-sdk/openai with apiKey and bakes the model handle', async () => {
    const adapter = await createOpenAIDirectAdapter({ apiKey: 'sk-test', modelName: 'gpt-image-2' });
    expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: 'sk-test' });
    expect(imageFactory).toHaveBeenCalledWith('gpt-image-2');
    expect(adapter.buildCall).toBeTypeOf('function');
  });

  test('buildCall returns generateImage with the pre-built model handle', async () => {
    const adapter = await createOpenAIDirectAdapter({ apiKey: 'sk-test', modelName: 'gpt-image-2' });
    const call = adapter.buildCall(baseReq);
    expect(call.fn).toBe('generateImage');
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.model).toBe(imageHandle);
    expect(call.args.prompt).toBe('a cat');
    expect(call.args.n).toBe(1);
  });

  test('buildCall threads optional fields (size, seed, providerOptions, abortSignal)', async () => {
    const adapter = await createOpenAIDirectAdapter({ apiKey: 'sk-test', modelName: 'gpt-image-2' });
    const ctrl = new AbortController();
    const call = adapter.buildCall({
      ...baseReq,
      size: '1024x1024',
      seed: 7,
      providerOptions: { quality: 'high' },
      signal: ctrl.signal,
    });
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.size).toBe('1024x1024');
    expect(call.args.seed).toBe(7);
    expect(call.args.providerOptions).toEqual({ quality: 'high' });
    expect(call.args.abortSignal).toBe(ctrl.signal);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test src/providers/openai.test.ts`

Expected: import for `createOpenAIDirectAdapter` resolves to undefined → tests fail.

- [ ] **Step 4: Implement the adapter**

Path: `src/providers/openai.ts`:

```typescript
import type { AdapterCall, ProviderAdapter, ResolvedRequest } from './adapter.js';

export interface OpenAIDirectAdapterOptions {
  readonly apiKey: string;
  readonly modelName: string;
}

export async function createOpenAIDirectAdapter(
  opts: OpenAIDirectAdapterOptions,
): Promise<ProviderAdapter> {
  const { createOpenAI } = await import('@ai-sdk/openai');
  const openai = createOpenAI({ apiKey: opts.apiKey });
  const imageModel = openai.image(opts.modelName);

  return {
    buildCall(req: ResolvedRequest): AdapterCall {
      return {
        fn: 'generateImage',
        args: {
          model: imageModel as unknown as string,
          prompt: req.prompt ?? '',
          n: req.n,
          ...(req.size !== undefined && { size: req.size }),
          ...(req.seed !== undefined && { seed: req.seed }),
          ...(req.providerOptions !== undefined && { providerOptions: req.providerOptions }),
          ...(req.signal !== undefined && { abortSignal: req.signal }),
        },
      };
    },
  };
}
```

> The `as unknown as string` cast on `model` is a known wart: `GenerateImageArgs.model` is typed as `string` in slice 1 (it modeled the gateway-only path); the AI SDK accepts string OR ImageModelV3 objects. Slice 3's resilience work will widen the adapter's `GenerateImageArgs.model` type properly. Keep the cast localized; do not propagate it.

- [ ] **Step 5: Run tests**

Run: `pnpm test src/providers/openai.test.ts`

Expected: PASS. If `image` is not the verified factory name (Step 1), swap to the correct one (`imageModel`, etc.) and rerun.

- [ ] **Step 6: Run full suite + typecheck + lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/providers/openai.ts src/providers/openai.test.ts
git commit -m "feat(providers): OpenAI direct adapter"
```

---

## Task 8: Google direct adapter

**Files:**
- Create: `src/providers/google.ts`
- Create: `src/providers/google.test.ts`

- [ ] **Step 1: Verify the Google factory**

Invoke `Skill:ai-sdk`: "In `@ai-sdk/google` v3, after `const google = createGoogleGenerativeAI({apiKey})`, what's the call to get an image model? `google.image('imagen-4')`? Confirm."

Note the answer; adjust the implementation in Step 4 if the factory name differs.

- [ ] **Step 2: Write the failing tests**

Path: `src/providers/google.test.ts`:

```typescript
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createGoogleDirectAdapter } from './google.js';
import type { ResolvedRequest } from './adapter.js';

const imageHandle = { __image: true, model: 'imagen-4' };
const imageFactory = vi.fn(() => imageHandle);
const createGoogleMock = vi.fn(() => ({ image: imageFactory }));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: createGoogleMock,
}));

const baseReq: ResolvedRequest = {
  operation: 'generate',
  modelId: 'google/imagen-4',
  mode: 'direct',
  apiPath: 'generateImage',
  capability: {
    textToImage: true,
    imageEdit: false,
    multiReference: false,
    transparentBackground: false,
    maxN: 4,
    supportsSeed: true,
    supportsNegativePrompt: false,
    apiPath: 'generateImage',
  },
  prompt: 'a cat',
  n: 1,
};

beforeEach(() => {
  imageFactory.mockClear();
  createGoogleMock.mockClear();
});

describe('Google direct adapter', () => {
  test('factory dynamic-imports @ai-sdk/google and bakes the image handle', async () => {
    const adapter = await createGoogleDirectAdapter({ apiKey: 'k', modelName: 'imagen-4' });
    expect(createGoogleMock).toHaveBeenCalledWith({ apiKey: 'k' });
    expect(imageFactory).toHaveBeenCalledWith('imagen-4');
    expect(adapter.buildCall).toBeTypeOf('function');
  });

  test('buildCall returns generateImage with handle and prompt', async () => {
    const adapter = await createGoogleDirectAdapter({ apiKey: 'k', modelName: 'imagen-4' });
    const call = adapter.buildCall(baseReq);
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.model).toBe(imageHandle);
    expect(call.args.prompt).toBe('a cat');
    expect(call.args.n).toBe(1);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test src/providers/google.test.ts`

Expected: failures (import undefined).

- [ ] **Step 4: Implement**

Path: `src/providers/google.ts`:

```typescript
import type { AdapterCall, ProviderAdapter, ResolvedRequest } from './adapter.js';

export interface GoogleDirectAdapterOptions {
  readonly apiKey: string;
  readonly modelName: string;
}

export async function createGoogleDirectAdapter(
  opts: GoogleDirectAdapterOptions,
): Promise<ProviderAdapter> {
  const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
  const google = createGoogleGenerativeAI({ apiKey: opts.apiKey });
  const imageModel = google.image(opts.modelName);

  return {
    buildCall(req: ResolvedRequest): AdapterCall {
      return {
        fn: 'generateImage',
        args: {
          model: imageModel as unknown as string,
          prompt: req.prompt ?? '',
          n: req.n,
          ...(req.size !== undefined && { size: req.size }),
          ...(req.seed !== undefined && { seed: req.seed }),
          ...(req.providerOptions !== undefined && { providerOptions: req.providerOptions }),
          ...(req.signal !== undefined && { abortSignal: req.signal }),
        },
      };
    },
  };
}
```

- [ ] **Step 5: Run tests + full suite**

Run: `pnpm test src/providers/google.test.ts && pnpm test && pnpm typecheck && pnpm lint`

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/providers/google.ts src/providers/google.test.ts
git commit -m "feat(providers): Google direct adapter"
```

---

## Task 9: OpenAI-compatible adapter

**Files:**
- Create: `src/providers/openai-compatible.ts`
- Create: `src/providers/openai-compatible.test.ts`

- [ ] **Step 1: Verify the openai-compatible factory**

Invoke `Skill:ai-sdk`: "In `@ai-sdk/openai-compatible` v1, the entry point is `createOpenAICompatible({ baseURL, apiKey, name })`. Confirm. After that, what's the call to obtain an image model handle? `provider.image('gpt-5.4-image')`? `provider.imageModel(...)`? Confirm."

Adjust the implementation in Step 4 if either factory name differs.

- [ ] **Step 2: Write the failing tests**

Path: `src/providers/openai-compatible.test.ts`:

```typescript
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createOpenAICompatibleAdapter } from './openai-compatible.js';
import type { ResolvedRequest } from './adapter.js';

const imageHandle = { __image: true, model: 'gpt-5.4-image' };
const imageFactory = vi.fn(() => imageHandle);
const createOAICompat = vi.fn(() => ({ image: imageFactory }));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: createOAICompat,
}));

const baseReq: ResolvedRequest = {
  operation: 'generate',
  modelId: 'cx/gpt-5.4-image',
  mode: 'direct',
  apiPath: 'generateImage',
  capability: {
    textToImage: true,
    imageEdit: false,
    multiReference: false,
    transparentBackground: false,
    maxN: 1,
    supportsSeed: false,
    supportsNegativePrompt: false,
    apiPath: 'generateImage',
  },
  prompt: 'a cat',
  n: 1,
};

beforeEach(() => {
  imageFactory.mockClear();
  createOAICompat.mockClear();
});

describe('OpenAI-compatible adapter', () => {
  test('factory dynamic-imports @ai-sdk/openai-compatible with full config', async () => {
    const adapter = await createOpenAICompatibleAdapter({
      baseURL: 'http://localhost:20128/v1',
      apiKey: 'unused',
      name: 'cx',
      modelName: 'gpt-5.4-image',
    });
    expect(createOAICompat).toHaveBeenCalledWith({
      baseURL: 'http://localhost:20128/v1',
      apiKey: 'unused',
      name: 'cx',
    });
    expect(imageFactory).toHaveBeenCalledWith('gpt-5.4-image');
    expect(adapter.buildCall).toBeTypeOf('function');
  });

  test('buildCall returns generateImage with handle and prompt', async () => {
    const adapter = await createOpenAICompatibleAdapter({
      baseURL: 'http://x/v1',
      apiKey: '',
      name: 'cx',
      modelName: 'gpt-5.4-image',
    });
    const call = adapter.buildCall(baseReq);
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.model).toBe(imageHandle);
    expect(call.args.prompt).toBe('a cat');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test src/providers/openai-compatible.test.ts`

Expected: failures.

- [ ] **Step 4: Implement**

Path: `src/providers/openai-compatible.ts`:

```typescript
import type { AdapterCall, ProviderAdapter, ResolvedRequest } from './adapter.js';

export interface OpenAICompatibleAdapterOptions {
  readonly baseURL: string;
  readonly apiKey: string;
  readonly name: string;
  readonly modelName: string;
}

export async function createOpenAICompatibleAdapter(
  opts: OpenAICompatibleAdapterOptions,
): Promise<ProviderAdapter> {
  const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
  const provider = createOpenAICompatible({
    baseURL: opts.baseURL,
    apiKey: opts.apiKey,
    name: opts.name,
  });
  const imageModel = provider.image(opts.modelName);

  return {
    buildCall(req: ResolvedRequest): AdapterCall {
      return {
        fn: 'generateImage',
        args: {
          model: imageModel as unknown as string,
          prompt: req.prompt ?? '',
          n: req.n,
          ...(req.size !== undefined && { size: req.size }),
          ...(req.seed !== undefined && { seed: req.seed }),
          ...(req.providerOptions !== undefined && { providerOptions: req.providerOptions }),
          ...(req.signal !== undefined && { abortSignal: req.signal }),
        },
      };
    },
  };
}
```

- [ ] **Step 5: Run tests + full suite**

Run: `pnpm test src/providers/openai-compatible.test.ts && pnpm test && pnpm typecheck && pnpm lint`

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/providers/openai-compatible.ts src/providers/openai-compatible.test.ts
git commit -m "feat(providers): OpenAI-compatible direct adapter"
```

---

## Task 10: selectAdapter dispatcher

**Files:**
- Create: `src/providers/select.ts`
- Create: `src/providers/select.test.ts`

- [ ] **Step 1: Write the failing tests**

Path: `src/providers/select.test.ts`:

```typescript
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { selectAdapter } from './select.js';
import { ImageGenConfigError } from '../errors.js';

const openaiHandle = { __h: 'openai' };
const googleHandle = { __h: 'google' };
const oaiCompatHandle = { __h: 'oaicompat' };

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({ image: vi.fn(() => openaiHandle) })),
}));
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => ({ image: vi.fn(() => googleHandle) })),
}));
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => ({ image: vi.fn(() => oaiCompatHandle) })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('selectAdapter', () => {
  test('gateway returns the default adapter (sync-resolved)', async () => {
    const adapter = await selectAdapter(
      { providerKey: 'openai', mode: 'gateway' },
      { modelId: 'openai/gpt-image-2', modelName: 'gpt-image-2' },
    );
    const call = adapter.buildCall({
      operation: 'generate',
      modelId: 'openai/gpt-image-2',
      mode: 'gateway',
      apiPath: 'generateImage',
      capability: {
        textToImage: true,
        imageEdit: true,
        multiReference: true,
        transparentBackground: true,
        maxN: 4,
        supportsSeed: true,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      },
      prompt: 'a cat',
      n: 1,
    });
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.model).toBe('openai/gpt-image-2');
  });

  test('direct + native + openai uses the OpenAI adapter', async () => {
    const adapter = await selectAdapter(
      { providerKey: 'openai', mode: 'direct', kind: 'native', apiKey: 'k' },
      { modelId: 'openai/gpt-image-2', modelName: 'gpt-image-2' },
    );
    const call = adapter.buildCall({
      operation: 'generate',
      modelId: 'openai/gpt-image-2',
      mode: 'direct',
      apiPath: 'generateImage',
      capability: {
        textToImage: true,
        imageEdit: true,
        multiReference: true,
        transparentBackground: true,
        maxN: 4,
        supportsSeed: true,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      },
      prompt: 'a cat',
      n: 1,
    });
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.model).toBe(openaiHandle);
  });

  test('direct + native + google uses the Google adapter', async () => {
    const adapter = await selectAdapter(
      { providerKey: 'google', mode: 'direct', kind: 'native', apiKey: 'k' },
      { modelId: 'google/imagen-4', modelName: 'imagen-4' },
    );
    const call = adapter.buildCall({
      operation: 'generate',
      modelId: 'google/imagen-4',
      mode: 'direct',
      apiPath: 'generateImage',
      capability: {
        textToImage: true,
        imageEdit: false,
        multiReference: false,
        transparentBackground: false,
        maxN: 4,
        supportsSeed: true,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      },
      prompt: 'a cat',
      n: 1,
    });
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.model).toBe(googleHandle);
  });

  test('direct + openai-compatible uses the openai-compatible adapter', async () => {
    const adapter = await selectAdapter(
      {
        providerKey: 'cx',
        mode: 'direct',
        kind: 'openai-compatible',
        apiKey: 'k',
        baseURL: 'http://localhost/v1',
        name: 'cx',
      },
      { modelId: 'cx/gpt-5.4-image', modelName: 'gpt-5.4-image' },
    );
    const call = adapter.buildCall({
      operation: 'generate',
      modelId: 'cx/gpt-5.4-image',
      mode: 'direct',
      apiPath: 'generateImage',
      capability: {
        textToImage: true,
        imageEdit: false,
        multiReference: false,
        transparentBackground: false,
        maxN: 1,
        supportsSeed: false,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      },
      prompt: 'a cat',
      n: 1,
    });
    if (call.fn !== 'generateImage') throw new Error('unexpected');
    expect(call.args.model).toBe(oaiCompatHandle);
  });

  test('direct + native + unknown provider key throws CONFIG_UNSUPPORTED_PROVIDER', async () => {
    await expect(
      selectAdapter(
        { providerKey: 'unknown', mode: 'direct', kind: 'native', apiKey: 'k' },
        { modelId: 'unknown/foo', modelName: 'foo' },
      ),
    ).rejects.toBeInstanceOf(ImageGenConfigError);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/providers/select.test.ts`

Expected: failures.

- [ ] **Step 3: Implement**

Path: `src/providers/select.ts`:

```typescript
import { ImageGenConfigError } from '../errors.js';
import type { ModelId } from '../types.js';
import type { ResolvedProvider } from '../resolver.js';
import { createDefaultAdapter } from './default.js';
import { createOpenAIDirectAdapter } from './openai.js';
import { createGoogleDirectAdapter } from './google.js';
import { createOpenAICompatibleAdapter } from './openai-compatible.js';
import type { ProviderAdapter } from './adapter.js';

export interface SelectAdapterContext {
  readonly modelId: ModelId;
  readonly modelName: string;
}

export async function selectAdapter(
  resolved: ResolvedProvider,
  ctx: SelectAdapterContext,
): Promise<ProviderAdapter> {
  if (resolved.mode === 'gateway') {
    return createDefaultAdapter();
  }
  if (resolved.kind === 'openai-compatible') {
    return createOpenAICompatibleAdapter({
      baseURL: resolved.baseURL,
      apiKey: resolved.apiKey,
      name: resolved.name,
      modelName: ctx.modelName,
    });
  }
  if (resolved.providerKey === 'openai') {
    return createOpenAIDirectAdapter({ apiKey: resolved.apiKey, modelName: ctx.modelName });
  }
  if (resolved.providerKey === 'google') {
    return createGoogleDirectAdapter({ apiKey: resolved.apiKey, modelName: ctx.modelName });
  }
  throw new ImageGenConfigError(
    `provider '${resolved.providerKey}' is not supported in slice 2 native mode`,
    'CONFIG_UNSUPPORTED_PROVIDER',
    {
      modelId: ctx.modelId,
      mode: 'direct',
      hint: `use kind: 'openai-compatible' with a baseURL, or wait for slice 3`,
    },
  );
}
```

- [ ] **Step 4: Run tests + full suite**

Run: `pnpm test src/providers/select.test.ts && pnpm test && pnpm typecheck && pnpm lint`

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/providers/select.ts src/providers/select.test.ts
git commit -m "feat(providers): selectAdapter dispatcher for gateway/native/oai-compatible"
```

---

## Task 11: Timeout middleware

**Files:**
- Create: `src/middleware/timeout.ts`
- Create: `src/middleware/timeout.test.ts`

- [ ] **Step 1: Write the failing tests**

Path: `src/middleware/timeout.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createTimeoutMiddleware } from './timeout.js';
import { composeChain } from './chain.js';
import type { Context, Handler } from './chain.js';
import type { ResolvedRequest } from '../providers/adapter.js';
import { ImageGenNetworkError } from '../errors.js';

const baseReq: ResolvedRequest = {
  operation: 'generate',
  modelId: 'openai/gpt-image-2',
  mode: 'gateway',
  apiPath: 'generateImage',
  capability: {
    textToImage: true,
    imageEdit: true,
    multiReference: true,
    transparentBackground: true,
    maxN: 4,
    supportsSeed: true,
    supportsNegativePrompt: false,
    apiPath: 'generateImage',
  },
  prompt: 'p',
  n: 1,
};

const baseCtx: Context = {
  startedAt: 0,
  modelId: 'openai/gpt-image-2',
  mode: 'gateway',
  attempt: 1,
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('timeout middleware', () => {
  test('passes through when handler resolves before timeout', async () => {
    const fastHandler: Handler = async () => ({
      images: [],
      model: 'openai/gpt-image-2',
      mode: 'gateway',
      request: { operation: 'generate', n: 1, referenceCount: 0 },
      timings: { start: 0, finish: 0, durationMs: 0 },
    });
    const wrapped = composeChain([createTimeoutMiddleware(50)], fastHandler);
    const result = await wrapped(baseReq, baseCtx);
    expect(result.model).toBe('openai/gpt-image-2');
  });

  test('rejects with ImageGenNetworkError code=TIMEOUT when handler exceeds timeoutMs', async () => {
    const slow: Handler = () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({} as never), 1000);
      });
    const wrapped = composeChain([createTimeoutMiddleware(50)], slow);
    const promise = wrapped(baseReq, baseCtx);
    const expectation = expect(promise).rejects.toMatchObject({
      name: 'ImageGenNetworkError',
      code: 'TIMEOUT',
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(50);
    await expectation;
  });

  test('uses ctx.signal as parent abort: handler receives abort when ctx aborts before timeout', async () => {
    let observedAbort: AbortSignal | undefined;
    const handler: Handler = async (_req, ctx) => {
      observedAbort = ctx.signal;
      return {
        images: [],
        model: 'openai/gpt-image-2',
        mode: 'gateway',
        request: { operation: 'generate', n: 1, referenceCount: 0 },
        timings: { start: 0, finish: 0, durationMs: 0 },
      };
    };
    const wrapped = composeChain([createTimeoutMiddleware(50)], handler);
    await wrapped(baseReq, baseCtx);
    expect(observedAbort).toBeInstanceOf(AbortSignal);
  });

  test('thrown error is an instance of ImageGenNetworkError', async () => {
    const slow: Handler = () => new Promise(() => {});
    const wrapped = composeChain([createTimeoutMiddleware(10)], slow);
    const p = wrapped(baseReq, baseCtx);
    const expectation = expect(p).rejects.toBeInstanceOf(ImageGenNetworkError);
    await vi.advanceTimersByTimeAsync(10);
    await expectation;
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/middleware/timeout.test.ts`

Expected: import for `createTimeoutMiddleware` undefined → tests fail.

- [ ] **Step 3: Implement**

Path: `src/middleware/timeout.ts`:

```typescript
import { ImageGenNetworkError } from '../errors.js';
import type { Middleware } from './chain.js';

export function createTimeoutMiddleware(timeoutMs: number): Middleware {
  return (next) => async (req, ctx) => {
    const controller = new AbortController();
    if (ctx.signal !== undefined) {
      if (ctx.signal.aborted) controller.abort();
      else ctx.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const handle = setTimeout(() => controller.abort(), timeoutMs);
    const childCtx = { ...ctx, signal: controller.signal };
    try {
      return await Promise.race([
        next(req, childCtx),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => {
              if (ctx.signal?.aborted) {
                reject(ctx.signal.reason ?? new Error('aborted'));
              } else {
                reject(
                  new ImageGenNetworkError(
                    `request exceeded timeoutMs=${timeoutMs}`,
                    'TIMEOUT',
                    {
                      modelId: ctx.modelId,
                      mode: ctx.mode,
                      retryable: true,
                      hint: 'increase timeoutMs at createClient or per-call',
                    },
                  ),
                );
              }
            },
            { once: true },
          );
        }),
      ]);
    } finally {
      clearTimeout(handle);
    }
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/middleware/timeout.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full suite + typecheck + lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/middleware/timeout.ts src/middleware/timeout.test.ts
git commit -m "feat(middleware): timeout middleware throwing ImageGenNetworkError TIMEOUT"
```

---

## Task 12: mapAiSdkError — HTTP status → subtype

**Files:**
- Modify: `src/operations/generate.ts`
- Modify: `src/operations/generate.test.ts`

- [ ] **Step 1: Write the failing tests**

Path: `src/operations/generate.test.ts` — append at end of file:

```typescript
import { mapAiSdkError } from './generate.js';
import {
  RateLimitError,
  AuthError,
  ContentPolicyError,
  ModelUnavailableError,
} from '../errors.js';

const ctx = { modelId: 'openai/gpt-image-2' as const, mode: 'direct' as const };

interface FakeApiError extends Error {
  statusCode?: number;
  data?: { error?: { code?: string } };
}

function makeApiError(status: number, code = 'PROVIDER'): FakeApiError {
  const e = new Error(`API ${status}`) as FakeApiError;
  e.name = 'AI_APICallError';
  e.statusCode = status;
  e.data = { error: { code } };
  return e;
}

describe('mapAiSdkError — HTTP status → subtype (slice 2)', () => {
  test('429 → RateLimitError', () => {
    const out = mapAiSdkError(makeApiError(429), {
      ...ctx,
      operation: 'generate',
      apiPath: 'generateImage',
      capability: {
        textToImage: true,
        imageEdit: true,
        multiReference: true,
        transparentBackground: true,
        maxN: 4,
        supportsSeed: true,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      },
      n: 1,
    });
    expect(out).toBeInstanceOf(RateLimitError);
    expect((out as RateLimitError).code).toBe('RATE_LIMIT');
  });

  test('401 → AuthError', () => {
    const out = mapAiSdkError(makeApiError(401), {
      ...ctx,
      operation: 'generate',
      apiPath: 'generateImage',
      capability: {
        textToImage: true,
        imageEdit: true,
        multiReference: true,
        transparentBackground: true,
        maxN: 4,
        supportsSeed: true,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      },
      n: 1,
    });
    expect(out).toBeInstanceOf(AuthError);
  });

  test('403 → AuthError', () => {
    const out = mapAiSdkError(makeApiError(403), {
      ...ctx,
      operation: 'generate',
      apiPath: 'generateImage',
      capability: {
        textToImage: true,
        imageEdit: true,
        multiReference: true,
        transparentBackground: true,
        maxN: 4,
        supportsSeed: true,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      },
      n: 1,
    });
    expect(out).toBeInstanceOf(AuthError);
  });

  test('404 → ModelUnavailableError MODEL_NOT_FOUND retryable=false', () => {
    const out = mapAiSdkError(makeApiError(404), {
      ...ctx,
      operation: 'generate',
      apiPath: 'generateImage',
      capability: {
        textToImage: true,
        imageEdit: true,
        multiReference: true,
        transparentBackground: true,
        maxN: 4,
        supportsSeed: true,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      },
      n: 1,
    });
    expect(out).toBeInstanceOf(ModelUnavailableError);
    expect((out as ModelUnavailableError).code).toBe('MODEL_NOT_FOUND');
    expect((out as ModelUnavailableError).retryable).toBe(false);
  });

  test('503 → ModelUnavailableError MODEL_UNAVAILABLE retryable=true', () => {
    const out = mapAiSdkError(makeApiError(503), {
      ...ctx,
      operation: 'generate',
      apiPath: 'generateImage',
      capability: {
        textToImage: true,
        imageEdit: true,
        multiReference: true,
        transparentBackground: true,
        maxN: 4,
        supportsSeed: true,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      },
      n: 1,
    });
    expect(out).toBeInstanceOf(ModelUnavailableError);
    expect((out as ModelUnavailableError).code).toBe('MODEL_UNAVAILABLE');
    expect((out as ModelUnavailableError).retryable).toBe(true);
  });

  test('400 + content_policy_violation code → ContentPolicyError', () => {
    const out = mapAiSdkError(makeApiError(400, 'content_policy_violation'), {
      ...ctx,
      operation: 'generate',
      apiPath: 'generateImage',
      capability: {
        textToImage: true,
        imageEdit: true,
        multiReference: true,
        transparentBackground: true,
        maxN: 4,
        supportsSeed: true,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      },
      n: 1,
    });
    expect(out).toBeInstanceOf(ContentPolicyError);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/operations/generate.test.ts`

Expected: most tests pass (slice-1 fall-through still in place); the new ones fail because `mapAiSdkError` does not yet classify by status.

- [ ] **Step 3: Extend `mapAiSdkError`**

Path: `src/operations/generate.ts` — replace the existing `mapAiSdkError` function with the version below. Also export it so the test file can import it (slice-1 had it as a private helper):

```typescript
export function mapAiSdkError(err: unknown, req: ResolvedRequest): Error {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return err;

    const status = readStatus(err);
    const code = readErrorCode(err);

    if (status === 429) {
      return new RateLimitError(err.message, {
        modelId: req.modelId,
        mode: req.mode,
        cause: err,
        ...(status !== undefined && { providerError: { status } }),
      });
    }
    if (status === 401 || status === 403) {
      return new AuthError(err.message, {
        modelId: req.modelId,
        mode: req.mode,
        cause: err,
        providerError: { status },
      });
    }
    if (status === 404) {
      return new ModelUnavailableError(err.message, {
        code: 'MODEL_NOT_FOUND',
        modelId: req.modelId,
        mode: req.mode,
        cause: err,
        providerError: { status },
      });
    }
    if (status !== undefined && status >= 500 && status < 600) {
      return new ModelUnavailableError(err.message, {
        code: 'MODEL_UNAVAILABLE',
        modelId: req.modelId,
        mode: req.mode,
        cause: err,
        providerError: { status },
      });
    }
    if (status === 400 && code === 'content_policy_violation') {
      return new ContentPolicyError(err.message, {
        modelId: req.modelId,
        mode: req.mode,
        cause: err,
        providerError: { status, type: code },
      });
    }

    const looksLikeNetwork =
      /(fetch|network|ECONN|ETIMEDOUT|ENOTFOUND)/i.test(err.message) ||
      err.cause !== undefined;
    if (looksLikeNetwork) {
      return new ImageGenNetworkError(err.message, 'NETWORK_ERROR', {
        modelId: req.modelId,
        mode: req.mode,
        cause: err,
      });
    }
    return new ImageGenProviderError(err.message, 'PROVIDER_ERROR', {
      modelId: req.modelId,
      mode: req.mode,
      cause: err,
    });
  }
  return new ImageGenProviderError(String(err), 'PROVIDER_ERROR', {
    modelId: req.modelId,
    mode: req.mode,
  });
}

function readStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const e = err as { statusCode?: unknown; status?: unknown };
  if (typeof e.statusCode === 'number') return e.statusCode;
  if (typeof e.status === 'number') return e.status;
  return undefined;
}

function readErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const e = err as { data?: { error?: { code?: unknown } }; code?: unknown };
  const fromData = e.data?.error?.code;
  if (typeof fromData === 'string') return fromData;
  if (typeof e.code === 'string') return e.code;
  return undefined;
}
```

Also update the imports at the top of `src/operations/generate.ts` to include the four subtypes:

```typescript
import {
  ImageGenConfigError,
  ImageGenNetworkError,
  ImageGenProviderError,
  RateLimitError,
  AuthError,
  ContentPolicyError,
  ModelUnavailableError,
} from '../errors.js';
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/operations/generate.test.ts`

Expected: all PASS — old tests (network/provider/AbortError fall-through) plus the six new status-based cases.

- [ ] **Step 5: Run full suite + typecheck + lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/operations/generate.ts src/operations/generate.test.ts
git commit -m "feat(errors): map AI SDK HTTP status to typed subtypes"
```

---

## Task 13: Config — providers, models, merged registry

**Files:**
- Modify: `src/config.ts`
- Modify: `src/config.test.ts`

- [ ] **Step 1: Write the failing tests**

Path: `src/config.test.ts` — append:

```typescript
import { defineModel } from './define-model.js';

describe('resolveConfig — providers + models (slice 2)', () => {
  test('providers default to empty record when not set', () => {
    const cfg = resolveConfig({}, {});
    expect(cfg.providers).toEqual({});
  });

  test('providers passed through verbatim', () => {
    const cfg = resolveConfig(
      {
        providers: {
          openai: { apiKey: 'sk-x' },
          cx: { kind: 'openai-compatible', baseURL: 'http://localhost:20128/v1' },
        },
      },
      {},
    );
    expect(cfg.providers.openai).toEqual({ apiKey: 'sk-x' });
    expect(cfg.providers.cx).toEqual({
      kind: 'openai-compatible',
      baseURL: 'http://localhost:20128/v1',
    });
  });

  test('registry merges built-ins with user models', () => {
    const cx = defineModel('cx/test-image', 'cx', {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      transparentBackground: false,
      maxN: 1,
      supportsSeed: false,
      supportsNegativePrompt: false,
      apiPath: 'generateImage',
    });
    const cfg = resolveConfig({ models: { 'cx/test-image': cx } }, {});
    expect(cfg.registry['openai/gpt-image-2']).toBeDefined();
    expect(cfg.registry['google/imagen-4']).toBeDefined();
    expect(cfg.registry['cx/test-image']).toBe(cx);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/config.test.ts`

Expected: failures — `cfg.providers`, `cfg.registry` undefined.

- [ ] **Step 3: Implement**

Path: `src/config.ts` — replace the file with:

```typescript
import { BUILT_IN_MODELS, mergeModels } from './registry.js';
import type {
  ClientOptions,
  Logger,
  Mode,
  ModelId,
  ProviderConfig,
  RegisteredModel,
} from './types.js';

export interface ResolvedConfig {
  readonly mode: Mode | 'auto';
  readonly defaultModel?: ModelId;
  readonly logger?: Logger;
  readonly timeoutMs: number;
  readonly gatewayApiKey?: string;
  readonly gatewayBaseURL?: string;
  readonly providers: Readonly<Record<string, ProviderConfig>>;
  readonly registry: Readonly<Record<ModelId, RegisteredModel>>;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export function resolveConfig(
  options: ClientOptions,
  env: Readonly<Record<string, string | undefined>>,
): ResolvedConfig {
  const gatewayApiKey = options.gateway?.apiKey ?? env.AI_GATEWAY_API_KEY;
  const gatewayBaseURL = options.gateway?.baseURL ?? env.AI_GATEWAY_BASE_URL;

  return {
    mode: options.mode ?? 'auto',
    ...(options.defaultModel !== undefined && { defaultModel: options.defaultModel }),
    ...(options.logger !== undefined && { logger: options.logger }),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ...(gatewayApiKey !== undefined && { gatewayApiKey }),
    ...(gatewayBaseURL !== undefined && { gatewayBaseURL }),
    providers: options.providers ?? {},
    registry: mergeModels(BUILT_IN_MODELS, options.models ?? {}),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/config.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full suite + typecheck + lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat(config): expose providers + merged registry on ResolvedConfig"
```

---

## Task 14: Operations — wire resolveProvider + selectAdapter + timeout

**Files:**
- Modify: `src/operations/generate.ts`
- Modify: `src/operations/generate.test.ts`

- [ ] **Step 1: Write the failing test**

Path: `src/operations/generate.test.ts` — append:

```typescript
import { runGenerate } from './generate.js';
import { defineModel } from '../define-model.js';
import { mergeModels, BUILT_IN_MODELS } from '../registry.js';

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    image: vi.fn(() => ({ __direct: 'openai-handle' })),
  })),
}));

vi.mock('ai', () => ({
  generateImage: vi.fn(),
}));

describe('runGenerate — direct mode wiring (slice 2)', () => {
  test('direct mode + native openai resolves provider, builds adapter, returns normalized result', async () => {
    const { generateImage } = await import('ai');
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        { base64: 'iVBORw0KGgo=', uint8Array: new Uint8Array([1, 2, 3]), mediaType: 'image/png' },
      ],
    } as never);

    const result = await runGenerate({
      input: { prompt: 'a cat' },
      config: {
        mode: 'direct',
        defaultModel: 'openai/gpt-image-2',
        timeoutMs: 120_000,
        providers: { openai: { apiKey: 'sk-x' } },
        registry: mergeModels(BUILT_IN_MODELS, {}),
      },
      env: {},
    });

    expect(result.mode).toBe('direct');
    expect(result.model).toBe('openai/gpt-image-2');
  });

  test('uses merged registry — user model resolves correctly', async () => {
    const { generateImage } = await import('ai');
    vi.mocked(generateImage).mockResolvedValue({
      images: [{ uint8Array: new Uint8Array([0]), base64: 'AA==', mediaType: 'image/png' }],
    } as never);

    const cx = defineModel('cx/gpt-5.4-image', 'cx', {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      transparentBackground: false,
      maxN: 1,
      supportsSeed: false,
      supportsNegativePrompt: false,
      apiPath: 'generateImage',
    });

    // openai-compatible adapter is invoked — mock it via @ai-sdk/openai-compatible
    vi.doMock('@ai-sdk/openai-compatible', () => ({
      createOpenAICompatible: vi.fn(() => ({ image: vi.fn(() => ({ __cx: true })) })),
    }));

    const result = await runGenerate({
      input: { prompt: 'a cat' },
      config: {
        mode: 'direct',
        defaultModel: 'cx/gpt-5.4-image',
        timeoutMs: 120_000,
        providers: {
          cx: { kind: 'openai-compatible', baseURL: 'http://localhost:20128/v1', apiKey: 'k' },
        },
        registry: mergeModels(BUILT_IN_MODELS, { 'cx/gpt-5.4-image': cx }),
      },
      env: {},
    });

    expect(result.model).toBe('cx/gpt-5.4-image');
    expect(result.mode).toBe('direct');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/operations/generate.test.ts`

Expected: failures — runGenerate doesn't yet take `providers`/`registry`, doesn't invoke `selectAdapter`.

- [ ] **Step 3: Replace `runGenerate`**

Path: `src/operations/generate.ts` — replace the `runGenerate` function (and its `RunGenerateArgs` type if needed). Keep `mapAiSdkError` and its helpers untouched. Add new imports.

```typescript
import { generateImage } from 'ai';
import {
  ImageGenConfigError,
  ImageGenNetworkError,
  ImageGenProviderError,
  RateLimitError,
  AuthError,
  ContentPolicyError,
  ModelUnavailableError,
} from '../errors.js';
import { composeChain } from '../middleware/chain.js';
import type { Context, Handler } from '../middleware/chain.js';
import { createLoggingMiddleware } from '../middleware/logging.js';
import { createTimeoutMiddleware } from '../middleware/timeout.js';
import { createValidationMiddleware } from '../middleware/validation-mw.js';
import { selectAdapter } from '../providers/select.js';
import type { ResolvedRequest } from '../providers/adapter.js';
import { resolveMode, resolveProvider } from '../resolver.js';
import { normalizeResult } from '../result.js';
import type { GenerateInput, ImageGenResult } from '../types.js';
import type { ResolvedConfig } from '../config.js';

export interface RunGenerateArgs {
  readonly input: GenerateInput;
  readonly config: ResolvedConfig;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export async function runGenerate(args: RunGenerateArgs): Promise<ImageGenResult> {
  const modelId = args.input.model ?? args.config.defaultModel;
  if (modelId === undefined) {
    throw new ImageGenConfigError(
      "no model specified — pass 'model' in the call or set 'defaultModel' on the client",
      'CONFIG_NO_MODEL',
      { hint: "createClient({ defaultModel: 'openai/gpt-image-2' }) or generate({ model: ... })" },
    );
  }

  const entry = args.config.registry[modelId];
  if (entry === undefined) {
    throw new ImageGenConfigError(
      `model '${modelId}' is not in the registry`,
      'CONFIG_UNKNOWN_MODEL',
      { modelId, hint: 'register it via createClient({ models: { ... } }) or use a built-in id' },
    );
  }

  const mode = resolveMode({
    modelId,
    ...(args.input.mode !== undefined && { callOverride: args.input.mode }),
    clientMode: args.config.mode,
    env: args.env,
    ...(args.config.gatewayApiKey !== undefined && { gatewayApiKey: args.config.gatewayApiKey }),
  });

  const resolvedProvider = resolveProvider({
    modelId,
    mode,
    providers: args.config.providers,
    env: args.env,
  });

  const slash = modelId.indexOf('/');
  const modelName = slash > 0 ? modelId.slice(slash + 1) : modelId;
  const adapter = await selectAdapter(resolvedProvider, { modelId, modelName });

  const req: ResolvedRequest = {
    operation: 'generate',
    modelId,
    mode,
    apiPath: entry.capability.apiPath,
    capability: entry.capability,
    prompt: args.input.prompt,
    ...(args.input.negativePrompt !== undefined && { negativePrompt: args.input.negativePrompt }),
    ...(args.input.size !== undefined && { size: args.input.size }),
    ...(args.input.aspectRatio !== undefined && { aspectRatio: args.input.aspectRatio }),
    n: args.input.n ?? 1,
    ...(args.input.seed !== undefined && { seed: args.input.seed }),
    ...(args.input.background !== undefined && { background: args.input.background }),
    ...(args.input.format !== undefined && { format: args.input.format }),
    ...(args.input.providerOptions !== undefined && { providerOptions: args.input.providerOptions }),
    ...(args.input.signal !== undefined && { signal: args.input.signal }),
  };

  const terminal: Handler = async (resolvedReq) => {
    const start = Date.now();
    const call = adapter.buildCall(resolvedReq);
    if (call.fn !== 'generateImage') {
      throw new ImageGenProviderError(
        'generateText path lands in slice 4',
        'PROVIDER_UNSUPPORTED_PATH',
      );
    }
    let raw: unknown;
    try {
      raw = await generateImage(call.args as Parameters<typeof generateImage>[0]);
    } catch (err) {
      throw mapAiSdkError(err, resolvedReq);
    }
    const finish = Date.now();
    return normalizeResult({ fn: 'generateImage', output: raw }, resolvedReq, { start, finish });
  };

  const chain = composeChain(
    [
      createLoggingMiddleware(),
      createValidationMiddleware(),
      createTimeoutMiddleware(args.config.timeoutMs),
    ],
    terminal,
  );

  const ctx: Context = {
    startedAt: Date.now(),
    modelId,
    mode,
    attempt: 1,
    ...(args.input.signal !== undefined && { signal: args.input.signal }),
    ...(args.config.logger !== undefined && { logger: args.config.logger }),
  };

  return chain(req, ctx);
}

// `mapAiSdkError` and its `readStatus`/`readErrorCode` helpers continue here —
// they were exported in Task 12 and are unchanged in this task.
```

Below this function, **leave the existing exported `mapAiSdkError` and its helpers (Task 12) intact** — only the `runGenerate` implementation changes here.

- [ ] **Step 4: Run tests**

Run: `pnpm test src/operations/generate.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full suite + typecheck + lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`

Expected: green. Slice-1 integration test (`src/integration/generate.integration.test.ts`) must still pass — it uses gateway mode which goes through `selectAdapter` → `createDefaultAdapter`.

- [ ] **Step 6: Commit**

```bash
git add src/operations/generate.ts src/operations/generate.test.ts
git commit -m "feat(operations): wire resolveProvider, selectAdapter, and timeout middleware"
```

---

## Task 15: Client wiring + public exports

**Files:**
- Modify: `src/client.ts`
- Modify: `src/client.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing tests**

Path: `src/client.test.ts` — append:

```typescript
import { defineModel as defineModelExport, ProviderConfig as PCType } from './index.js';

describe('public exports (slice 2)', () => {
  test('defineModel is exported from package root', () => {
    expect(typeof defineModelExport).toBe('function');
  });

  test('ProviderConfig type is exported', () => {
    const pc: PCType = { apiKey: 'k' };
    expect(pc).toBeDefined();
  });
});

describe('createClient — slice 2 options', () => {
  test('accepts providers option without throwing', () => {
    const { createClient } = require('./client.js') as typeof import('./client.js');
    const client = createClient(
      {
        mode: 'direct',
        providers: { openai: { apiKey: 'sk-x' } },
        defaultModel: 'openai/gpt-image-2',
      },
      {},
    );
    expect(client).toBeDefined();
  });

  test('accepts user models option without throwing', () => {
    const { createClient } = require('./client.js') as typeof import('./client.js');
    const { defineModel } = require('./define-model.js') as typeof import('./define-model.js');
    const cx = defineModel('cx/test-image', 'cx', {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      transparentBackground: false,
      maxN: 1,
      supportsSeed: false,
      supportsNegativePrompt: false,
      apiPath: 'generateImage',
    });
    const client = createClient(
      {
        mode: 'direct',
        providers: { cx: { kind: 'openai-compatible', baseURL: 'http://x/v1' } },
        models: { 'cx/test-image': cx },
        defaultModel: 'cx/test-image',
      },
      {},
    );
    expect(client).toBeDefined();
  });
});
```

> The `require(...)` calls work because vitest runs in Node and the package is ESM-imported by other tests. If the test runner complains, swap to top-level `await import()` instead.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/client.test.ts`

Expected: failures — `defineModel` and `ProviderConfig` not yet exported from `./index.js`.

- [ ] **Step 3: Update `src/index.ts`**

Path: `src/index.ts` — replace contents with:

```typescript
export type {
  ApiPath,
  Capability,
  ClientOptions,
  GenerateInput,
  GeneratedImage,
  ImageGenResult,
  LogLevel,
  Logger,
  Mode,
  ModelId,
  ProviderConfig,
  ProviderConfigNative,
  ProviderConfigOpenAICompatible,
  RegisteredModel,
  RequestOperation,
  ResultRequest,
  TransformKind,
} from './types.js';

export {
  ImageGenError,
  ImageGenConfigError,
  ImageGenValidationError,
  ImageGenProviderError,
  ImageGenNetworkError,
  RateLimitError,
  AuthError,
  ContentPolicyError,
  ModelUnavailableError,
} from './errors.js';
export type { ErrorCategory, ImageGenErrorInit } from './errors.js';

export { getModel, listRegisteredModelIds, mergeModels, BUILT_IN_MODELS } from './registry.js';

export { defineModel } from './define-model.js';

export { Client, createClient } from './client.js';
```

- [ ] **Step 4: `src/client.ts` already passes its options through `resolveConfig`**

Verify: open `src/client.ts` — the constructor passes `options` to `resolveConfig`, which now reads `providers` and `models`. No code change needed here.

- [ ] **Step 5: Run tests + full suite + typecheck + lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/client.test.ts src/index.ts
git commit -m "feat: export defineModel + ProviderConfig + error subtypes from package root"
```

---

## Task 16: Direct-mode integration test (OpenAI + Google mocked)

**Files:**
- Create: `src/integration/generate-direct.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Path: `src/integration/generate-direct.integration.test.ts`:

```typescript
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createClient } from '../index.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../../tests/fixtures/pixel-1x1.png.base64.js';

const openaiImage = vi.fn(() => ({ __h: 'openai-handle' }));
const googleImage = vi.fn(() => ({ __h: 'google-handle' }));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({ image: openaiImage })),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => ({ image: googleImage })),
}));

vi.mock('ai', () => ({
  generateImage: vi.fn(),
}));

import { generateImage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

beforeEach(() => {
  vi.mocked(generateImage).mockReset();
  vi.mocked(createOpenAI).mockClear();
  vi.mocked(createGoogleGenerativeAI).mockClear();
  openaiImage.mockClear();
  googleImage.mockClear();
});

describe('direct-mode integration (slice 2) — OpenAI', () => {
  test('createClient direct + openai/gpt-image-2 → generate → normalized result', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        {
          base64: PIXEL_1X1_BASE64,
          uint8Array: PIXEL_1X1_BYTES,
          mediaType: 'image/png',
          width: 1,
          height: 1,
        },
      ],
    } as never);

    const client = createClient(
      {
        mode: 'direct',
        providers: { openai: { apiKey: 'sk-x' } },
        defaultModel: 'openai/gpt-image-2',
      },
      {},
    );

    const result = await client.generate({ prompt: 'a cat' });

    expect(result.model).toBe('openai/gpt-image-2');
    expect(result.mode).toBe('direct');
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.mediaType).toBe('image/png');
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: 'sk-x' });
    expect(openaiImage).toHaveBeenCalledWith('gpt-image-2');
  });

  test('OPENAI_API_KEY env fallback works when providers config is empty', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [{ base64: PIXEL_1X1_BASE64, uint8Array: PIXEL_1X1_BYTES, mediaType: 'image/png' }],
    } as never);

    const client = createClient(
      { mode: 'direct', defaultModel: 'openai/gpt-image-2' },
      { OPENAI_API_KEY: 'sk-env' },
    );

    const result = await client.generate({ prompt: 'a cat' });

    expect(result.mode).toBe('direct');
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: 'sk-env' });
  });
});

describe('direct-mode integration (slice 2) — Google', () => {
  test('createClient direct + google/imagen-4 → generate → normalized result', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        { base64: PIXEL_1X1_BASE64, uint8Array: PIXEL_1X1_BYTES, mediaType: 'image/png' },
      ],
    } as never);

    const client = createClient(
      {
        mode: 'direct',
        providers: { google: { apiKey: 'g-key' } },
        defaultModel: 'google/imagen-4',
      },
      {},
    );

    const result = await client.generate({ prompt: 'a cat' });

    expect(result.model).toBe('google/imagen-4');
    expect(result.mode).toBe('direct');
    expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: 'g-key' });
    expect(googleImage).toHaveBeenCalledWith('imagen-4');
  });
});
```

> If Task 5 chose a different canonical id for Google Imagen 4 (e.g. `google/imagen-4.0-generate-001`), update the `defaultModel` and the asserted `modelName` here to match.

- [ ] **Step 2: Run the test (must pass — implementation already in place from Tasks 7-15)**

Run: `pnpm test src/integration/generate-direct.integration.test.ts`

Expected: PASS. If it fails because of differences in the `image()` factory name verified in Tasks 7/8, swap the call site in the production adapter (`openai.ts`/`google.ts`) — not in this test.

- [ ] **Step 3: Run full suite + typecheck**

Run: `pnpm test && pnpm typecheck`

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/integration/generate-direct.integration.test.ts
git commit -m "test(integration): direct-mode OpenAI + Google flows with mocked SDKs"
```

---

## Task 17: OpenAI-compatible integration test (cx mocked)

**Files:**
- Create: `src/integration/generate-openai-compatible.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Path: `src/integration/generate-openai-compatible.integration.test.ts`:

```typescript
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createClient, defineModel } from '../index.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../../tests/fixtures/pixel-1x1.png.base64.js';

const cxImage = vi.fn(() => ({ __h: 'cx-handle' }));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => ({ image: cxImage })),
}));

vi.mock('ai', () => ({
  generateImage: vi.fn(),
}));

import { generateImage } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

beforeEach(() => {
  vi.mocked(generateImage).mockReset();
  vi.mocked(createOpenAICompatible).mockClear();
  cxImage.mockClear();
});

describe('openai-compatible integration (slice 2) — cx local', () => {
  test('register cx/gpt-5.4-image and generate via openai-compatible adapter', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        {
          base64: PIXEL_1X1_BASE64,
          uint8Array: PIXEL_1X1_BYTES,
          mediaType: 'image/png',
        },
      ],
    } as never);

    const cx = defineModel('cx/gpt-5.4-image', 'cx', {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      transparentBackground: false,
      maxN: 1,
      supportsSeed: false,
      supportsNegativePrompt: false,
      apiPath: 'generateImage',
    });

    const client = createClient(
      {
        mode: 'direct',
        providers: {
          cx: {
            kind: 'openai-compatible',
            baseURL: 'http://localhost:20128/v1',
            apiKey: 'unused',
            name: 'cx',
          },
        },
        models: { 'cx/gpt-5.4-image': cx },
        defaultModel: 'cx/gpt-5.4-image',
      },
      {},
    );

    const result = await client.generate({ prompt: 'a red apple' });

    expect(result.model).toBe('cx/gpt-5.4-image');
    expect(result.mode).toBe('direct');
    expect(result.images[0]?.mediaType).toBe('image/png');
    expect(createOpenAICompatible).toHaveBeenCalledWith({
      baseURL: 'http://localhost:20128/v1',
      apiKey: 'unused',
      name: 'cx',
    });
    expect(cxImage).toHaveBeenCalledWith('gpt-5.4-image');
  });

  test('unknown model id throws CONFIG_UNKNOWN_MODEL before any network', async () => {
    const client = createClient(
      {
        mode: 'direct',
        providers: { cx: { kind: 'openai-compatible', baseURL: 'http://x/v1' } },
        defaultModel: 'cx/not-registered' as `${string}/${string}`,
      },
      {},
    );

    await expect(client.generate({ prompt: 'a cat' })).rejects.toMatchObject({
      code: 'CONFIG_UNKNOWN_MODEL',
    });
    expect(generateImage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm test src/integration/generate-openai-compatible.integration.test.ts`

Expected: PASS.

- [ ] **Step 3: Run full suite + typecheck**

Run: `pnpm test && pnpm typecheck`

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/integration/generate-openai-compatible.integration.test.ts
git commit -m "test(integration): openai-compatible cx flow with mocked SDK"
```

---

## Task 18: E2E config + probe helper

**Files:**
- Create: `vitest.config.e2e.ts`
- Create: `tests/e2e/_probe.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Update `vitest.config.ts` to exclude E2E**

Path: `vitest.config.ts` — modify the `exclude` array:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test-d.ts', 'src/integration/**/*.integration.test.ts'],
    exclude: ['src/integration/live/**', 'tests/e2e/**', 'node_modules', 'dist'],
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test-d.ts', 'src/integration/**', 'src/index.ts', 'src/utils/index.ts'],
      thresholds: {
        lines: 80,
        statements: 80,
        branches: 75,
        functions: 80,
      },
    },
  },
});
```

- [ ] **Step 2: Create the E2E vitest config**

Path: `vitest.config.e2e.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 3: Create the probe helper with its own test**

Path: `tests/e2e/_probe.ts`:

```typescript
export interface ProbeResult {
  readonly reachable: boolean;
  readonly reason?: string;
}

export async function probeCxLocal(timeoutMs = 1_000): Promise<ProbeResult> {
  try {
    const response = await fetch('http://localhost:20128/v1/models', {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { reachable: false, reason: `http ${response.status}` };
    }
    return { reachable: true };
  } catch (err) {
    return { reachable: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 4: Verify `pnpm test` excludes E2E**

Run: `pnpm test`

Expected: green; no E2E tests are picked up (no `cx-local.e2e.test.ts` exists yet, but the include/exclude already separates them).

- [ ] **Step 5: Verify `pnpm test:e2e` runs (and passes with no tests)**

Run: `pnpm test:e2e`

Expected: vitest reports "No test files found" or runs zero tests with exit code 0 (because `passWithNoTests: true`).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts vitest.config.e2e.ts tests/e2e/_probe.ts
git commit -m "chore(test): vitest e2e config + cx probe helper"
```

---

## Task 19: cx-local E2E test

**Files:**
- Create: `tests/e2e/cx-local.e2e.test.ts`

- [ ] **Step 1: Write the E2E test**

Path: `tests/e2e/cx-local.e2e.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClient, defineModel } from '../../src/index.js';
import { probeCxLocal } from './_probe.js';

let reachable = false;

beforeAll(async () => {
  const probe = await probeCxLocal(1_000);
  reachable = probe.reachable;
  if (!reachable) {
    // eslint-disable-next-line no-console
    console.warn(`[e2e] cx unreachable, skipping: ${probe.reason ?? 'unknown'}`);
  }
});

afterAll(() => {
  if (!reachable) {
    // eslint-disable-next-line no-console
    console.warn('[e2e] cx-local suite was skipped — start your local cx provider on http://localhost:20128 to enable');
  }
});

describe('cx-local E2E', () => {
  test('register cx/gpt-5.4-image and generate one image', async () => {
    if (!reachable) return; // soft skip
    const cx = defineModel('cx/gpt-5.4-image', 'cx', {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      transparentBackground: false,
      maxN: 1,
      supportsSeed: false,
      supportsNegativePrompt: false,
      apiPath: 'generateImage',
    });

    const client = createClient(
      {
        mode: 'direct',
        providers: {
          cx: {
            kind: 'openai-compatible',
            baseURL: 'http://localhost:20128/v1',
            apiKey: 'unused',
            name: 'cx',
          },
        },
        models: { 'cx/gpt-5.4-image': cx },
        defaultModel: 'cx/gpt-5.4-image',
      },
      {},
    );

    const result = await client.generate({ prompt: 'a red apple on a white table' });

    expect(result.model).toBe('cx/gpt-5.4-image');
    expect(result.mode).toBe('direct');
    expect(result.images.length).toBeGreaterThan(0);
    const img = result.images[0];
    expect(img).toBeDefined();
    expect(img?.uint8Array.length).toBeGreaterThan(0);
    expect(img?.mediaType).toMatch(/^image\//);
    expect(img?.base64.length).toBeGreaterThan(0);
  }, 30_000);

  test('unknown model id throws ImageGenConfigError before any network call', async () => {
    if (!reachable) return; // soft skip — local probe must be reachable so the rest of the suite is meaningful
    const client = createClient(
      {
        mode: 'direct',
        providers: { cx: { kind: 'openai-compatible', baseURL: 'http://localhost:20128/v1' } },
        defaultModel: 'cx/does-not-exist' as `${string}/${string}`,
      },
      {},
    );
    await expect(client.generate({ prompt: 'a cat' })).rejects.toMatchObject({
      code: 'CONFIG_UNKNOWN_MODEL',
    });
  });
});
```

- [ ] **Step 2: Run with cx unreachable (most likely default)**

Run: `pnpm test:e2e`

Expected: vitest runs, the suite logs `[e2e] cx unreachable, skipping: ...`, both tests pass (because the soft-skip returns early). Exit code 0.

- [ ] **Step 3: (Optional, only if cx is running) Run with cx reachable**

If you have `localhost:20128` running, run: `pnpm test:e2e`

Expected: both tests run for real, image bytes returned, all assertions pass.

- [ ] **Step 4: Run default suite to confirm E2E does not leak in**

Run: `pnpm test`

Expected: same number of files as before Task 18; the E2E file is excluded.

- [ ] **Step 5: Final acceptance — full local validation**

Run, in order:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e
```

Expected:
- `pnpm test` — green, ≥ 80% line coverage (configured threshold).
- `pnpm typecheck` — 0 errors.
- `pnpm lint` — 0 errors.
- `pnpm build` — produces `dist/index.{js,d.ts}` and `dist/utils/index.{js,d.ts}`. Confirm no provider package is statically imported in `dist/index.js` (search for `from "@ai-sdk/openai"` etc. — they should appear only inside dynamic-import strings). If a static import slipped in, find the source and convert to `await import(...)`.
- `pnpm test:e2e` — green (with soft-skip if cx is not running).

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/cx-local.e2e.test.ts
git commit -m "test(e2e): cx-local opt-in suite with auto-skip when unreachable"
```

---

## Plan Acceptance Summary

When all 19 tasks complete:

1. ✅ `createClient({ mode: 'direct', providers: { openai: { apiKey } }, defaultModel: 'openai/gpt-image-2' }).generate({ prompt })` returns normalized result via mocked OpenAI SDK in tests.
2. ✅ Same for `google/imagen-4` via mocked `@ai-sdk/google`.
3. ✅ `cx/gpt-5.4-image` registered via `models` + `providers.cx.kind: 'openai-compatible'` works against real cx in `pnpm test:e2e`.
4. ✅ `mapAiSdkError` correctly classifies five trigger conditions (429, 401/403, 404, 5xx, content-policy).
5. ✅ Timeout middleware fires `ImageGenNetworkError({ code: 'TIMEOUT' })` when handler exceeds `timeoutMs`.
6. ✅ `pnpm test` (no cx) — green, ≥ 80% line coverage.
7. ✅ `pnpm typecheck` — 0 errors.
8. ✅ `pnpm lint` — 0 errors.
9. ✅ `pnpm build` — produces dist files; no static provider-package imports.
10. ✅ Slice-1 acceptance criteria still hold (no regression).

If any of the above fails after Task 19, the slice is not done — fix the failing area in a follow-up task within the same plan rather than declaring victory.
