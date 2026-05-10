# TypeScript Type System

## Avoid `as` and `!`

Both silence the compiler without proof. Fix the source type instead.

- **Never** `as any` or `as unknown as X` — validate at runtime, then types follow.
- Prefer **type guards** over `as` for narrowing unknowns.
- Prefer **`satisfies`** over `as` when you only want a shape check.
- Handle null explicitly instead of using `!`.

```typescript
// WRONG
const data = response as ApiResponse;
const el = document.getElementById("app")!;

// CORRECT
const data = apiResponseSchema.parse(response);
const el = document.getElementById("app");
if (!el) throw new Error("Missing #app");
```

User-defined type guards for custom shapes:

```typescript
function isUser(value: unknown): value is User {
  return typeof value === "object" && value !== null && "id" in value;
}
```

Acceptable `as` cases: after runtime validation, DOM APIs (`as HTMLInputElement`), `as const`, or narrowing after a verified discriminator.

## Discriminated Unions

Model mutually exclusive states with a discriminant field. Avoid optional-field combinations that allow invalid states.

```typescript
// WRONG: invalid combinations representable
interface Response {
  data?: User;
  error?: string;
  isLoading?: boolean;
}

// CORRECT
type Response =
  | { status: "loading" }
  | { status: "success"; data: User }
  | { status: "error"; error: string };
```

Pair with exhaustive `switch` for compile-time safety:

```typescript
function render(r: Response): string {
  switch (r.status) {
    case "success":
      return r.data.email;
    case "error":
      return r.error;
    case "loading":
      return "Loading...";
    default: {
      const _exhaustive: never = r;
      return _exhaustive;
    }
  }
}
```

## `satisfies` vs `: Type` vs `as const`

- `: Type` — widens literal inference to the declared type.
- `satisfies Type` — validates shape, **keeps** narrow inference.
- `as const` — preserves literals and makes value deeply readonly.

```typescript
type Config = Record<string, { port: number }>;

const config = {
  api: { port: 3000 },
  db: { port: 5432 }
} satisfies Config;
// config.api is known to exist (narrow)

const ROLES = ["admin", "member", "guest"] as const;
type Role = (typeof ROLES)[number]; // 'admin' | 'member' | 'guest'
```

## Utility Types

Derive types from a single source of truth. Don't duplicate shapes.

```typescript
type PublicUser = Omit<User, "password">;
type UserUpdate = Partial<User> & Pick<User, "id">;
type UsersById = Record<string, User>;
type FetchResult = Awaited<ReturnType<typeof fetchUser>>;
type FetchParams = Parameters<typeof fetchUser>;
```

If a derived type drifts, fix the source — never duplicate.

## Generics

Use when output type depends on input type. A generic with no input/output relationship is disguised `any`.

```typescript
// CORRECT: T and K link input shape to output type
function getValue<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// CORRECT: extends constraint enforces a contract
function withTimestamp<T extends { id: string }>(
  item: T
): T & { createdAt: Date } {
  return { ...item, createdAt: new Date() };
}
```

## Readonly Inputs

Mark non-mutated inputs as `readonly` / `Readonly<T>` to document intent and prevent accidental mutation.

```typescript
function sum(arr: readonly number[]): number {
  return arr.reduce((acc, n) => acc + n, 0);
}

function formatUser(user: Readonly<User>): string {
  return `${user.firstName} ${user.lastName}`;
}
```
