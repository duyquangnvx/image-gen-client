import { freezeCapability } from './capabilities.js';
import { ImageGenConfigError } from './errors.js';
import type { Capability, ModelId, RegisteredModel } from './types.js';

export function defineModel(
  id: ModelId,
  providerKey: string,
  capability: Capability,
): RegisteredModel {
  const slash = id.indexOf('/');
  if (slash <= 0 || slash === id.length - 1) {
    throw new ImageGenConfigError(
      `model id '${id}' must be 'provider/model' (got no '/' or empty side)`,
      'CONFIG_BAD_MODEL_ID',
      { hint: "use 'providerKey/modelName' format" },
    );
  }
  const prefix = id.slice(0, slash);
  if (prefix !== providerKey) {
    throw new ImageGenConfigError(
      `model id '${id}' prefix '${prefix}' does not match providerKey '${providerKey}'`,
      'CONFIG_MODEL_ID_MISMATCH',
      { hint: `change id to '${providerKey}/${id.slice(slash + 1)}' or providerKey to '${prefix}'` },
    );
  }

  return Object.freeze({
    id,
    provider: providerKey,
    capability: freezeCapability(capability),
  });
}
