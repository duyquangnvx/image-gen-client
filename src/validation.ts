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
      { ...(ctx.modelId !== undefined && { modelId: ctx.modelId }), hint: 'pass a non-empty prompt' },
    );
  }

  const n = input.n ?? 1;
  if (n > capability.maxN) {
    throw new ImageGenValidationError(
      `'n' = ${n} exceeds maxN = ${capability.maxN}` +
        (ctx.modelId ? ` for '${ctx.modelId}'` : ''),
      'VALIDATION_MAX_N',
      {
        ...(ctx.modelId !== undefined && { modelId: ctx.modelId }),
        hint: `lower n to ≤ ${capability.maxN}`,
      },
    );
  }

  if (input.size !== undefined && capability.sizes !== undefined) {
    if (!capability.sizes.includes(input.size)) {
      throw new ImageGenValidationError(
        `'size' = '${input.size}' not supported` +
          (ctx.modelId ? ` by '${ctx.modelId}'` : '') +
          `. Allowed: ${capability.sizes.join(', ')}.`,
        'VALIDATION_SIZE',
        {
          ...(ctx.modelId !== undefined && { modelId: ctx.modelId }),
          hint: `pick a size from: ${capability.sizes.join(', ')}`,
        },
      );
    }
  }
}
