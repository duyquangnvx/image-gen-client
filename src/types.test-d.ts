import { expectTypeOf, test } from 'vitest';
import type {
  Capability,
  TransformKind,
  ModelId,
  GenerateInput,
  GeneratedImage,
  ImageGenResult,
  Mode,
  ApiPath,
  RequestOperation,
  Logger,
  LogLevel,
  ClientOptions,
  ProviderConfig,
  ProviderConfigNative,
  ProviderConfigOpenAICompatible,
} from './types.js';

test('§3.4 Capability shape', () => {
  expectTypeOf<Capability['textToImage']>().toBeBoolean();
  expectTypeOf<Capability['imageEdit']>().toBeBoolean();
  expectTypeOf<Capability['multiReference']>().toBeBoolean();
  expectTypeOf<Capability['transparentBackground']>().toBeBoolean();
  expectTypeOf<Capability['maxN']>().toBeNumber();
  expectTypeOf<Capability['supportsSeed']>().toBeBoolean();
  expectTypeOf<Capability['supportsNegativePrompt']>().toBeBoolean();
  expectTypeOf<Capability['apiPath']>().toEqualTypeOf<ApiPath>();
  expectTypeOf<Capability['aspectRatios']>().toEqualTypeOf<readonly string[] | undefined>();
  expectTypeOf<Capability['sizes']>().toEqualTypeOf<readonly string[] | undefined>();
  expectTypeOf<Capability['transforms']>().toEqualTypeOf<readonly TransformKind[] | undefined>();
});

test('§15.6 commitment 2 — TransformKind exported', () => {
  expectTypeOf<TransformKind>().toEqualTypeOf<
    'remove-background' | 'upscale' | 'restore' | 'outpaint'
  >();
});

test('ModelId: provider/model', () => {
  expectTypeOf<ModelId>().toEqualTypeOf<`${string}/${string}`>();
});

test('Mode + ApiPath unions', () => {
  expectTypeOf<Mode>().toEqualTypeOf<'gateway' | 'direct'>();
  expectTypeOf<ApiPath>().toEqualTypeOf<'generateImage' | 'generateText'>();
});

test('§15.6 commitment 3 — operation is a discriminator union', () => {
  expectTypeOf<RequestOperation>().toEqualTypeOf<'generate' | 'edit' | 'variations'>();
});

test('§3.5 GeneratedImage shape', () => {
  expectTypeOf<GeneratedImage['base64']>().toBeString();
  expectTypeOf<GeneratedImage['uint8Array']>().toEqualTypeOf<Uint8Array>();
  expectTypeOf<GeneratedImage['mediaType']>().toBeString();
  expectTypeOf<GeneratedImage['width']>().toEqualTypeOf<number | undefined>();
  expectTypeOf<GeneratedImage['height']>().toEqualTypeOf<number | undefined>();
  expectTypeOf<GeneratedImage['seed']>().toEqualTypeOf<number | undefined>();
});

test('§3.5 ImageGenResult shape', () => {
  expectTypeOf<ImageGenResult['images']>().toEqualTypeOf<readonly GeneratedImage[]>();
  expectTypeOf<ImageGenResult['model']>().toEqualTypeOf<ModelId>();
  expectTypeOf<ImageGenResult['mode']>().toEqualTypeOf<Mode>();
  expectTypeOf<ImageGenResult['request']['operation']>().toEqualTypeOf<RequestOperation>();
  expectTypeOf<ImageGenResult['request']['n']>().toBeNumber();
  expectTypeOf<ImageGenResult['request']['referenceCount']>().toBeNumber();
  expectTypeOf<ImageGenResult['timings']['start']>().toBeNumber();
  expectTypeOf<ImageGenResult['timings']['finish']>().toBeNumber();
  expectTypeOf<ImageGenResult['timings']['durationMs']>().toBeNumber();
});

test('§15.6 commitment 4 — mask field present, optional', () => {
  expectTypeOf<ImageGenResult['mask']>().toEqualTypeOf<GeneratedImage | undefined>();
});

test('§4.2 GenerateInput shape', () => {
  expectTypeOf<GenerateInput['prompt']>().toBeString();
  expectTypeOf<GenerateInput['model']>().toEqualTypeOf<ModelId | undefined>();
  expectTypeOf<GenerateInput['n']>().toEqualTypeOf<number | undefined>();
  expectTypeOf<GenerateInput['size']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<GenerateInput['signal']>().toEqualTypeOf<AbortSignal | undefined>();
});

test('Logger type', () => {
  expectTypeOf<Logger>().toEqualTypeOf<
    (level: LogLevel, message: string, meta?: Record<string, unknown>) => void
  >();
});

test('ProviderConfig is a discriminated union on kind', () => {
  expectTypeOf<ProviderConfig>().toMatchTypeOf<ProviderConfigNative | ProviderConfigOpenAICompatible>();
});

test('ProviderConfigNative shape', () => {
  expectTypeOf<ProviderConfigNative['kind']>().toEqualTypeOf<'native' | undefined>();
  expectTypeOf<ProviderConfigNative['apiKey']>().toEqualTypeOf<string | undefined>();
});

test('ProviderConfigOpenAICompatible requires baseURL', () => {
  expectTypeOf<ProviderConfigOpenAICompatible['kind']>().toEqualTypeOf<'openai-compatible'>();
  expectTypeOf<ProviderConfigOpenAICompatible['baseURL']>().toBeString();
});

test('ClientOptions has providers and models fields', () => {
  expectTypeOf<ClientOptions['providers']>().toEqualTypeOf<Readonly<Record<string, ProviderConfig>> | undefined>();
  expectTypeOf<ClientOptions['models']>().not.toBeUndefined();
});
