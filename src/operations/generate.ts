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
