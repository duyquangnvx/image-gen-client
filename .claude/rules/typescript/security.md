# TypeScript/JavaScript Security

> This file extends [common/security.md](../common/security.md) with TypeScript/JavaScript specific content.

## Secret Management

Keep secrets out of source. Read them from the environment (or another secret store) and fail fast at startup if a required value is missing:

```typescript
// NEVER: hardcoded secret
const apiKey = "sk-proj-xxxxx";

// CORRECT: read from environment, validate presence at startup
const apiKey = readEnv("SERVICE_API_KEY");

function readEnv(name: string): string {
  const value = globalThis.process?.env?.[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}
```

> The exact mechanism (`process.env`, build-time injection, native bridge, secret manager) depends on the runtime — what stays constant is: never hardcode, validate at startup, never log the value.

## Avoid Dynamic Code Execution

Do not pass untrusted input to `eval`, `new Function(...)`, `setTimeout`/`setInterval` with a string argument, or other dynamic-evaluation APIs.
