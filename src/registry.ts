import { defineModel } from './define-model.js';
import type { ModelId, RegisteredModel } from './types.js';

export type { RegisteredModel } from './types.js';
export { defineModel } from './define-model.js';

// §7.1 — slice 1 shipped openai/gpt-image-2; slice 2 adds google/imagen-4.0-generate-001.
// Other models land in slice 3.
export const BUILT_IN_MODELS: Readonly<Record<ModelId, RegisteredModel>> = Object.freeze({
  'openai/gpt-image-2': defineModel('openai/gpt-image-2', 'openai', {
    textToImage: true,
    imageEdit: true,
    multiReference: true,
    transparentBackground: true,
    maxN: 4,
    supportsSeed: true,
    supportsNegativePrompt: false,
    apiPath: 'generateImage',
    sizes: ['1024x1024', '1536x1024', '1024x1536', '2048x2048', '4096x4096'],
  }),
  'google/imagen-4.0-generate-001': defineModel('google/imagen-4.0-generate-001', 'google', {
    textToImage: true,
    imageEdit: false,
    multiReference: false,
    transparentBackground: false,
    maxN: 4,
    supportsSeed: true,
    supportsNegativePrompt: false,
    apiPath: 'generateImage',
    aspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9'],
  }),
});

export function getModel(id: string): RegisteredModel | undefined {
  return BUILT_IN_MODELS[id as ModelId];
}

export function listRegisteredModelIds(): readonly ModelId[] {
  return Object.keys(BUILT_IN_MODELS) as ModelId[];
}

export function mergeModels(
  builtIn: Readonly<Record<ModelId, RegisteredModel>>,
  userModels: Readonly<Record<ModelId, RegisteredModel>>,
): Readonly<Record<ModelId, RegisteredModel>> {
  return Object.freeze({ ...builtIn, ...userModels });
}
