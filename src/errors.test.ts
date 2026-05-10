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
