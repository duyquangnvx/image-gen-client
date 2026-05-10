import type { Capability } from './types.js';

export function freezeCapability(cap: Capability): Capability {
  return Object.freeze({ ...cap });
}
