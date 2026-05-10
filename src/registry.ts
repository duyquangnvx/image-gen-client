import { freezeCapability } from './capabilities.js';
import type { Capability, ModelId } from './types.js';

export interface RegisteredModel {
  readonly id: ModelId;
  readonly provider: string;
  readonly capability: Capability;
}

function defineModel(id: ModelId, provider: string, capability: Capability): RegisteredModel {
  return Object.freeze({
    id,
    provider,
    capability: freezeCapability(capability),
  });
}

// §7.1 v1 registry — slice 1 ships only openai/gpt-image-2.
// Other 11 models are added in slice 2.
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
});

export function getModel(id: string): RegisteredModel | undefined {
  return BUILT_IN_MODELS[id as ModelId];
}

export function listRegisteredModelIds(): readonly ModelId[] {
  return Object.keys(BUILT_IN_MODELS) as ModelId[];
}
