import { resolveConfig } from './config.js';
import type { ResolvedConfig } from './config.js';
import { runGenerate } from './operations/generate.js';
import type { ClientOptions, GenerateInput, ImageGenResult } from './types.js';

export class Client {
  readonly #config: ResolvedConfig;
  readonly #env: Readonly<Record<string, string | undefined>>;

  constructor(
    options: ClientOptions = {},
    env: Readonly<Record<string, string | undefined>> = process.env,
  ) {
    this.#config = resolveConfig(options, env);
    this.#env = env;
  }

  generate(input: GenerateInput): Promise<ImageGenResult> {
    return runGenerate({ input, config: this.#config, env: this.#env });
  }
}

export function createClient(
  options: ClientOptions = {},
  env: Readonly<Record<string, string | undefined>> = process.env,
): Client {
  return new Client(options, env);
}
