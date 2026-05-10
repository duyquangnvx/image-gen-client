# image-gen-client v1 — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the smallest end-to-end vertical slice of `image-gen-client` v1 — `createClient({ defaultModel: 'openai/gpt-image-2' }).generate({ prompt })` returning the normalized result shape via Vercel AI Gateway, with AI SDK mocked in tests.

**Architecture:** Layered library following `docs/superpowers/specs/2026-05-10-image-gen-client-build-design.md`. Slice 1 wires every layer (Client facade → config → registry → resolver → validation → middleware chain → default provider adapter → result normalizer) for one model and one mode. Subsequent slices expand on independent axes (more providers, more operations, retry/timeout, etc.) — they are not part of this plan.

**Tech Stack:** TypeScript 5 (strict, ESM-only), Node ≥ 20, pnpm, tsup, vitest, eslint, prettier. Runtime deps: `ai ^6`, `@ai-sdk/gateway ^1`, `zod ^3`.

---

## Source-of-Truth Documents

Open these in a side window — task code below references their numbered sections:

- `docs/image-gen-client.spec.md` — requirements (v0.1).
- `docs/superpowers/specs/2026-05-10-image-gen-client-build-design.md` — implementation decisions.

When the two disagree, the spec wins for behavior. Update the design doc if needed.

## What Slice 1 Includes (Section 2 of design doc)

- `createClient({ defaultModel: 'openai/gpt-image-2' })` works when `AI_GATEWAY_API_KEY` is set.
- `client.generate({ prompt })` returns `ImageGenResult` per spec §3.5.
- Registry seeded with **only** `openai/gpt-image-2`.
- Resolver supports gateway mode only.
- Validation: model exists, mode resolvable, prompt non-empty, `n ≤ maxN`, `size` matches `capability.sizes` when declared.
- Middleware chain: `logging → validation → terminal-handler`. Retry/timeout deferred to slice 3.
- Errors: `ImageGenError` (base), `ImageGenConfigError`, `ImageGenValidationError`, `ImageGenProviderError`, `ImageGenNetworkError`.
- Helpers: `toBuffer`, `saveToFile` exported from `image-gen-client/utils`.
- §15.6 v1 commitments shipped (`Capability.transforms`, `TransformKind` export, `operation` discriminator, `mask` field).

## What Slice 1 Does NOT Include

- Direct mode (slice 2). Auto-resolution still detects gateway only.
- Other v1 models (slice 2).
- `edit`, `variations`, `batch`, introspection (slices 4, 5, 6).
- Retry, timeout middleware (slice 3).
- `RateLimitError`, `ContentPolicyError`, `AuthError`, `ModelUnavailableError` subtypes (slice 3).
- Fallback chain (slice 6).
- Config-file loader, presets, plugins (slice 7).
- `images.ts` input coercion (slice 4).

If a task below appears to require something from a deferred slice, stop and re-read the design doc Section 3 — it's a sign the slice boundary is being violated.

## File Inventory for Slice 1

Created in this plan (paths relative to repo root):

```
package.json
tsconfig.json
tsup.config.ts
vitest.config.ts
eslint.config.js
.gitignore
.prettierrc.json
src/index.ts
src/client.ts
src/client.test.ts
src/config.ts
src/config.test.ts
src/registry.ts
src/registry.test.ts
src/capabilities.ts
src/resolver.ts
src/resolver.test.ts
src/validation.ts
src/validation.test.ts
src/result.ts
src/result.test.ts
src/errors.ts
src/errors.test.ts
src/types.ts
src/middleware/chain.ts
src/middleware/chain.test.ts
src/middleware/logging.ts
src/middleware/logging.test.ts
src/middleware/validation-mw.ts
src/middleware/validation-mw.test.ts
src/providers/adapter.ts
src/providers/default.ts
src/providers/default.test.ts
src/operations/generate.ts
src/operations/generate.test.ts
src/utils/index.ts
src/utils/to-buffer.ts
src/utils/to-buffer.test.ts
src/utils/save-to-file.ts
src/utils/save-to-file.test.ts
src/integration/generate.integration.test.ts
tests/fixtures/pixel-1x1.png.base64.ts
```

Files **not** created in slice 1 (forward-looking placements from design Section 1):

```
src/images.ts                              # slice 4
src/middleware/retry.ts                    # slice 3
src/middleware/timeout.ts                  # slice 3
src/providers/openai.ts                    # slice 2 only if a quirk forces an override
src/providers/google.ts                    # slice 2 only if a quirk forces an override
src/providers/bfl.ts                       # later
src/providers/recraft.ts                   # later
src/operations/edit.ts                     # slice 4
src/operations/variations.ts               # slice 4
src/operations/batch.ts                    # slice 5
src/utils/to-data-url.ts                   # slice 7 (or earlier if cheap)
src/utils/get-dimensions.ts                # slice 7 (or earlier if cheap)
```

---

## Working Conventions

- **TDD discipline.** Every task that produces runtime code starts with a failing test. No implementation without a red test.
- **AI SDK v6 verification.** Two tasks (default adapter, result normalizer) touch AI SDK v6 directly. Before writing those, invoke `Skill:ai-sdk` to confirm the current import paths and response shapes. Do not guess from older AI SDK versions.
- **Spec citations.** Code comments may cite spec sections as `§N` when behavior is non-obvious. Don't write comments otherwise (per `.claude/rules/coding.md`).
- **No `any`.** No `as` without runtime verification preceding it. No `!` non-null assertions. (Per `.claude/rules/typescript/types.md`.)
- **Frequent commits.** One commit per task. Conventional Commits style (`feat:`, `test:`, `chore:`).
- **Tests pass before commit.** `pnpm test` and `pnpm typecheck` are green at every commit.

---

## Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.gitignore`, `.prettierrc.json`, `src/index.ts`

This task is pre-test (no runtime code yet). The "test" is that `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm build` all run successfully on an empty surface.

- [ ] **Step 1: Create `package.json`**

Path: `package.json`

```json
{
  "name": "image-gen-client",
  "version": "0.0.0",
  "description": "Unified, DX-focused image generation client wrapping Vercel AI SDK",
  "license": "MIT",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./utils": {
      "types": "./dist/utils/index.d.ts",
      "import": "./dist/utils/index.js"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src",
    "format": "prettier --write \"src/**/*.ts\""
  },
  "dependencies": {
    "ai": "^6.0.0",
    "@ai-sdk/gateway": "^1.0.0",
    "zod": "^3.23.0"
  },
  "peerDependencies": {
    "@ai-sdk/openai": "^2.0.0",
    "@ai-sdk/google": "^2.0.0",
    "@ai-sdk/fal": "^1.0.0",
    "@ai-sdk/replicate": "^1.0.0",
    "@ai-sdk/togetherai": "^1.0.0"
  },
  "peerDependenciesMeta": {
    "@ai-sdk/openai": { "optional": true },
    "@ai-sdk/google": { "optional": true },
    "@ai-sdk/fal": { "optional": true },
    "@ai-sdk/replicate": { "optional": true },
    "@ai-sdk/togetherai": { "optional": true }
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

> Verify peer-dep majors against current AI SDK v6 release at install time. If a peer package version doesn't resolve, bump the range and update the design doc.

- [ ] **Step 2: Create `tsconfig.json`**

Path: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "src/integration/**"]
}
```

A separate `tsconfig.test.json` may be added later if test files need looser settings; not needed for slice 1.

- [ ] **Step 3: Create `tsup.config.ts`**

Path: `tsup.config.ts`

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'utils/index': 'src/utils/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
```

- [ ] **Step 4: Create `vitest.config.ts`**

Path: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/integration/**/*.integration.test.ts'],
    exclude: ['src/integration/live/**', 'node_modules', 'dist'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/integration/**', 'src/index.ts'],
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

- [ ] **Step 5: Create `.gitignore`**

Path: `.gitignore`

```
node_modules
dist
coverage
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 6: Create `.prettierrc.json`**

Path: `.prettierrc.json`

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "arrowParens": "always"
}
```

- [ ] **Step 7: Create `eslint.config.js`**

Path: `eslint.config.js`

```javascript
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
];
```

- [ ] **Step 8: Create empty `src/index.ts`**

Path: `src/index.ts`

```typescript
// Public entry — populated in later tasks.
export {};
```

- [ ] **Step 9: Install dependencies**

Run: `pnpm install`
Expected: dependencies installed without errors, `pnpm-lock.yaml` created.

- [ ] **Step 10: Verify scaffold scripts run**

Run: `pnpm typecheck`
Expected: exits 0, no output (empty surface compiles cleanly).

Run: `pnpm test`
Expected: vitest reports "No test files found" and exits 0 (or with a "no tests" notice — check vitest version behavior; either way, no failure).

Run: `pnpm build`
Expected: `dist/` directory created with `index.js` and `index.d.ts`.

- [ ] **Step 11: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts vitest.config.ts eslint.config.js .gitignore .prettierrc.json pnpm-lock.yaml src/index.ts
git commit -m "chore: scaffold pnpm + tsup + vitest + eslint project"
```

---

## Task 2: Public type surface

