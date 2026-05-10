# Common Patterns

## Skeleton Projects

When implementing new functionality:

1. Search for battle-tested skeleton projects
2. Evaluate candidates on security, extensibility, and relevance
3. Clone best match as foundation
4. Iterate within proven structure

## Design Patterns

### Repository Pattern

Encapsulate data access behind a consistent interface:

- Define standard operations relevant to the domain (e.g., findAll, findById, create, update, delete)
- Concrete implementations handle storage details (in-memory, file, remote service, etc.)
- Business logic depends on the abstract interface, not the storage mechanism
- Enables swapping data sources and simplifies testing with fakes

### Result Type for Fallible Operations

Model operations that can fail with an explicit result type instead of throwing for expected failures:

- Use a discriminated union (`{ ok: true, value }` | `{ ok: false, error }`) or similar
- Reserve exceptions for truly unexpected conditions
- Forces callers to handle the failure case at compile time
