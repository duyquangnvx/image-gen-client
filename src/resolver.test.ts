import { describe, expect, test } from 'vitest';
import { resolveMode, resolveProvider } from './resolver.js';
import type { ResolvedProvider } from './resolver.js';
import { ImageGenConfigError } from './errors.js';

describe('resolveMode', () => {
  test('per-call gateway override returns gateway', () => {
    expect(
      resolveMode({ modelId: 'openai/gpt-image-2', callOverride: 'gateway', env: {} }),
    ).toBe('gateway');
  });

  test('per-call direct override returns direct', () => {
    expect(
      resolveMode({ modelId: 'openai/gpt-image-2', callOverride: 'direct', env: {} }),
    ).toBe('direct');
  });

  test('explicit clientMode=gateway returns gateway', () => {
    expect(
      resolveMode({ modelId: 'openai/gpt-image-2', clientMode: 'gateway', env: {} }),
    ).toBe('gateway');
  });

  test('explicit clientMode=direct returns direct', () => {
    expect(
      resolveMode({ modelId: 'openai/gpt-image-2', clientMode: 'direct', env: {} }),
    ).toBe('direct');
  });

  test('auto + AI_GATEWAY_API_KEY => gateway', () => {
    expect(
      resolveMode({
        modelId: 'openai/gpt-image-2',
        clientMode: 'auto',
        env: { AI_GATEWAY_API_KEY: 'k' },
      }),
    ).toBe('gateway');
  });

  test('auto + gatewayApiKey from config => gateway', () => {
    expect(
      resolveMode({
        modelId: 'openai/gpt-image-2',
        clientMode: 'auto',
        env: {},
        gatewayApiKey: 'k',
      }),
    ).toBe('gateway');
  });

  test('auto + no gateway key => direct', () => {
    expect(
      resolveMode({ modelId: 'openai/gpt-image-2', clientMode: 'auto', env: {} }),
    ).toBe('direct');
  });
});

describe('resolveProvider', () => {
  test('gateway mode returns ResolvedProvider gateway variant', () => {
    const res = resolveProvider({
      modelId: 'openai/gpt-image-2',
      mode: 'gateway',
      providers: {},
      env: { AI_GATEWAY_API_KEY: 'k' },
    });
    expect(res.mode).toBe('gateway');
    expect(res.providerKey).toBe('openai');
  });

  test('direct + native provider with apiKey in providers config', () => {
    const res = resolveProvider({
      modelId: 'openai/gpt-image-2',
      mode: 'direct',
      providers: { openai: { apiKey: 'sk-x' } },
      env: {},
    });
    expect(res.mode).toBe('direct');
    if (res.mode !== 'direct' || res.kind !== 'native') throw new Error('unexpected variant');
    expect(res.apiKey).toBe('sk-x');
    expect(res.providerKey).toBe('openai');
  });

  test('direct + native + apiKey from env when providers config absent', () => {
    const res = resolveProvider({
      modelId: 'openai/gpt-image-2',
      mode: 'direct',
      providers: {},
      env: { OPENAI_API_KEY: 'sk-env' },
    });
    if (res.mode !== 'direct' || res.kind !== 'native') throw new Error('unexpected variant');
    expect(res.apiKey).toBe('sk-env');
  });

  test('direct + google reads GOOGLE_GENERATIVE_AI_API_KEY env', () => {
    const res = resolveProvider({
      modelId: 'google/imagen-4',
      mode: 'direct',
      providers: {},
      env: { GOOGLE_GENERATIVE_AI_API_KEY: 'sk-g' },
    });
    if (res.mode !== 'direct' || res.kind !== 'native') throw new Error('unexpected variant');
    expect(res.apiKey).toBe('sk-g');
  });

  test('direct + openai-compatible returns variant with baseURL and name', () => {
    const res = resolveProvider({
      modelId: 'cx/gpt-5.4-image',
      mode: 'direct',
      providers: {
        cx: { kind: 'openai-compatible', baseURL: 'http://localhost:20128/v1', apiKey: 'k', name: 'cx' },
      },
      env: {},
    });
    if (res.mode !== 'direct' || res.kind !== 'openai-compatible') throw new Error('unexpected variant');
    expect(res.baseURL).toBe('http://localhost:20128/v1');
    expect(res.apiKey).toBe('k');
    expect(res.name).toBe('cx');
    expect(res.providerKey).toBe('cx');
  });

  test('direct + openai-compatible defaults name to providerKey when name not set', () => {
    const res = resolveProvider({
      modelId: 'cx/gpt-5.4-image',
      mode: 'direct',
      providers: { cx: { kind: 'openai-compatible', baseURL: 'http://x/v1' } },
      env: {},
    });
    if (res.mode !== 'direct' || res.kind !== 'openai-compatible') throw new Error('unexpected variant');
    expect(res.name).toBe('cx');
    expect(res.apiKey).toBe('');
  });

  test('direct + openai-compatible without baseURL throws CONFIG_NO_PROVIDER', () => {
    expect(() =>
      resolveProvider({
        modelId: 'cx/gpt-5.4-image',
        mode: 'direct',
        providers: { cx: { kind: 'openai-compatible', baseURL: '' } },
        env: {},
      }),
    ).toThrow(ImageGenConfigError);
  });

  test('direct mode + no key anywhere throws CONFIG_NO_PROVIDER', () => {
    expect(() =>
      resolveProvider({
        modelId: 'openai/gpt-image-2',
        mode: 'direct',
        providers: {},
        env: {},
      }),
    ).toThrow(ImageGenConfigError);
  });

  test('ResolvedProvider type matches union', () => {
    const x: ResolvedProvider = { providerKey: 'openai', mode: 'gateway' };
    expect(x.mode).toBe('gateway');
  });
});