**Files:**
- Create: `src/types.ts`, `src/types.test-d.ts`
- Modify: `src/index.ts` (add re-exports)

This task defines every public type the library exposes, including the four §15.6 commitments. No runtime code; tests are type-level via vitest's `expectTypeOf`.

- [ ] **Step 1: Write the failing type test**

Path: `src/types.test-d.ts`

```typescript
import { expectTypeOf } from 'vitest';
import type {
  Capability,
  TransformKind,
  ModelId,
  GenerateInput,
  GeneratedImage,
  ImageGenResult,
  Mode,
  ApiPath,
  RequestOperation,
  Logger,
  LogLevel,
} from './types.js';

// §3.4 Capability shape
declare const cap: Capability;
expectTypeOf(cap.textToImage).toBeBoolean();
expectTypeOf(cap.imageEdit).toBeBoolean();
expectTypeOf(cap.multiReference).toBeBoolean();
expectTypeOf(cap.transparentBackground).toBeBoolean();
expectTypeOf(cap.maxN).toBeNumber();
expectTypeOf(cap.supportsSeed).toBeBoolean();
expectTypeOf(cap.supportsNegativePrompt).toBeBoolean();
expectTypeOf(cap.apiPath).toEqualTypeOf<ApiPath>();
expectTypeOf(cap.aspectRatios).toEqualTypeOf<readonly string[] | undefined>();
expectTypeOf(cap.sizes).toEqualTypeOf<readonly string[] | undefined>();
expectTypeOf(cap.transforms).toEqualTypeOf<readonly TransformKind[] | undefined>();

// §15.6 commitment 2 — TransformKind exported
expectTypeOf<TransformKind>().toEqualTypeOf<
  'remove-background' | 'upscale' | 'restore' | 'outpaint'
>();

// ModelId: 'provider/model'
expectTypeOf<ModelId>().toEqualTypeOf<`${string}/${string}`>();

// Mode + ApiPath unions
expectTypeOf<Mode>().toEqualTypeOf<'gateway' | 'direct'>();
expectTypeOf<ApiPath>().toEqualTypeOf<'generateImage' | 'generateText'>();

// §15.6 commitment 3 — operation is a discriminator union
expectTypeOf<RequestOperation>().toEqualTypeOf<'generate' | 'edit' | 'variations'>();

// §3.5 GeneratedImage shape
declare const img: GeneratedImage;
expectTypeOf(img.base64).toBeString();
expectTypeOf(img.uint8Array).toEqualTypeOf<Uint8Array>();
expectTypeOf(img.mediaType).toBeString();
expectTypeOf(img.width).toEqualTypeOf<number | undefined>();
expectTypeOf(img.height).toEqualTypeOf<number | undefined>();
expectTypeOf(img.seed).toEqualTypeOf<number | undefined>();

// §3.5 ImageGenResult shape
declare const result: ImageGenResult;
expectTypeOf(result.images).toEqualTypeOf<readonly GeneratedImage[]>();
expectTypeOf(result.model).toEqualTypeOf<ModelId>();
expectTypeOf(result.mode).toEqualTypeOf<Mode>();
expectTypeOf(result.request.operation).toEqualTypeOf<RequestOperation>();
expectTypeOf(result.request.n).toBeNumber();
expectTypeOf(result.request.referenceCount).toBeNumber();
expectTypeOf(result.timings.start).toBeNumber();
expectTypeOf(result.timings.finish).toBeNumber();
expectTypeOf(result.timings.durationMs).toBeNumber();

// §15.6 commitment 4 — mask field present, optional
expectTypeOf(result.mask).toEqualTypeOf<GeneratedImage | undefined>();

// GenerateInput shape (§4.2)
declare const input: GenerateInput;
expectTypeOf(input.prompt).toBeString();
expectTypeOf(input.model).toEqualTypeOf<ModelId | undefined>();
expectTypeOf(input.n).toEqualTypeOf<number | undefined>();
expectTypeOf(input.size).toEqualTypeOf<string | undefined>();
expectTypeOf(input.signal).toEqualTypeOf<AbortSignal | undefined>();

// Logger
declare const logger: Logger;
expectTypeOf(logger).toEqualTypeOf<
  (level: LogLevel, message: string, meta?: Record<string, unknown>) => void
>();
```

- [ ] **Step 2: Run the type test to verify it fails**

Run: `pnpm vitest run src/types.test-d.ts`
Expected: FAIL — `Cannot find module './types.js'` or similar.

- [ ] **Step 3: Implement `src/types.ts`**

Path: `src/types.ts`

```typescript
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
```

- [ ] **Step 4: Re-export from `src/index.ts`**

Path: `src/index.ts`

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
  RequestOperation,
  ResultRequest,
  TransformKind,
} from './types.js';
```

- [ ] **Step 5: Run type test to verify it passes**

Run: `pnpm vitest run src/types.test-d.ts`
Expected: PASS.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/types.test-d.ts src/index.ts
git commit -m "feat: define public type surface and §15.6 commitments"
```

---

## Task 3: Errors module

**Files:**
- Create: `src/errors.ts`, `src/errors.test.ts`
- Modify: `src/index.ts`

Slice 1 hierarchy: `ImageGenError` (base) + `ImageGenConfigError`, `ImageGenValidationError`, `ImageGenProviderError`, `ImageGenNetworkError`. Subtypes (`RateLimitError`, etc.) land in slice 3.

- [ ] **Step 1: Write failing test**

Path: `src/errors.test.ts`

```typescript
import { describe, expect, test } from 'vitest';
import {
  ImageGenError,
  ImageGenConfigError,
  ImageGenValidationError,
  ImageGenProviderError,
  ImageGenNetworkError,
} from './errors.js';

describe('ImageGenError', () => {
  test('base error carries code, category, retryable', () => {
    const err = new ImageGenError({
      message: 'something failed',
      code: 'UNKNOWN',
      category: 'provider',
      retryable: false,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('something failed');
    expect(err.code).toBe('UNKNOWN');
    expect(err.category).toBe('provider');
    expect(err.retryable).toBe(false);
    expect(err.name).toBe('ImageGenError');
  });

  test('preserves cause and modelId', () => {
    const cause = new Error('underlying');
    const err = new ImageGenError({
      message: 'wrapped',
      code: 'WRAP',
      category: 'network',
      retryable: true,
      modelId: 'openai/gpt-image-2',
      cause,
    });
    expect(err.cause).toBe(cause);
    expect(err.modelId).toBe('openai/gpt-image-2');
  });
});

describe('ImageGenConfigError', () => {
  test('is a config-category error, not retryable', () => {
    const err = new ImageGenConfigError('AI_GATEWAY_API_KEY missing', 'CONFIG_MISSING_KEY');
    expect(err).toBeInstanceOf(ImageGenError);
    expect(err.category).toBe('config');
    expect(err.retryable).toBe(false);
    expect(err.code).toBe('CONFIG_MISSING_KEY');
    expect(err.name).toBe('ImageGenConfigError');
  });
});

describe('ImageGenValidationError', () => {
  test('is a validation-category error, not retryable, accepts hint', () => {
    const err = new ImageGenValidationError(
      "'n' = 5 exceeds maxN = 4 for 'openai/gpt-image-2'",
      'VALIDATION_MAX_N',
      { modelId: 'openai/gpt-image-2', hint: 'lower n or pick another model' },
    );
    expect(err).toBeInstanceOf(ImageGenError);
    expect(err.category).toBe('validation');
    expect(err.retryable).toBe(false);
    expect(err.hint).toBe('lower n or pick another model');
  });
});

describe('ImageGenProviderError', () => {
  test('is a provider-category error, retryable optional', () => {
    const err = new ImageGenProviderError('upstream 500', 'PROVIDER_ERROR', { retryable: true });
    expect(err.category).toBe('provider');
    expect(err.retryable).toBe(true);
  });
});

describe('ImageGenNetworkError', () => {
  test('is a network-category error, retryable by default', () => {
    const err = new ImageGenNetworkError('connection reset', 'NETWORK_ERROR');
    expect(err.category).toBe('network');
    expect(err.retryable).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/errors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/errors.ts`**

Path: `src/errors.ts`

