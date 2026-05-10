# TypeScript Advanced Types

> This file extends [types.md](./types.md) with additional patterns for non-trivial type work. Apply only when the simpler tools in `types.md` don't fit — do not over-engineer.

## Assertion Functions

Use `asserts x is T` when a check should narrow the type **and** abort on failure. Complements type guards: a guard returns `boolean` for branching, an assertion throws and lets the rest of the function treat the value as narrowed.

```typescript
function assertDefined<T>(
  value: T | null | undefined,
  name: string
): asserts value is T {
  if (value == null) {
    throw new Error(`${name} is required`);
  }
}

function loadUser(raw: { id?: string; name?: string }): User {
  assertDefined(raw.id, "user.id");
  assertDefined(raw.name, "user.name");
  // raw.id and raw.name are now narrowed to string
  return { id: raw.id, name: raw.name };
}
```

Rules:

- Reach for an assertion when the _next_ lines depend on the value being valid; reach for a guard when the caller branches on the result.
- Always include a useful message — the assertion replaces both the runtime check and the `if (!x) throw` boilerplate.
- Do **not** chain assertions to silence the compiler the way `as` does. The runtime check must really run.

## Mapped Types with Key Remapping

Use `as` inside a mapped type to **derive** related shapes from a source of truth instead of writing parallel types by hand.

```typescript
// Derive event-handler props from a list of event names
type EventName = "click" | "focus" | "blur";
type Handlers = {
  [E in EventName as `on${Capitalize<E>}`]?: (event: Event) => void;
};
// { onClick?: ...; onFocus?: ...; onBlur?: ... }

// Filter properties by value type
type PickByType<T, V> = {
  [K in keyof T as T[K] extends V ? K : never]: T[K];
};

interface Mixed {
  id: number;
  name: string;
  count: number;
  active: boolean;
}
type Numbers = PickByType<Mixed, number>; // { id: number; count: number }
```

Rules:

- Use key remapping to **eliminate duplication** between related types (props ↔ handlers, model ↔ DTO, model ↔ getters).
- If the mapped type takes more than ~3 lines to read, extract it to a named utility with a JSDoc comment explaining intent.
- Don't reach for mapped types when `Pick`/`Omit`/`Partial`/`Record` already does the job.

## `infer` for Custom Extractors

Built-in `Parameters` / `ReturnType` / `Awaited` cover most needs. Use `infer` directly when you need to extract a type built-ins don't expose.

```typescript
// Element type of any array
type ElementOf<T> = T extends readonly (infer U)[] ? U : never;

// Unwrap a Result<T, E> to its success type
type Ok<R> = R extends { ok: true; value: infer V } ? V : never;

// Last argument of a function
type LastArg<F> = F extends (...args: [...any[], infer L]) => any ? L : never;
```

Rules:

- Name the inferred type variable for what it represents (`U`, `V`, `R`) — not `T` if the outer type already uses `T`.
- One `infer` per type alias when possible; deeply nested `infer` chains become unreadable.
- If you find yourself writing the same `infer` extractor twice, hoist it into a shared utility type.
- Always provide a fallback branch (`: never`, `: T`, etc.) — never leave a conditional type partial.

## Template Literal Types

Use template literal types to give string identifiers compile-time safety: event names, asset paths, CSS class names, route patterns.

```typescript
// Constrain string identifiers
type EventName = `${"user" | "order"}:${"created" | "updated" | "deleted"}`;
// 'user:created' | 'user:updated' | ... | 'order:deleted'

// Build paths from a config tree
type Path<T, P extends string = ""> = T extends object
  ? {
      [K in keyof T & string]: Path<T[K], P extends "" ? K : `${P}.${K}`>;
    }[keyof T & string]
  : P;

// Parse params out of a route literal
type RouteParams<R extends string> =
  R extends `${string}:${infer Param}/${infer Rest}`
    ? Param | RouteParams<`/${Rest}`>
    : R extends `${string}:${infer Param}`
      ? Param
      : never;

type P = RouteParams<"/users/:id/posts/:postId">; // 'id' | 'postId'
```

Rules:

- Pair template literal types with `as const` arrays to keep the source of truth runtime-checkable.
- Use the built-in `Capitalize` / `Uncapitalize` / `Uppercase` / `Lowercase` rather than ad-hoc transforms.
- If the literal pattern requires more than two `infer` clauses to parse, the design is probably forcing the type system to do work that belongs in code — reconsider.
- Avoid template literal types for free-form user content (titles, descriptions). They're for **identifiers**, not data.

## Deep Variants

`Readonly<T>` and `Partial<T>` are **shallow**. For nested config / state / save data, use deep variants so nested objects are also frozen / optional.

```typescript
type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

type DeepPartial<T> = T extends (...args: any[]) => any
  ? T
  : T extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;
```

Rules:

- Use `DeepReadonly` for config / constants / loaded save data — anywhere "no mutation, ever" is the contract. Loaded data should be `DeepReadonly` even when the in-memory mutable copy is not.
- Use `DeepPartial` for patch / update payloads, not as a substitute for proper input validation.
- Do **not** apply deep variants to types containing class instances, Maps, Sets, or DOM nodes — the recursion treats them as plain objects and produces wrong types. Stop at primitives, plain objects, and arrays.
- Both are recursive types; keep nesting depth reasonable (TypeScript caps recursion). If a structure is deeper than ~10 levels, redesign the data, not the type.
