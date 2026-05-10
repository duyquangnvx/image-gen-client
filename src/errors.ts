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

function toInit(
  message: string,
  code: string,
  category: ErrorCategory,
  retryable: boolean,
  init: SubtypeInit,
): ImageGenErrorInit {
  const base = { message, code, category, retryable };
  return {
    ...base,
    ...(init.modelId !== undefined && { modelId: init.modelId }),
    ...(init.mode !== undefined && { mode: init.mode }),
    ...(init.cause !== undefined && { cause: init.cause }),
    ...(init.hint !== undefined && { hint: init.hint }),
    ...(init.providerError !== undefined && { providerError: init.providerError }),
  };
}

export class ImageGenConfigError extends ImageGenError {
  constructor(message: string, code: string, init: SubtypeInit = {}) {
    super(toInit(message, code, 'config', false, init));
    this.name = 'ImageGenConfigError';
  }
}

export class ImageGenValidationError extends ImageGenError {
  constructor(message: string, code: string, init: SubtypeInit = {}) {
    super(toInit(message, code, 'validation', false, init));
    this.name = 'ImageGenValidationError';
  }
}

export class ImageGenProviderError extends ImageGenError {
  constructor(message: string, code: string, init: SubtypeInit = {}) {
    super(toInit(message, code, 'provider', init.retryable ?? false, init));
    this.name = 'ImageGenProviderError';
  }
}

export class ImageGenNetworkError extends ImageGenError {
  constructor(message: string, code: string, init: SubtypeInit = {}) {
    super(toInit(message, code, 'network', init.retryable ?? true, init));
    this.name = 'ImageGenNetworkError';
  }
}
