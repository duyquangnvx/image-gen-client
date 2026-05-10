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
