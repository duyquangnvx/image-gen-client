import type { Capability } from './types.js';

export function freezeCapability(cap: Capability): Capability {
  return Object.freeze({
    ...cap,
    ...(cap.sizes !== undefined && { sizes: Object.freeze([...cap.sizes]) }),
    ...(cap.aspectRatios !== undefined && { aspectRatios: Object.freeze([...cap.aspectRatios]) }),
    ...(cap.transforms !== undefined && { transforms: Object.freeze([...cap.transforms]) }),
  });
}
