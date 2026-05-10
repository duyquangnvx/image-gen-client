# TypeScript/JavaScript Coding Style

> This file extends [common/coding-style.md](../common/coding-style.md) with TypeScript/JavaScript specific content.

## Types and Interfaces

Use types to make public APIs, shared models, and function boundaries explicit, readable, and reusable.

### Public APIs

- Add parameter and return types to exported functions, shared utilities, and public class methods
- Let TypeScript infer obvious local variable types
- Extract repeated inline object shapes into named types or interfaces

```typescript
// WRONG: Exported function without explicit types
export function formatUser(user) {
  return `${user.firstName} ${user.lastName}`;
}

// CORRECT: Explicit types on public APIs
interface User {
  firstName: string;
  lastName: string;
}

export function formatUser(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}
```

### Interfaces vs. Type Aliases

- Use `interface` for object shapes that may be extended or implemented
- Use `type` for unions, intersections, tuples, mapped types, and utility types
- Prefer string literal unions over `enum` unless an `enum` is required for interoperability

```typescript
interface User {
  id: string;
  email: string;
}

type UserRole = "admin" | "member";
type UserWithRole = User & {
  role: UserRole;
};
```

### Avoid `any`

- Avoid `any` in application code
- Use `unknown` for external or untrusted input, then narrow it safely
- Use generics when a value's type depends on the caller

```typescript
// WRONG: any removes type safety
function getErrorMessage(error: any) {
  return error.message;
}

// CORRECT: unknown forces safe narrowing
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}
```

### JavaScript Files

- In `.js` files, use JSDoc when types improve clarity and a TypeScript migration is not practical
- Keep JSDoc aligned with runtime behavior

```javascript
/**
 * @param {{ firstName: string, lastName: string }} user
 * @returns {string}
 */
export function formatUser(user) {
  return `${user.firstName} ${user.lastName}`;
}
```

## Immutability

Use spread operator for immutable updates:

```typescript
interface User {
  id: string;
  name: string;
}

// WRONG: Mutation
function updateUser(user: User, name: string): User {
  user.name = name; // MUTATION!
  return user;
}

// CORRECT: Immutability
function updateUser(user: Readonly<User>, name: string): User {
  return {
    ...user,
    name
  };
}
```

## Error Handling

Use async/await with try-catch and narrow unknown errors safely:

```typescript
interface User {
  id: string;
  email: string;
}

declare function riskyOperation(userId: string): Promise<User>;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}

const logger = {
  error: (message: string, error: unknown) => {
    // Replace with your production logger (for example, pino or winston).
  }
};

async function loadUser(userId: string): Promise<User> {
  try {
    const result = await riskyOperation(userId);
    return result;
  } catch (error: unknown) {
    logger.error("Operation failed", error);
    throw new Error(getErrorMessage(error));
  }
}
```

## Input Validation

Validate untrusted input at the boundary and derive the static type from the runtime check whenever possible. Schema-based validation libraries (e.g., Zod, Valibot, ArkType) let you do both with one declaration:

```typescript
// Pseudo-pattern: a schema describes the runtime shape,
// and the static type is inferred from the same schema —
// keeping runtime and compile-time guarantees in sync.

const userSchema = defineSchema({
  email: stringMatching(EMAIL_REGEX),
  age: integerBetween(0, 150)
});

type UserInput = InferSchema<typeof userSchema>;

const validated: UserInput = userSchema.parse(input);
```

If no schema library is available, write an explicit type guard instead of trusting `as`.

## Console.log

- No `console.log` statements in production code
- Use proper logging libraries instead
