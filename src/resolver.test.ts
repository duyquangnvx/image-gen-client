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