```typescript
import type { Mode, ModelId } from './types.js';

export type ErrorCategory = 'config' | 'validation' | 'provider' | 'network' | 'abort';

export interface ImageGenErrorInit {
  readonly message: string;
  readonly code: string;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly modelId?: ModelId;
  readonly mode?: Mode;
  readonly cause?: unknown;
  readonly providerError?: Readonly<{
    status?: number;
    type?: string;
    message?: string;
  }>;
  readonly hint?: string;
}

export class ImageGenError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly modelId?: ModelId;
  readonly mode?: Mode;
  override readonly cause?: unknown;
  readonly providerError?: ImageGenErrorInit['providerError'];
  readonly hint?: string;

  constructor(init: ImageGenErrorInit) {
    super(init.message);
    this.name = 'ImageGenError';
    this.code = init.code;
    this.category = init.category;
    this.retryable = init.retryable;
    if (init.modelId !== undefined) this.modelId = init.modelId;
    if (init.mode !== undefined) this.mode = init.mode;
    if (init.cause !== undefined) this.cause = init.cause;
    if (init.providerError !== undefined) this.providerError = init.providerError;
    if (init.hint !== undefined) this.hint = init.hint;
  }
}

export interface SubtypeInit {
  readonly modelId?: ModelId;
  readonly mode?: Mode;
  readonly cause?: unknown;
  readonly hint?: string;
  readonly retryable?: boolean;
  readonly providerError?: ImageGenErrorInit['providerError'];
}

export class ImageGenConfigError extends ImageGenError {
  constructor(message: string, code: string, init: SubtypeInit = {}) {
    super({ message, code, category: 'config', retryable: false, ...init });
    this.name = 'ImageGenConfigError';
  }
}

export class ImageGenValidationError extends ImageGenError {
  constructor(message: string, code: string, init: SubtypeInit = {}) {
    super({ message, code, category: 'validation', retryable: false, ...init });
    this.name = 'ImageGenValidationError';
  }
}

export class ImageGenProviderError extends ImageGenError {
  constructor(message: string, code: string, init: SubtypeInit = {}) {
    super({
      message,
      code,
      category: 'provider',
      retryable: init.retryable ?? false,
      ...init,
    });
    this.name = 'ImageGenProviderError';
  }
}

export class ImageGenNetworkError extends ImageGenError {
  constructor(message: string, code: string, init: SubtypeInit = {}) {
    super({
      message,
      code,
      category: 'network',
      retryable: init.retryable ?? true,
      ...init,
    });
    this.name = 'ImageGenNetworkError';
  }
}
```

- [ ] **Step 4: Re-export from `src/index.ts`**

Path: `src/index.ts` (append below existing exports)

```typescript
export {
  ImageGenError,
  ImageGenConfigError,
  ImageGenValidationError,
  ImageGenProviderError,
  ImageGenNetworkError,
} from './errors.js';
export type { ErrorCategory, ImageGenErrorInit } from './errors.js';
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/errors.test.ts`
Expected: PASS, 5 passing tests.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/errors.ts src/errors.test.ts src/index.ts
git commit -m "feat: add typed error hierarchy (slice-1 subset)"
```

---

## Task 4: Capabilities + Registry

**Files:**
- Create: `src/capabilities.ts`, `src/registry.ts`, `src/registry.test.ts`
- Modify: `src/index.ts`

Slice 1 ships only `openai/gpt-image-2`. `capabilities.ts` is a thin module for shared capability helpers. `registry.ts` holds the runtime data and lookup.

- [ ] **Step 1: Write failing test**

Path: `src/registry.test.ts`

```typescript
import { describe, expect, test } from 'vitest';
import { getModel, listRegisteredModelIds, BUILT_IN_MODELS } from './registry.js';

describe('registry — slice 1', () => {
  test('contains openai/gpt-image-2 with correct capability', () => {
    const entry = getModel('openai/gpt-image-2');
    expect(entry).toBeDefined();
    expect(entry?.id).toBe('openai/gpt-image-2');
    expect(entry?.provider).toBe('openai');
    expect(entry?.capability.apiPath).toBe('generateImage');
    expect(entry?.capability.textToImage).toBe(true);
    expect(entry?.capability.imageEdit).toBe(true);
    expect(entry?.capability.multiReference).toBe(true);
    expect(entry?.capability.transparentBackground).toBe(true);
    expect(entry?.capability.maxN).toBe(4);
    expect(entry?.capability.supportsSeed).toBe(true);
  });

  test('returns undefined for unknown model', () => {
    expect(getModel('nope/missing')).toBeUndefined();
  });

  test('listRegisteredModelIds returns the seeded set', () => {
    const ids = listRegisteredModelIds();
    expect(ids).toContain('openai/gpt-image-2');
    expect(ids.length).toBeGreaterThanOrEqual(1);
  });

  test('built-in entry is frozen — capability is readonly at runtime', () => {
    const entry = BUILT_IN_MODELS['openai/gpt-image-2'];
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry?.capability)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/capabilities.ts`**

Path: `src/capabilities.ts`

```typescript
import type { Capability } from './types.js';

export function freezeCapability(cap: Capability): Capability {
  return Object.freeze({ ...cap });
}
```

- [ ] **Step 4: Implement `src/registry.ts`**

Path: `src/registry.ts`

```typescript
import { freezeCapability } from './capabilities.js';
import type { Capability, ModelId } from './types.js';

export interface RegisteredModel {
  readonly id: ModelId;
  readonly provider: string;
  readonly capability: Capability;
}

function defineModel(id: ModelId, provider: string, capability: Capability): RegisteredModel {
  return Object.freeze({
    id,
    provider,
    capability: freezeCapability(capability),
  });
}

// §7.1 v1 registry — slice 1 ships only openai/gpt-image-2.
// Other 11 models are added in slice 2.
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
});

export function getModel(id: string): RegisteredModel | undefined {
  return BUILT_IN_MODELS[id as ModelId];
}

export function listRegisteredModelIds(): readonly ModelId[] {
  return Object.keys(BUILT_IN_MODELS) as ModelId[];
}
```

- [ ] **Step 5: Re-export from `src/index.ts`**

Path: `src/index.ts` (append)

```typescript
export { getModel, listRegisteredModelIds } from './registry.js';
export type { RegisteredModel } from './registry.js';
```

- [ ] **Step 6: Run tests**

Run: `pnpm vitest run src/registry.test.ts`
Expected: PASS, 4 tests.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/capabilities.ts src/registry.ts src/registry.test.ts src/index.ts
git commit -m "feat: add registry seeded with openai/gpt-image-2"
```

---

## Task 5: Validation rules

**Files:**
- Create: `src/validation.ts`, `src/validation.test.ts`

Validation runs **before** any network call (spec §8.3) and throws `ImageGenValidationError`. Slice 1 covers: model in registry, prompt non-empty, `n ≤ maxN`, `size` in declared sizes.

- [ ] **Step 1: Write failing test**

Path: `src/validation.test.ts`

```typescript
import { describe, expect, test } from 'vitest';
import { ImageGenValidationError } from './errors.js';
import { getModel } from './registry.js';
import { validateGenerate } from './validation.js';
import type { GenerateInput } from './types.js';

const model = getModel('openai/gpt-image-2');
if (!model) throw new Error('test fixture: gpt-image-2 must exist');

const baseInput: GenerateInput = { prompt: 'a cat' };

describe('validateGenerate', () => {
  test('passes for valid input', () => {
    expect(() => validateGenerate(baseInput, model.capability)).not.toThrow();
  });

  test('throws when prompt is empty string', () => {
    expect(() => validateGenerate({ prompt: '' }, model.capability)).toThrow(
      ImageGenValidationError,
    );
  });

  test('throws when prompt is whitespace only', () => {
    expect(() => validateGenerate({ prompt: '   ' }, model.capability)).toThrow(
      ImageGenValidationError,
    );
  });

  test('throws when n exceeds maxN', () => {
    try {
      validateGenerate({ ...baseInput, n: model.capability.maxN + 1 }, model.capability);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ImageGenValidationError);
      const e = err as ImageGenValidationError;
      expect(e.code).toBe('VALIDATION_MAX_N');
    }
  });

  test('passes when n equals maxN', () => {
    expect(() =>
      validateGenerate({ ...baseInput, n: model.capability.maxN }, model.capability),
    ).not.toThrow();
  });

  test('throws when size not in declared sizes', () => {
    try {
      validateGenerate({ ...baseInput, size: '999x999' }, model.capability);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ImageGenValidationError);
      const e = err as ImageGenValidationError;
      expect(e.code).toBe('VALIDATION_SIZE');
      expect(e.message).toContain('999x999');
    }
  });

  test('passes when size matches a declared size', () => {
    expect(() =>
      validateGenerate({ ...baseInput, size: '1024x1024' }, model.capability),
    ).not.toThrow();
  });

  test('skips size check when capability does not declare sizes', () => {
    const capNoSizes = { ...model.capability, sizes: undefined };
    expect(() => validateGenerate({ ...baseInput, size: 'anything' }, capNoSizes)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/validation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/validation.ts`**

Path: `src/validation.ts`

```typescript
import { ImageGenValidationError } from './errors.js';
import type { Capability, GenerateInput, ModelId } from './types.js';

export interface ValidationContext {
  readonly modelId?: ModelId;
}

export function validateGenerate(
  input: GenerateInput,
  capability: Capability,
  ctx: ValidationContext = {},
): void {
  if (input.prompt.trim().length === 0) {
    throw new ImageGenValidationError(
      "'prompt' must be a non-empty string",
      'VALIDATION_EMPTY_PROMPT',
      { modelId: ctx.modelId, hint: 'pass a non-empty prompt' },
    );
  }

  const n = input.n ?? 1;
  if (n > capability.maxN) {
    throw new ImageGenValidationError(
      `'n' = ${n} exceeds maxN = ${capability.maxN}` +
        (ctx.modelId ? ` for '${ctx.modelId}'` : ''),
      'VALIDATION_MAX_N',
      { modelId: ctx.modelId, hint: `lower n to ≤ ${capability.maxN}` },
    );
  }

  if (input.size !== undefined && capability.sizes !== undefined) {
    if (!capability.sizes.includes(input.size)) {
      throw new ImageGenValidationError(
        `'size' = '${input.size}' not supported` +
          (ctx.modelId ? ` by '${ctx.modelId}'` : '') +
          `. Allowed: ${capability.sizes.join(', ')}.`,
        'VALIDATION_SIZE',
        { modelId: ctx.modelId, hint: `pick a size from: ${capability.sizes.join(', ')}` },
      );
    }
  }
}
```

> Aspect-ratio, multi-reference, mask, transparent-background, and empty-images checks are deferred. Edit/variations/batch validations land with their respective slices (4 and 5).

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/validation.test.ts`
Expected: PASS, 8 tests.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/validation.ts src/validation.test.ts
git commit -m "feat: validate prompt/n/size against capability"
```

---

## Task 6: Mode resolver

**Files:**
- Create: `src/resolver.ts`, `src/resolver.test.ts`

Resolves `mode` per spec §6.1. Slice 1 supports gateway only. `getModel` is used to look up the model; resolver throws config error when no key is available.

- [ ] **Step 1: Write failing test**

Path: `src/resolver.test.ts`

```typescript
import { describe, expect, test } from 'vitest';
import { ImageGenConfigError } from './errors.js';
import { resolveMode } from './resolver.js';

describe('resolveMode — slice 1 (gateway only)', () => {
  test('per-call mode wins over client default', () => {
    expect(
      resolveMode({
        modelId: 'openai/gpt-image-2',
        callOverride: 'gateway',
        clientMode: 'auto',
        env: {},
      }),
    ).toBe('gateway');
  });

  test('client mode used when not auto', () => {
    expect(
      resolveMode({
        modelId: 'openai/gpt-image-2',
        clientMode: 'gateway',
        env: { AI_GATEWAY_API_KEY: 'k' },
      }),
    ).toBe('gateway');
  });

  test('auto picks gateway when AI_GATEWAY_API_KEY set', () => {
    expect(
      resolveMode({
        modelId: 'openai/gpt-image-2',
        clientMode: 'auto',
        env: { AI_GATEWAY_API_KEY: 'k' },
      }),
    ).toBe('gateway');
  });

  test('auto picks gateway when explicit gateway.apiKey passed', () => {
    expect(
      resolveMode({
        modelId: 'openai/gpt-image-2',
        clientMode: 'auto',
        env: {},
        gatewayApiKey: 'explicit',
      }),
    ).toBe('gateway');
  });

  test('throws config error when no gateway key available', () => {
    try {
      resolveMode({ modelId: 'openai/gpt-image-2', clientMode: 'auto', env: {} });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ImageGenConfigError);
      const e = err as ImageGenConfigError;
      expect(e.code).toBe('CONFIG_NO_PROVIDER');
      expect(e.message).toContain('AI_GATEWAY_API_KEY');
    }
  });

  test('throws config error when client mode is direct (not yet supported in slice 1)', () => {
    try {
      resolveMode({
        modelId: 'openai/gpt-image-2',
        clientMode: 'direct',
        env: { OPENAI_API_KEY: 'k' },
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ImageGenConfigError);
      const e = err as ImageGenConfigError;
      expect(e.code).toBe('CONFIG_DIRECT_MODE_NOT_AVAILABLE');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/resolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/resolver.ts`**

Path: `src/resolver.ts`

```typescript
import { ImageGenConfigError } from './errors.js';
import type { Mode, ModelId } from './types.js';

export interface ResolveModeArgs {
  readonly modelId: ModelId;
  readonly callOverride?: Mode;
  readonly clientMode?: Mode | 'auto';
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly gatewayApiKey?: string;
}

// §6.1 — slice-1 implementation: gateway only. Direct mode raises a typed
// config error with a clear message until slice 2 lands.
export function resolveMode(args: ResolveModeArgs): Mode {
  if (args.callOverride !== undefined) {
    return guardModeAvailable(args.callOverride);
  }

  const clientMode = args.clientMode ?? 'auto';
  if (clientMode !== 'auto') {
    return guardModeAvailable(clientMode);
  }

  if (args.gatewayApiKey !== undefined || args.env.AI_GATEWAY_API_KEY !== undefined) {
    return 'gateway';
  }

  throw new ImageGenConfigError(
    'no provider key available — set AI_GATEWAY_API_KEY (gateway mode) ' +
      'or pass gateway.apiKey at construction',
    'CONFIG_NO_PROVIDER',
    { modelId: args.modelId, hint: 'set AI_GATEWAY_API_KEY in your environment' },
  );
}

function guardModeAvailable(mode: Mode): Mode {
  if (mode === 'direct') {
    throw new ImageGenConfigError(
      "direct mode lands in slice 2; use 'gateway' for now",
      'CONFIG_DIRECT_MODE_NOT_AVAILABLE',
      { hint: 'use mode=gateway and set AI_GATEWAY_API_KEY' },
    );
  }
  return mode;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/resolver.test.ts`
Expected: PASS, 6 tests.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/resolver.ts src/resolver.test.ts
git commit -m "feat: gateway-mode resolver with typed config error"
```

---

## Task 7: ProviderAdapter interface + default adapter

**Files:**
- Create: `src/providers/adapter.ts`, `src/providers/default.ts`, `src/providers/default.test.ts`

This task touches AI SDK v6 directly. **Before writing the implementation, invoke `Skill:ai-sdk` to confirm the import path and call signature for `generateImage`.** The code below assumes the v6 surface; adjust types and import paths as the skill confirms.

The default adapter handles `(gateway, generateImage)`. Other dispatches (`(direct, *)`, `(gateway, generateText)`) land in later slices.

- [ ] **Step 1: Write failing test**

Path: `src/providers/default.test.ts`

```typescript
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createDefaultAdapter } from './default.js';
import type { ResolvedRequest } from './adapter.js';

