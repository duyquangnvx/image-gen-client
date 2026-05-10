# TypeScript/JavaScript Patterns

> This file extends [common/patterns.md](../common/patterns.md) with TypeScript/JavaScript specific content.

## Result Type

Model fallible operations with a discriminated union instead of throwing for expected failures:

```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

function parseId(input: string): Result<number> {
  const n = Number(input);
  if (!Number.isInteger(n) || n < 0) {
    return { ok: false, error: new Error(`Invalid id: ${input}`) };
  }
  return { ok: true, value: n };
}
```

## Repository Pattern

```typescript
interface Repository<T, Id = string> {
  findAll(): Promise<readonly T[]>;
  findById(id: Id): Promise<T | null>;
  create(data: Omit<T, "id">): Promise<T>;
  update(id: Id, patch: Partial<T>): Promise<T>;
  delete(id: Id): Promise<void>;
}
```

The interface lives in business logic; concrete implementations (in-memory, file, remote) live at the edges. Swap implementations to test with fakes.

## Branded Types for Identifiers

Prevent mixing up structurally identical IDs at compile time:

```typescript
type Brand<T, B> = T & { readonly __brand: B };

type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;

function getUser(id: UserId) {
  /* ... */
}

const orderId = "abc" as OrderId;
// getUser(orderId) // ❌ compile error — OrderId is not UserId
```
