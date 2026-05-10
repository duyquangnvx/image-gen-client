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
