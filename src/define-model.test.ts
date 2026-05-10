import { describe, expect, test } from 'vitest';
import { defineModel } from './define-model.js';
import { ImageGenConfigError } from './errors.js';

describe('defineModel', () => {
  test('returns a frozen RegisteredModel', () => {
    const model = defineModel('foo/bar', 'foo', {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      transparentBackground: false,
      maxN: 1,
      supportsSeed: false,
      supportsNegativePrompt: false,
      apiPath: 'generateImage',
      sizes: ['1024x1024'],
    });

    expect(model.id).toBe('foo/bar');
    expect(model.provider).toBe('foo');
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.capability)).toBe(true);
    expect(Object.isFrozen(model.capability.sizes)).toBe(true);
  });

  test('throws ImageGenConfigError when id prefix does not match providerKey', () => {
    expect(() =>
      defineModel('foo/bar', 'baz', {
        textToImage: true,
        imageEdit: false,
        multiReference: false,
        transparentBackground: false,
        maxN: 1,
        supportsSeed: false,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      }),
    ).toThrow(ImageGenConfigError);
  });

  test('throws when id has no slash', () => {
    expect(() =>
      defineModel('badid' as `${string}/${string}`, 'foo', {
        textToImage: true,
        imageEdit: false,
        multiReference: false,
        transparentBackground: false,
        maxN: 1,
        supportsSeed: false,
        supportsNegativePrompt: false,
        apiPath: 'generateImage',
      }),
    ).toThrow(/must be 'provider\/model'/);
  });

  test('mutating the returned capability throws (deep frozen)', () => {
    const model = defineModel('foo/bar', 'foo', {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      transparentBackground: false,
      maxN: 1,
      supportsSeed: false,
      supportsNegativePrompt: false,
      apiPath: 'generateImage',
      sizes: ['1024x1024'],
    });

    expect(() => {
      (model.capability.sizes as string[]).push('512x512');
    }).toThrow(TypeError);
  });
});
