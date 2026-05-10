import { describe, expect, test } from 'vitest';
import { resolveConfig } from './config.js';
import { defineModel } from './define-model.js';

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
    expect(cfg.registry['google/imagen-4.0-generate-001']).toBeDefined();
    expect(cfg.registry['cx/test-image']).toBe(cx);
  });
});
