import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClient, defineModel } from '../../src/index.js';
import { probeCxLocal } from './_probe.js';

let reachable = false;

beforeAll(async () => {
  const probe = await probeCxLocal(1_000);
  reachable = probe.reachable;
  if (!reachable) {
    // eslint-disable-next-line no-console
    console.warn(`[e2e] cx unreachable, skipping: ${probe.reason ?? 'unknown'}`);
  }
});

afterAll(() => {
  if (!reachable) {
    // eslint-disable-next-line no-console
    console.warn('[e2e] cx-local suite was skipped — start your local cx provider on http://localhost:20128 to enable');
  }
});

describe('cx-local E2E', () => {
  test('register cx/gpt-5.4-image and generate one image', async () => {
    if (!reachable) return; // soft skip
    const cx = defineModel('cx/gpt-5.4-image', 'cx', {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      transparentBackground: false,
      maxN: 1,
      supportsSeed: false,
      supportsNegativePrompt: false,
      apiPath: 'generateImage',
    });

    const client = createClient(
      {
        mode: 'direct',
        providers: {
          cx: {
            kind: 'openai-compatible',
            baseURL: 'http://localhost:20128/v1',
            apiKey: 'unused',
            name: 'cx',
          },
        },
        models: { 'cx/gpt-5.4-image': cx },
        defaultModel: 'cx/gpt-5.4-image',
      },
      {},
    );

    const result = await client.generate({ prompt: 'a red apple on a white table' });

    expect(result.model).toBe('cx/gpt-5.4-image');
    expect(result.mode).toBe('direct');
    expect(result.images.length).toBeGreaterThan(0);
    const img = result.images[0];
    expect(img).toBeDefined();
    expect(img?.uint8Array.length).toBeGreaterThan(0);
    expect(img?.mediaType).toMatch(/^image\//);
    expect(img?.base64.length).toBeGreaterThan(0);
  }, 30_000);

  test('unknown model id throws ImageGenConfigError before any network call', async () => {
    if (!reachable) return; // soft skip — local probe must be reachable so the rest of the suite is meaningful
    const client = createClient(
      {
        mode: 'direct',
        providers: { cx: { kind: 'openai-compatible', baseURL: 'http://localhost:20128/v1' } },
        defaultModel: 'cx/does-not-exist' as `${string}/${string}`,
      },
      {},
    );
    await expect(client.generate({ prompt: 'a cat' })).rejects.toMatchObject({
      code: 'CONFIG_UNKNOWN_MODEL',
    });
  });
});
