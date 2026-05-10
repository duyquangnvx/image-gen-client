// 1×1 transparent PNG (the smallest valid PNG, ~67 bytes raw).
export const PIXEL_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

export const PIXEL_1X1_BYTES = Uint8Array.from(Buffer.from(PIXEL_1X1_BASE64, 'base64'));
