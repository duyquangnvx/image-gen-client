import { describe, expect, test } from 'vitest';
import { getModel, listRegisteredModelIds, BUILT_IN_MODELS } from './registry.js';

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
});
