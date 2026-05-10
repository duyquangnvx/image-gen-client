import { describe, expect, test } from 'vitest';
import { getModel, listRegisteredModelIds, BUILT_IN_MODELS, mergeModels } from './registry.js';
import { defineModel } from './define-model.js';

describe('registry — slice 1', () => {
  test('contains openai/gpt-image-2 with correct capability', () => {
    const entry = getModel('openai/gpt-image-2');
    expect(entry).toBeDefined();
    expect(entry?.id).toBe('openai/gpt-image-2');
    expect(entry?.provider).toBe('openai');
    expect(entry?.capability.apiPath).toBe('generateImage');
    expect(entry?.capability.textToImage).toBe(true);
    expect(entry?.capability.imageEdit).toBe(true);
    expect(entry?.capability.multiReference).toBe(true);
    expect(entry?.capability.transparentBackground).toBe(true);
    expect(entry?.capability.maxN).toBe(4);
    expect(entry?.capability.supportsSeed).toBe(true);
  });

  test('returns undefined for unknown model', () => {
    expect(getModel('nope/missing')).toBeUndefined();
  });

  test('listRegisteredModelIds returns the seeded set', () => {
    const ids = listRegisteredModelIds();
    expect(ids).toContain('openai/gpt-image-2');
    expect(ids.length).toBeGreaterThanOrEqual(1);
  });

  test('built-in entry is frozen — capability is readonly at runtime', () => {
    const entry = BUILT_IN_MODELS['openai/gpt-image-2'];
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry?.capability)).toBe(true);
  });

  test('capability sizes array is frozen at runtime', () => {
    const entry = BUILT_IN_MODELS['openai/gpt-image-2'];
    expect(entry).toBeDefined();
    expect(Object.isFrozen(entry?.capability.sizes)).toBe(true);
  });
});

describe('google/imagen-4.0-generate-001 built-in entry', () => {
  test('exists in BUILT_IN_MODELS with apiPath=generateImage', () => {
    const m = BUILT_IN_MODELS['google/imagen-4.0-generate-001'];
    expect(m).toBeDefined();
    expect(m?.provider).toBe('google');
    expect(m?.capability.apiPath).toBe('generateImage');
    expect(m?.capability.textToImage).toBe(true);
  });
});

describe('mergeModels', () => {
  const cxModel = defineModel('cx/test-image', 'cx', {
    textToImage: true,
    imageEdit: false,
    multiReference: false,
    transparentBackground: false,
    maxN: 1,
    supportsSeed: false,
    supportsNegativePrompt: false,
    apiPath: 'generateImage',
  });

  test('returns built-ins when user record is empty', () => {
    const merged = mergeModels(BUILT_IN_MODELS, {});
    expect(merged['openai/gpt-image-2']).toBeDefined();
    expect(merged['google/imagen-4.0-generate-001']).toBeDefined();
  });

  test('adds user models alongside built-ins', () => {
    const merged = mergeModels(BUILT_IN_MODELS, { 'cx/test-image': cxModel });
    expect(merged['cx/test-image']).toBe(cxModel);
    expect(merged['openai/gpt-image-2']).toBeDefined();
  });

  test('user override wins on the same id', () => {
    const overridden = defineModel('openai/gpt-image-2', 'openai', {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      transparentBackground: false,
      maxN: 99,
      supportsSeed: false,
      supportsNegativePrompt: false,
      apiPath: 'generateImage',
    });
    const merged = mergeModels(BUILT_IN_MODELS, { 'openai/gpt-image-2': overridden });
    expect(merged['openai/gpt-image-2']?.capability.maxN).toBe(99);
  });

  test('returned record is frozen', () => {
    const merged = mergeModels(BUILT_IN_MODELS, {});
    expect(Object.isFrozen(merged)).toBe(true);
  });
});