vi.mock('ai', () => ({
  generateImage: vi.fn(),
}));

describe('default adapter — gateway + generateImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('buildCall returns generateImage shape with model string for gateway', () => {
    const adapter = createDefaultAdapter();
    const req: ResolvedRequest = {
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
    };
    const call = adapter.buildCall(req);
    expect(call.fn).toBe('generateImage');
    expect(call.args.model).toBe('openai/gpt-image-2');
    expect(call.args.prompt).toBe('a cat');
    expect(call.args.n).toBe(1);
  });

  test('buildCall passes size when present', () => {
    const adapter = createDefaultAdapter();
    const req: ResolvedRequest = {
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
      n: 2,
      size: '1024x1024',
      seed: 42,
    };
    const call = adapter.buildCall(req);
    expect(call.args.size).toBe('1024x1024');
    expect(call.args.seed).toBe(42);
    expect(call.args.n).toBe(2);
  });

  test('buildCall throws for direct mode (slice-1 boundary)', () => {
    const adapter = createDefaultAdapter();
    const req: ResolvedRequest = {
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
    expect(() => adapter.buildCall(req)).toThrow(/direct mode/i);
  });

  test('buildCall throws for generateText apiPath (slice-1 boundary)', () => {
    const adapter = createDefaultAdapter();
    const req: ResolvedRequest = {
      operation: 'generate',
      modelId: 'google/gemini-2.5-flash-image',
      mode: 'gateway',
      apiPath: 'generateText',
      capability: {
        textToImage: true,
        imageEdit: true,
        multiReference: true,
        transparentBackground: false,
        maxN: 1,
        supportsSeed: false,
        supportsNegativePrompt: false,
        apiPath: 'generateText',
      },
      prompt: 'a cat',
      n: 1,
    };
    expect(() => adapter.buildCall(req)).toThrow(/generateText/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/providers/default.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Define adapter interface in `src/providers/adapter.ts`**

Path: `src/providers/adapter.ts`

```typescript
import type {
  ApiPath,
  Capability,
  ImageGenResult,
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

// AI SDK v6 generateImage args (slice-1 subset). Verify against current
// ai package types when implementing — extend if v6 added fields.
export interface GenerateImageArgs {
  readonly model: string;
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
```

- [ ] **Step 4: Implement `src/providers/default.ts`**

Path: `src/providers/default.ts`

```typescript
import type { AdapterCall, ProviderAdapter, ResolvedRequest } from './adapter.js';

export function createDefaultAdapter(): ProviderAdapter {
  return {
    buildCall(req: ResolvedRequest): AdapterCall {
      if (req.mode === 'direct') {
        throw new Error('direct mode lands in slice 2; default adapter is gateway-only');
      }
      if (req.apiPath === 'generateText') {
        throw new Error('generateText apiPath lands in slice 2; default adapter handles generateImage only');
      }

      return {
        fn: 'generateImage',
        args: {
          model: req.modelId,
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

> The terminal handler in `operations/generate.ts` (Task 13) calls `normalizeResult` directly using the raw AI SDK output. `parseResponse` joins the adapter interface in slice 2 when per-provider response shapes diverge.

- [ ] **Step 5: Run tests**

The tests in this task only exercise `buildCall` (fast path). `parseResponse` is exercised via Task 8's tests on the result normalizer.

Run: `pnpm vitest run src/providers/default.test.ts`
Expected: PASS, 4 tests.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/providers/adapter.ts src/providers/default.ts src/providers/default.test.ts
git commit -m "feat: ProviderAdapter interface + default gateway adapter"
```

---

## Task 8: Result normalizer

**Files:**
- Create: `src/result.ts`, `src/result.test.ts`, `tests/fixtures/pixel-1x1.png.base64.ts`

`normalizeResult` is the single place that knows AI SDK's dual-path shape. Slice 1 supports the `generateImage` output shape. URL→bytes downloading is included (per spec §3.5) and unit-tested.

**Before writing**, invoke `Skill:ai-sdk` to confirm the AI SDK v6 `generateImage` response shape — specifically how images are returned (`base64`, `uint8Array`, `url`, `mediaType`). The shape below is the assumed v6 interface; adjust if the skill reveals different field names.

- [ ] **Step 1: Create the PNG fixture**

Path: `tests/fixtures/pixel-1x1.png.base64.ts`

```typescript
// 1×1 transparent PNG (the smallest valid PNG, ~67 bytes raw).
export const PIXEL_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

export const PIXEL_1X1_BYTES = Uint8Array.from(Buffer.from(PIXEL_1X1_BASE64, 'base64'));
```

- [ ] **Step 2: Write failing test**

Path: `src/result.test.ts`

```typescript
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { normalizeResult } from './result.js';
import type { ResolvedRequest } from './providers/adapter.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../tests/fixtures/pixel-1x1.png.base64.js';

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
  prompt: 'a cat',
  n: 1,
};

const timings = { start: 1000, finish: 1500 };

describe('normalizeResult — generateImage path', () => {
  test('produces ImageGenResult shape (§3.5) from byte-bearing output', async () => {
    const aiSdkOutput = {
      images: [
        {
          base64: PIXEL_1X1_BASE64,
          uint8Array: PIXEL_1X1_BYTES,
          mediaType: 'image/png',
        },
      ],
    };
    const result = await normalizeResult(
      { fn: 'generateImage', output: aiSdkOutput },
      baseReq,
      timings,
    );
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.base64).toBe(PIXEL_1X1_BASE64);
    expect(result.images[0]?.uint8Array).toBeInstanceOf(Uint8Array);
    expect(result.images[0]?.mediaType).toBe('image/png');
    expect(result.model).toBe('openai/gpt-image-2');
    expect(result.mode).toBe('gateway');
    expect(result.request.operation).toBe('generate');
    expect(result.request.prompt).toBe('a cat');
    expect(result.request.n).toBe(1);
    expect(result.request.referenceCount).toBe(0);
    expect(result.timings.start).toBe(1000);
    expect(result.timings.finish).toBe(1500);
    expect(result.timings.durationMs).toBe(500);
    expect(result.mask).toBeUndefined();
  });

  test('decodes base64 when uint8Array missing', async () => {
    const aiSdkOutput = {
      images: [{ base64: PIXEL_1X1_BASE64, mediaType: 'image/png' }],
    };
    const result = await normalizeResult(
      { fn: 'generateImage', output: aiSdkOutput },
      baseReq,
      timings,
    );
    expect(result.images[0]?.uint8Array).toBeInstanceOf(Uint8Array);
    expect(result.images[0]?.uint8Array.length).toBe(PIXEL_1X1_BYTES.length);
  });

  test('downloads URL → bytes when output carries a URL', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: async () => PIXEL_1X1_BYTES.buffer,
    } as unknown as Response);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch;
    try {
      const aiSdkOutput = { images: [{ url: 'https://example.com/img.png' }] };
      const result = await normalizeResult(
        { fn: 'generateImage', output: aiSdkOutput },
        baseReq,
        timings,
      );
      expect(fakeFetch).toHaveBeenCalledWith('https://example.com/img.png', expect.anything());
      expect(result.images[0]?.uint8Array).toBeInstanceOf(Uint8Array);
      expect(result.images[0]?.mediaType).toBe('image/png');
      expect(result.images[0]?.base64).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('throws ImageGenProviderError when output has no images', async () => {
    const aiSdkOutput = { images: [] };
    await expect(
      normalizeResult({ fn: 'generateImage', output: aiSdkOutput }, baseReq, timings),
    ).rejects.toThrow(/no images/i);
  });

  test('preserves seed when provider returns one', async () => {
    const aiSdkOutput = {
      images: [
        {
          base64: PIXEL_1X1_BASE64,
          uint8Array: PIXEL_1X1_BYTES,
          mediaType: 'image/png',
          seed: 12345,
        },
      ],
    };
    const result = await normalizeResult(
      { fn: 'generateImage', output: aiSdkOutput },
      baseReq,
      timings,
    );
    expect(result.images[0]?.seed).toBe(12345);
  });

  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/result.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/result.ts`**

Path: `src/result.ts`

```typescript
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

  const result: ImageGenResult = {
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
  return result;
}

async function normalizeImage(raw: RawImage): Promise<GeneratedImage> {
  let uint8Array: Uint8Array | undefined = raw.uint8Array;
  let base64: string | undefined = raw.base64;
  let mediaType = raw.mediaType ?? 'image/png';

  if (uint8Array === undefined && base64 !== undefined) {
    uint8Array = Uint8Array.from(Buffer.from(base64, 'base64'));
  }

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
  const mediaType = response.headers.get('content-type') ?? undefined;
  return { bytes: new Uint8Array(buf), mediaType };
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/result.test.ts`
Expected: PASS, 5 tests.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/result.ts src/result.test.ts tests/fixtures/pixel-1x1.png.base64.ts
git commit -m "feat: result normalizer with URL→bytes download (§3.5)"
```

---

## Task 9: Middleware chain compose

**Files:**
- Create: `src/middleware/chain.ts`, `src/middleware/chain.test.ts`

Pure compose function: `composeChain(middlewares, terminal)` returns a single `Handler`. Order is outer → inner; `middlewares[0]` wraps the outermost.

- [ ] **Step 1: Write failing test**

Path: `src/middleware/chain.test.ts`

```typescript
import { describe, expect, test, vi } from 'vitest';
import { composeChain } from './chain.js';
import type { Handler, Middleware } from './chain.js';
import type { ResolvedRequest } from '../providers/adapter.js';
import type { ImageGenResult } from '../types.js';

const dummyReq: ResolvedRequest = {
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
};

const dummyResult = {
  images: [],
  model: 'openai/gpt-image-2',
  mode: 'gateway',
  request: { operation: 'generate', n: 1, referenceCount: 0 },
  timings: { start: 0, finish: 0, durationMs: 0 },
} as unknown as ImageGenResult;

const dummyCtx = {
  startedAt: 0,
  modelId: 'openai/gpt-image-2' as const,
  mode: 'gateway' as const,
  attempt: 1,
};

describe('composeChain', () => {
  test('runs middlewares outer → inner around terminal handler', async () => {
    const calls: string[] = [];
    const outer: Middleware = (next) => async (req, ctx) => {
      calls.push('outer-pre');
      const r = await next(req, ctx);
      calls.push('outer-post');
      return r;
    };
    const inner: Middleware = (next) => async (req, ctx) => {
      calls.push('inner-pre');
      const r = await next(req, ctx);
      calls.push('inner-post');
      return r;
    };
    const terminal: Handler = async () => {
      calls.push('terminal');
      return dummyResult;
    };

    const handler = composeChain([outer, inner], terminal);
    await handler(dummyReq, dummyCtx);
    expect(calls).toEqual(['outer-pre', 'inner-pre', 'terminal', 'inner-post', 'outer-post']);
  });

  test('middleware can short-circuit without calling next', async () => {
    const terminalSpy = vi.fn(async () => dummyResult);
    const blocking: Middleware = () => async () => dummyResult;
    const handler = composeChain([blocking], terminalSpy);
    await handler(dummyReq, dummyCtx);
    expect(terminalSpy).not.toHaveBeenCalled();
  });

  test('empty middleware list returns terminal handler unchanged', async () => {
    const terminalSpy = vi.fn(async () => dummyResult);
    const handler = composeChain([], terminalSpy);
    await handler(dummyReq, dummyCtx);
    expect(terminalSpy).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/middleware/chain.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/middleware/chain.ts`**

Path: `src/middleware/chain.ts`

```typescript
import type { ImageGenResult, LogLevel, Logger, Mode, ModelId } from '../types.js';
import type { ResolvedRequest } from '../providers/adapter.js';

export interface Context {
  readonly startedAt: number;
  readonly modelId: ModelId;
  readonly mode: Mode;
  readonly attempt: number;
  readonly signal?: AbortSignal;
  readonly logger?: Logger;
}

export type Handler = (req: ResolvedRequest, ctx: Context) => Promise<ImageGenResult>;
export type Middleware = (next: Handler) => Handler;

// Compose middlewares around a terminal handler.
// composeChain([A, B], T) = A(B(T)) — so A wraps B which wraps T.
export function composeChain(middlewares: readonly Middleware[], terminal: Handler): Handler {
  return middlewares.reduceRight<Handler>((next, mw) => mw(next), terminal);
}

export type { LogLevel, Logger };
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/middleware/chain.test.ts`
Expected: PASS, 3 tests.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/middleware/chain.ts src/middleware/chain.test.ts
git commit -m "feat: middleware chain compose"
```

---

## Task 10: Logging middleware

**Files:**
- Create: `src/middleware/logging.ts`, `src/middleware/logging.test.ts`

Logs `info`-level start and finish events with model id, mode, duration. Uses the user-provided logger or a no-op default.

- [ ] **Step 1: Write failing test**

Path: `src/middleware/logging.test.ts`

```typescript
import { describe, expect, test, vi } from 'vitest';
import { createLoggingMiddleware } from './logging.js';
import type { Handler } from './chain.js';
import type { ResolvedRequest } from '../providers/adapter.js';
import type { ImageGenResult, Logger } from '../types.js';

const dummyReq: ResolvedRequest = {
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
};

const dummyResult = {
  images: [],
  model: 'openai/gpt-image-2',
  mode: 'gateway',
  request: { operation: 'generate', n: 1, referenceCount: 0 },
  timings: { start: 0, finish: 0, durationMs: 0 },
} as unknown as ImageGenResult;

describe('logging middleware', () => {
  test('emits info before and after the call', async () => {
    const logs: Array<[string, string, Record<string, unknown>?]> = [];
    const logger: Logger = (level, message, meta) => {
      logs.push([level, message, meta]);
    };
    const terminal: Handler = async () => dummyResult;
    const mw = createLoggingMiddleware();
    const handler = mw(terminal);
    await handler(dummyReq, {
      startedAt: 1000,
      modelId: 'openai/gpt-image-2',
      mode: 'gateway',
      attempt: 1,
      logger,
    });
    expect(logs.length).toBe(2);
    expect(logs[0]?.[0]).toBe('info');
    expect(logs[0]?.[1]).toMatch(/start/i);
    expect(logs[1]?.[0]).toBe('info');
    expect(logs[1]?.[1]).toMatch(/finish|done|complete/i);
    expect(logs[1]?.[2]?.modelId).toBe('openai/gpt-image-2');
  });

  test('emits error log when handler throws, then re-throws', async () => {
    const logs: Array<[string, string]> = [];
    const logger: Logger = (level, message) => {
      logs.push([level, message]);
    };
    const terminal: Handler = async () => {
      throw new Error('boom');
    };
    const mw = createLoggingMiddleware();
    const handler = mw(terminal);
    await expect(
      handler(dummyReq, {
        startedAt: 1000,
        modelId: 'openai/gpt-image-2',
        mode: 'gateway',
        attempt: 1,
        logger,
      }),
    ).rejects.toThrow('boom');
    expect(logs.find(([level]) => level === 'error')).toBeDefined();
  });

  test('no-ops when no logger is provided', async () => {
    const terminal: Handler = vi.fn(async () => dummyResult);
    const handler = createLoggingMiddleware()(terminal);
    await handler(dummyReq, {
      startedAt: 0,
      modelId: 'openai/gpt-image-2',
      mode: 'gateway',
      attempt: 1,
    });
    expect(terminal).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/middleware/logging.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/middleware/logging.ts`**

Path: `src/middleware/logging.ts`

```typescript
import type { Middleware } from './chain.js';

export function createLoggingMiddleware(): Middleware {
  return (next) => async (req, ctx) => {
    const log = ctx.logger;
    log?.('info', 'image-gen start', {
      modelId: ctx.modelId,
      mode: ctx.mode,
      operation: req.operation,
      n: req.n,
    });
    try {
      const result = await next(req, ctx);
      log?.('info', 'image-gen finish', {
        modelId: ctx.modelId,
        mode: ctx.mode,
        durationMs: result.timings.durationMs,
        imageCount: result.images.length,
      });
      return result;
    } catch (err) {
      log?.('error', 'image-gen error', {
        modelId: ctx.modelId,
        mode: ctx.mode,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/middleware/logging.test.ts`
Expected: PASS, 3 tests.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/middleware/logging.ts src/middleware/logging.test.ts
git commit -m "feat: logging middleware (info on start/finish, error on throw)"
```

---

## Task 11: Validation middleware

**Files:**
- Create: `src/middleware/validation-mw.ts`, `src/middleware/validation-mw.test.ts`

Wraps `validateGenerate` from Task 5 inside the chain. Operations other than `generate` are passed through (their own middleware lands in slices 4/5).

- [ ] **Step 1: Write failing test**

Path: `src/middleware/validation-mw.test.ts`

```typescript
import { describe, expect, test, vi } from 'vitest';
import { createValidationMiddleware } from './validation-mw.js';
import { ImageGenValidationError } from '../errors.js';
import type { Handler } from './chain.js';
import type { ResolvedRequest } from '../providers/adapter.js';
import type { ImageGenResult } from '../types.js';

const cap = {
  textToImage: true,
  imageEdit: true,
  multiReference: true,
  transparentBackground: true,
  maxN: 4,
  supportsSeed: true,
  supportsNegativePrompt: false,
  apiPath: 'generateImage' as const,
  sizes: ['1024x1024'] as const,
};

const dummyResult = {
  images: [],
  model: 'openai/gpt-image-2',
  mode: 'gateway',
  request: { operation: 'generate', n: 1, referenceCount: 0 },
  timings: { start: 0, finish: 0, durationMs: 0 },
} as unknown as ImageGenResult;

const ctx = {
  startedAt: 0,
  modelId: 'openai/gpt-image-2' as const,
  mode: 'gateway' as const,
  attempt: 1,
};

describe('validation middleware', () => {
  test('passes valid generate request to next handler', async () => {
    const next = vi.fn<Handler>(async () => dummyResult);
    const mw = createValidationMiddleware();
    const handler = mw(next);
    const req: ResolvedRequest = {
      operation: 'generate',
      modelId: 'openai/gpt-image-2',
      mode: 'gateway',
      apiPath: 'generateImage',
      capability: cap,
      prompt: 'a cat',
      n: 1,
    };
    await handler(req, ctx);
    expect(next).toHaveBeenCalledOnce();
  });

  test('throws when prompt is empty', async () => {
    const next = vi.fn<Handler>(async () => dummyResult);
    const mw = createValidationMiddleware();
    const handler = mw(next);
    const req: ResolvedRequest = {
      operation: 'generate',
      modelId: 'openai/gpt-image-2',
      mode: 'gateway',
      apiPath: 'generateImage',
      capability: cap,
      prompt: '',
      n: 1,
    };
    await expect(handler(req, ctx)).rejects.toBeInstanceOf(ImageGenValidationError);
    expect(next).not.toHaveBeenCalled();
  });

  test('throws when size violates capability', async () => {
    const next = vi.fn<Handler>(async () => dummyResult);
    const mw = createValidationMiddleware();
    const handler = mw(next);
    const req: ResolvedRequest = {
      operation: 'generate',
      modelId: 'openai/gpt-image-2',
      mode: 'gateway',
      apiPath: 'generateImage',
      capability: cap,
      prompt: 'a cat',
      size: '999x999',
      n: 1,
    };
    await expect(handler(req, ctx)).rejects.toBeInstanceOf(ImageGenValidationError);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/middleware/validation-mw.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/middleware/validation-mw.ts`**

Path: `src/middleware/validation-mw.ts`

```typescript
import { validateGenerate } from '../validation.js';
import type { Middleware } from './chain.js';

export function createValidationMiddleware(): Middleware {
  return (next) => async (req, ctx) => {
    if (req.operation === 'generate') {
      validateGenerate(
        {
          prompt: req.prompt ?? '',
          ...(req.size !== undefined && { size: req.size }),
          ...(req.n !== undefined && { n: req.n }),
        },
        req.capability,
        { modelId: ctx.modelId },
      );
    }
    // edit/variations validation lands in slice 4.
    return next(req, ctx);
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/middleware/validation-mw.test.ts`
Expected: PASS, 3 tests.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/middleware/validation-mw.ts src/middleware/validation-mw.test.ts
git commit -m "feat: validation middleware wrapping validateGenerate"
```

---

## Task 12: Config resolver

**Files:**
- Create: `src/config.ts`, `src/config.test.ts`

Slice-1 config resolver merges client options + env. File-based config (§9.3) and presets (§9.4) land in slice 7.

- [ ] **Step 1: Write failing test**

Path: `src/config.test.ts`

```typescript
import { describe, expect, test } from 'vitest';
import { resolveConfig } from './config.js';

describe('resolveConfig — slice 1', () => {
  test('returns defaults when nothing set', () => {
    const cfg = resolveConfig({}, {});
    expect(cfg.mode).toBe('auto');
    expect(cfg.timeoutMs).toBe(120_000);
    expect(cfg.gatewayApiKey).toBeUndefined();
  });

  test('reads AI_GATEWAY_API_KEY from env', () => {
    const cfg = resolveConfig({}, { AI_GATEWAY_API_KEY: 'env-key' });
    expect(cfg.gatewayApiKey).toBe('env-key');
  });

  test('options override env', () => {
    const cfg = resolveConfig(
      { gateway: { apiKey: 'opt-key' } },
      { AI_GATEWAY_API_KEY: 'env-key' },
    );
    expect(cfg.gatewayApiKey).toBe('opt-key');
  });

  test('captures defaultModel and logger', () => {
    const logger = (): void => undefined;
    const cfg = resolveConfig({ defaultModel: 'openai/gpt-image-2', logger }, {});
    expect(cfg.defaultModel).toBe('openai/gpt-image-2');
    expect(cfg.logger).toBe(logger);
  });

  test('captures gateway baseURL when provided', () => {
    const cfg = resolveConfig(
      { gateway: { baseURL: 'https://gateway.example/v1' } },
      {},
    );
    expect(cfg.gatewayBaseURL).toBe('https://gateway.example/v1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/config.ts`**

Path: `src/config.ts`

```typescript
import type { ClientOptions, Logger, Mode, ModelId } from './types.js';

export interface ResolvedConfig {
  readonly mode: Mode | 'auto';
  readonly defaultModel?: ModelId;
  readonly logger?: Logger;
  readonly timeoutMs: number;
  readonly gatewayApiKey?: string;
  readonly gatewayBaseURL?: string;
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
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/config.test.ts`
Expected: PASS, 5 tests.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: slice-1 config resolver (options + env)"
```

---

## Task 13: `generate` operation

**Files:**
- Create: `src/operations/generate.ts`, `src/operations/generate.test.ts`

The operation builds a `ResolvedRequest` from `(input, config, registry)`, then runs the middleware chain. It does not own AI SDK invocation — the terminal handler does.

This task touches AI SDK v6 imports indirectly (the terminal handler is built from `generateImage`). **Invoke `Skill:ai-sdk` first** if you haven't already.

- [ ] **Step 1: Write failing test**

Path: `src/operations/generate.test.ts`

```typescript
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { runGenerate } from './generate.js';
import { ImageGenConfigError, ImageGenValidationError } from '../errors.js';
import type { GenerateInput, ImageGenResult } from '../types.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../../tests/fixtures/pixel-1x1.png.base64.js';

vi.mock('ai', () => ({
  generateImage: vi.fn(),
}));

import { generateImage } from 'ai';

describe('runGenerate — slice 1', () => {
  beforeEach(() => {
    vi.mocked(generateImage).mockReset();
  });

  test('happy path: builds request, runs chain, returns ImageGenResult', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        {
          base64: PIXEL_1X1_BASE64,
          uint8Array: PIXEL_1X1_BYTES,
          mediaType: 'image/png',
        },
      ],
    } as never);

    const input: GenerateInput = { prompt: 'a cat' };
    const result: ImageGenResult = await runGenerate({
      input,
      config: {
        mode: 'auto',
        defaultModel: 'openai/gpt-image-2',
        timeoutMs: 120_000,
        gatewayApiKey: 'k',
      },
      env: { AI_GATEWAY_API_KEY: 'k' },
    });

    expect(result.model).toBe('openai/gpt-image-2');
    expect(result.mode).toBe('gateway');
    expect(result.request.operation).toBe('generate');
    expect(result.request.prompt).toBe('a cat');
    expect(result.images).toHaveLength(1);
    expect(generateImage).toHaveBeenCalledOnce();
  });

  test('config error when no model resolvable', async () => {
    await expect(
      runGenerate({
        input: { prompt: 'a cat' },
        config: { mode: 'auto', timeoutMs: 120_000, gatewayApiKey: 'k' },
        env: { AI_GATEWAY_API_KEY: 'k' },
      }),
    ).rejects.toBeInstanceOf(ImageGenConfigError);
  });

  test('config error when model not in registry', async () => {
    await expect(
      runGenerate({
        input: { prompt: 'a cat', model: 'nope/missing' },
        config: { mode: 'auto', timeoutMs: 120_000, gatewayApiKey: 'k' },
        env: { AI_GATEWAY_API_KEY: 'k' },
      }),
    ).rejects.toBeInstanceOf(ImageGenConfigError);
  });

  test('validation error bubbles up before AI SDK is called', async () => {
    await expect(
      runGenerate({
        input: { prompt: '', model: 'openai/gpt-image-2' },
        config: { mode: 'auto', timeoutMs: 120_000, gatewayApiKey: 'k' },
        env: { AI_GATEWAY_API_KEY: 'k' },
      }),
    ).rejects.toBeInstanceOf(ImageGenValidationError);
    expect(generateImage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/operations/generate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/operations/generate.ts`**

Path: `src/operations/generate.ts`

```typescript
import { generateImage } from 'ai';
import { ImageGenConfigError, ImageGenNetworkError, ImageGenProviderError } from '../errors.js';
import { composeChain } from '../middleware/chain.js';
import type { Context, Handler } from '../middleware/chain.js';
import { createLoggingMiddleware } from '../middleware/logging.js';
import { createValidationMiddleware } from '../middleware/validation-mw.js';
import { createDefaultAdapter } from '../providers/default.js';
import type { ResolvedRequest } from '../providers/adapter.js';
import { getModel } from '../registry.js';
import { resolveMode } from '../resolver.js';
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

  const entry = getModel(modelId);
  if (entry === undefined) {
    throw new ImageGenConfigError(
      `model '${modelId}' is not in the registry`,
      'CONFIG_UNKNOWN_MODEL',
      { modelId, hint: 'check the model id or register it via registerModel' },
    );
  }

  const mode = resolveMode({
    modelId,
    ...(args.input.mode !== undefined && { callOverride: args.input.mode }),
    clientMode: args.config.mode,
    env: args.env,
    ...(args.config.gatewayApiKey !== undefined && { gatewayApiKey: args.config.gatewayApiKey }),
  });

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

  const adapter = createDefaultAdapter();
  const terminal: Handler = async (resolvedReq) => {
    const start = Date.now();
    const call = adapter.buildCall(resolvedReq);
    if (call.fn !== 'generateImage') {
      throw new ImageGenProviderError(
        'generateText path lands in slice 2',
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
    [createLoggingMiddleware(), createValidationMiddleware()],
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

function mapAiSdkError(err: unknown, req: ResolvedRequest): Error {
  if (err instanceof Error) {
    const name = err.name;
    if (name === 'AbortError') {
      return err;
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
```

> Slice 3 replaces this minimal `mapAiSdkError` with a full mapper that distinguishes rate-limit, content-policy, auth, and model-unavailable.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/operations/generate.test.ts`
Expected: PASS, 4 tests.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/operations/generate.ts src/operations/generate.test.ts
git commit -m "feat: generate operation runs validation+chain+AI SDK"
```

---

## Task 14: Client class

**Files:**
- Create: `src/client.ts`, `src/client.test.ts`

The `Client` class is a thin facade. It captures resolved config + env at construction and exposes `generate` (slice 1). Other methods (`edit`, `variations`, `batch`, `listModels`, etc.) land later.

- [ ] **Step 1: Write failing test**

Path: `src/client.test.ts`

```typescript
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { Client } from './client.js';
import { ImageGenConfigError } from './errors.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../tests/fixtures/pixel-1x1.png.base64.js';

vi.mock('ai', () => ({ generateImage: vi.fn() }));

import { generateImage } from 'ai';

describe('Client — slice 1', () => {
  beforeEach(() => {
    vi.mocked(generateImage).mockReset();
  });

  test('generate returns normalized result with mocked AI SDK', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        { base64: PIXEL_1X1_BASE64, uint8Array: PIXEL_1X1_BYTES, mediaType: 'image/png' },
      ],
    } as never);

    const client = new Client(
      { defaultModel: 'openai/gpt-image-2' },
      { AI_GATEWAY_API_KEY: 'k' },
    );
    const result = await client.generate({ prompt: 'a cat' });
    expect(result.images).toHaveLength(1);
    expect(result.model).toBe('openai/gpt-image-2');
  });

  test('generate without defaultModel throws config error', async () => {
    const client = new Client({}, { AI_GATEWAY_API_KEY: 'k' });
    await expect(client.generate({ prompt: 'a cat' })).rejects.toBeInstanceOf(ImageGenConfigError);
  });

  test('generate without gateway key throws config error', async () => {
    const client = new Client({ defaultModel: 'openai/gpt-image-2' }, {});
    await expect(client.generate({ prompt: 'a cat' })).rejects.toBeInstanceOf(ImageGenConfigError);
  });

  test('logger is invoked when provided', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        { base64: PIXEL_1X1_BASE64, uint8Array: PIXEL_1X1_BYTES, mediaType: 'image/png' },
      ],
    } as never);
    const calls: string[] = [];
    const client = new Client(
      {
        defaultModel: 'openai/gpt-image-2',
        logger: (level, message) => calls.push(`${level}:${message}`),
      },
      { AI_GATEWAY_API_KEY: 'k' },
    );
    await client.generate({ prompt: 'a cat' });
    expect(calls.some((c) => c.startsWith('info:image-gen start'))).toBe(true);
    expect(calls.some((c) => c.startsWith('info:image-gen finish'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/client.ts`**

Path: `src/client.ts`

```typescript
import { resolveConfig } from './config.js';
import type { ResolvedConfig } from './config.js';
import { runGenerate } from './operations/generate.js';
import type { ClientOptions, GenerateInput, ImageGenResult } from './types.js';

export class Client {
  readonly #config: ResolvedConfig;
  readonly #env: Readonly<Record<string, string | undefined>>;

  constructor(
    options: ClientOptions = {},
    env: Readonly<Record<string, string | undefined>> = process.env,
  ) {
    this.#config = resolveConfig(options, env);
    this.#env = env;
  }

  generate(input: GenerateInput): Promise<ImageGenResult> {
    return runGenerate({ input, config: this.#config, env: this.#env });
  }
}

export function createClient(
  options: ClientOptions = {},
  env: Readonly<Record<string, string | undefined>> = process.env,
): Client {
  return new Client(options, env);
}
```

- [ ] **Step 4: Re-export from `src/index.ts`**

Path: `src/index.ts` (append)

```typescript
export { Client, createClient } from './client.js';
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/client.test.ts`
Expected: PASS, 4 tests.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/client.ts src/client.test.ts src/index.ts
git commit -m "feat: Client class + createClient entry point"
```

---

## Task 15: Utility helpers (`utils/` subpath)

**Files:**
- Create: `src/utils/to-buffer.ts`, `src/utils/to-buffer.test.ts`, `src/utils/save-to-file.ts`, `src/utils/save-to-file.test.ts`, `src/utils/index.ts`

Slice 1 ships two helpers: `toBuffer` (pure) and `saveToFile` (Node-only disk write — the one I/O concession in §5). Both exported from the `image-gen-client/utils` subpath.

- [ ] **Step 1: Write failing test for `toBuffer`**

Path: `src/utils/to-buffer.test.ts`

```typescript
import { describe, expect, test } from 'vitest';
import { toBuffer } from './to-buffer.js';
import type { GeneratedImage } from '../types.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../../tests/fixtures/pixel-1x1.png.base64.js';

describe('toBuffer', () => {
  test('returns a Node Buffer with the same bytes as uint8Array', () => {
    const img: GeneratedImage = {
      base64: PIXEL_1X1_BASE64,
      uint8Array: PIXEL_1X1_BYTES,
      mediaType: 'image/png',
    };
    const buf = toBuffer(img);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.equals(Buffer.from(PIXEL_1X1_BYTES))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/utils/to-buffer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/utils/to-buffer.ts`**

Path: `src/utils/to-buffer.ts`

```typescript
import type { GeneratedImage } from '../types.js';

export function toBuffer(image: GeneratedImage): Buffer {
  return Buffer.from(image.uint8Array);
}
```

- [ ] **Step 4: Write failing test for `saveToFile`**

Path: `src/utils/save-to-file.test.ts`

```typescript
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
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm vitest run src/utils/save-to-file.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement `src/utils/save-to-file.ts`**

Path: `src/utils/save-to-file.ts`

```typescript
import { writeFile } from 'node:fs/promises';
import type { GeneratedImage } from '../types.js';

export async function saveToFile(image: GeneratedImage, path: string): Promise<void> {
  await writeFile(path, image.uint8Array);
}
```

- [ ] **Step 7: Wire `src/utils/index.ts`**

Path: `src/utils/index.ts`

```typescript
export { toBuffer } from './to-buffer.js';
export { saveToFile } from './save-to-file.js';
```

- [ ] **Step 8: Run tests**

Run: `pnpm vitest run src/utils/`
Expected: PASS, 2 tests.

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/utils/to-buffer.ts src/utils/to-buffer.test.ts src/utils/save-to-file.ts src/utils/save-to-file.test.ts src/utils/index.ts
git commit -m "feat: utils subpath with toBuffer and saveToFile"
```

---

## Task 16: End-to-end integration test

**Files:**
- Create: `src/integration/generate.integration.test.ts`

Single integration test exercises the full slice: `createClient` → `generate` → `saveToFile`. Uses `vi.mock('ai', ...)` so no live network. Asserts every field of `ImageGenResult` per spec §3.5.

- [ ] **Step 1: Write the integration test**

Path: `src/integration/generate.integration.test.ts`

```typescript
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '../index.js';
import { saveToFile, toBuffer } from '../utils/index.js';
import { PIXEL_1X1_BASE64, PIXEL_1X1_BYTES } from '../../tests/fixtures/pixel-1x1.png.base64.js';

vi.mock('ai', () => ({
  generateImage: vi.fn(),
}));

import { generateImage } from 'ai';

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  vi.mocked(generateImage).mockReset();
});

describe('integration: createClient → generate → saveToFile', () => {
  test('full slice-1 flow with AI SDK mocked', async () => {
    vi.mocked(generateImage).mockResolvedValue({
      images: [
        {
          base64: PIXEL_1X1_BASE64,
          uint8Array: PIXEL_1X1_BYTES,
          mediaType: 'image/png',
          width: 1,
          height: 1,
          seed: 42,
        },
      ],
      providerMetadata: { foo: 'bar' },
    } as never);

    const logs: string[] = [];
    const client = createClient(
      {
        defaultModel: 'openai/gpt-image-2',
        logger: (level, message) => logs.push(`${level}:${message}`),
      },
      { AI_GATEWAY_API_KEY: 'k' },
    );

    const result = await client.generate({ prompt: 'a cat in a hat' });

    // §3.5 result shape
    expect(result.images).toHaveLength(1);
    const img = result.images[0];
    expect(img).toBeDefined();
    expect(img?.base64).toBe(PIXEL_1X1_BASE64);
    expect(img?.uint8Array).toBeInstanceOf(Uint8Array);
    expect(img?.mediaType).toBe('image/png');
    expect(img?.width).toBe(1);
    expect(img?.height).toBe(1);
    expect(img?.seed).toBe(42);

    expect(result.model).toBe('openai/gpt-image-2');
    expect(result.mode).toBe('gateway');
    expect(result.request.operation).toBe('generate');
    expect(result.request.prompt).toBe('a cat in a hat');
    expect(result.request.n).toBe(1);
    expect(result.request.referenceCount).toBe(0);
    expect(result.providerMetadata).toEqual({ foo: 'bar' });
    expect(result.timings.start).toBeGreaterThan(0);
    expect(result.timings.finish).toBeGreaterThanOrEqual(result.timings.start);
    expect(result.timings.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.mask).toBeUndefined();

    // logging middleware fired
    expect(logs.some((l) => l.startsWith('info:image-gen start'))).toBe(true);
    expect(logs.some((l) => l.startsWith('info:image-gen finish'))).toBe(true);

    // utils helpers integrate
    const buf = toBuffer(img!);
    expect(buf.equals(Buffer.from(PIXEL_1X1_BYTES))).toBe(true);

    const dir = mkdtempSync(join(tmpdir(), 'image-gen-int-'));
    tmpDirs.push(dir);
    const filePath = join(dir, 'cat.png');
    await saveToFile(img!, filePath);
    expect(readFileSync(filePath).equals(Buffer.from(PIXEL_1X1_BYTES))).toBe(true);

    // AI SDK was called once with the gateway-style model id
    expect(generateImage).toHaveBeenCalledOnce();
    expect(vi.mocked(generateImage).mock.calls[0]?.[0]).toMatchObject({
      model: 'openai/gpt-image-2',
      prompt: 'a cat in a hat',
      n: 1,
    });
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm vitest run src/integration/generate.integration.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass (≈ 35–40 tests across the 16 tasks).

Run: `pnpm test:coverage`
Expected: lines/statements/functions coverage ≥ 80%, branches ≥ 75%.

If coverage is below threshold, identify the uncovered modules and add tests before continuing. Do not lower the thresholds.

- [ ] **Step 4: Run typecheck and build**

Run: `pnpm typecheck`
Expected: exits 0.

Run: `pnpm build`
Expected: `dist/index.js`, `dist/index.d.ts`, `dist/utils/index.js`, `dist/utils/index.d.ts` all generated.

- [ ] **Step 5: Commit**

```bash
git add src/integration/generate.integration.test.ts
git commit -m "test: end-to-end integration covering full slice-1 flow"
```

---

## Slice 1 — Definition of Done

When every task above is complete and committed, verify the slice meets its acceptance criteria:

- [ ] `pnpm test` green; coverage ≥ 80% lines/statements/functions, ≥ 75% branches.
- [ ] `pnpm typecheck` exits 0 with `--strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes`.
- [ ] `pnpm build` produces `dist/` with `.js` + `.d.ts` for both root and `utils` subpath.
- [ ] `pnpm lint` reports 0 errors.
- [ ] No `any`, no `as` without preceding runtime check, no `!` non-null assertions in `src/`.
- [ ] One integration test simulates `createClient({ defaultModel: 'openai/gpt-image-2' })` → `generate({ prompt })` → bytes returned, with AI SDK mocked at the import boundary.
- [ ] §15.6 commitments shipped: `Capability.transforms?` field, `TransformKind` exported, `request.operation` discriminator, optional `result.mask`. Confirmed by `src/types.test-d.ts`.

If anything fails, fix before claiming the slice is done.

---

## What's Next

Slice 1 is foundational. Slice 2 (multi-provider + direct mode) builds on the same surface — no breaking changes anticipated. Subsequent slices each get their own plan in `docs/superpowers/plans/`.
