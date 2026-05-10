# image-gen-client

TypeScript library that wraps Vercel AI SDK to provide a unified, DX-focused image generation client across providers (OpenAI, Google, BFL, Fal, Replicate, Together, …) and across two connection modes (Vercel AI Gateway + direct provider keys).

## Goal

A team-grade image-generation client that:

- Exposes **one** API for every provider and every model — including the latest (`openai/gpt-image-2`, `google/gemini-3-pro-image`, `bfl/flux-2-flex`, etc.).
- Hides AI SDK's two-path quirk (image-only models go through `generateImage`; multimodal-emit-image models like Nano Banana go through `generateText`). Callers always see a single normalized result shape.
- Validates inputs against per-model capabilities (size, aspect ratio, multi-reference, transparent background, max n) **before** the network call.
- Returns raw image bytes to the caller. Storage, upload, post-processing — all consumer concerns.
- Stays a pure library. The CLI and the future HTTP API are thin wrappers; nothing they can do is unavailable from code.

Success looks like: a developer on the team writes `await client.generate({ prompt })` and never has to think about which AI SDK function to call, which provider package to import, what shape the response has, or whether the model supports their requested aspect ratio. They get back `Uint8Array` + base64 + media type, in the same shape every time.

## Why this exists

The team needs flexible, multi-model image generation. Surveyed alternatives:

- **`PederHP/image-gen-cli`** — closest match, but .NET. Wrong stack for embedding as a lib in our TS codebase.
- **`universal-image-mcp` / ImageGen MCP** — MCP servers, not standalone libs.
- **`gemini-imagen`** — Python, single-provider.
- **Vercel "AI SDK Image Generator" template** — Next.js web app, not a lib.

Vercel AI SDK provides the foundation but still leaks provider quirks (split functions, inconsistent result shapes, scattered capability metadata, no central registry, no input validation). This lib closes that gap with a thin layer.

## Architecture (one paragraph)

Three layers. (1) **`image-gen-client`** — core lib (this repo): Client facade, Model Registry, Middleware chain, Provider Resolver, Result normalizer. (2) **`image-gen-cli`** — thin CLI wrapper, ships separately. (3) **`image-gen-server`** — thin HTTP wrapper, deferred. Core requires only `ai` and `@ai-sdk/gateway`; provider packages (`@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/fal`, …) are optional peer dependencies, dynamically imported when the user actually selects that provider in direct mode.

## Non-negotiables

- **Lib-first.** Every CLI/API feature must be expressible via the lib's TypeScript surface. No wrapper-only code paths.
- **No I/O side effects by default.** `generate` / `edit` never write to disk, never upload. The single concession: when a provider returns an image URL, the lib downloads the bytes before returning, so callers don't deal with expiring URLs.
- **One result shape, every provider.** Provider-specific extras live in `providerMetadata`. The main shape never bends to a provider.
- **One canonical model ID format.** `'provider/model-id'` (gateway-style) for both modes. The resolver translates to `openai.image(...)` etc. internally.
- **Validate before network.** Capability mismatches throw `ImageGenValidationError` before any provider call. Pre-flight is cheap; failed network calls are not.
- **Lazy provider loading.** Only `ai` + `@ai-sdk/gateway` at runtime. Other providers loaded via dynamic `import()` when first used. Missing peer → typed error with install hint.
- **Capabilities are data.** New model = new entry in the registry. Not a switch statement, not a special case in core code.

## Out of scope for v1

The following are **not** in core. They are middleware / plugin / future-work territory:

- Storage / cloud upload (S3, R2, GCS, etc.)
- Auth, multi-tenancy, RBAC, API-key issuance
- Cost tracking, quotas, billing
- Streaming generation (blocked on AI SDK upstream)
- Image post-processing (resize, crop, watermark, format conversion beyond what providers natively offer)
- Built-in UI / playground

If a feature request lands in one of these areas, the answer is "not v1" or "make it a middleware / plugin". Don't add core code for them.

## Working principles when contributing

1. **`image-gen-client.spec.md` is the source of truth.** This file (CLAUDE.md) is the orientation; the spec is the contract.
2. **Spec and code change together.** Any PR touching public API updates `image-gen-client.spec.md` in the same change. Spec drift is a defect.
3. **Prefer middleware over core changes.** Cache, telemetry, cost tracking, prompt rewriting, brand-voice prefixing — all middleware. The core stays small.
4. **Errors carry `code` and `retryable`.** Never branch retry logic on error message strings. See spec §8.
5. **Don't re-implement what AI SDK does.** If you find yourself hand-parsing a provider response, check whether AI SDK already normalized it.
6. **Keep dependencies minimal.** New runtime deps need justification in the PR description. Provider SDKs are peers, not deps.
7. **Default to "no" on scope expansion.** When unsure, propose as future work in spec §14 instead of growing the surface.

## For an AI assistant working in this repo

- Read `image-gen-client.spec.md` before suggesting public-API changes. The shape there is intentional, not draft.
- The model registry lives in `src/registry.ts` and is mirrored in spec §7.1. Adding a model means: registry entry + spec table row + capability test.
- Errors must extend `ImageGenError` and follow the hierarchy in spec §8.1. Don't create new error categories without updating the spec.
- Tests are colocated (`src/foo.ts` ↔ `src/foo.test.ts`). Every public method has at least one integration test with a mocked provider.
- When proposing a feature that smells like storage, auth, billing, or streaming — stop and check the "Out of scope for v1" section. Propose as middleware or future work.
- Cite spec sections as `§N` in code comments and PR descriptions when the rationale lives there.

## Build / test / dev commands

TBD — to be filled in once tooling is set up. Likely: `pnpm build`, `pnpm test`, `pnpm test:e2e` (gated on env keys), `pnpm typecheck`, `pnpm lint`.

## Status

Pre-implementation. Spec at v0.1. CLAUDE.md and spec are committed; source code is being scaffolded.