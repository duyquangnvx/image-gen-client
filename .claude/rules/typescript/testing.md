# TypeScript/JavaScript Testing

> This file extends [common/testing.md](../common/testing.md) with TypeScript/JavaScript specific content.

## Type-Safe Tests

- Write tests in TypeScript whenever the code under test is TypeScript
- Type test fixtures and mocks the same way as production code (no `any`, no `as` for shape coercion)
- Prefer `satisfies` over `as` when asserting fixture shapes

## Async Tests

- Always `await` promises; do not return un-awaited promises from `expect`
- For code that schedules timers, use the framework's fake-timer utilities rather than real `setTimeout` waits
- Reject silent flakiness: a test that occasionally fails is broken, not "flaky"

## Mocks and Fakes

- Prefer hand-written fakes that implement the production interface over deep auto-mocks
- Reset mock state between tests to keep isolation
- Never mock the system under test — only its collaborators

> Stack-specific testing tools (unit framework, E2E runner) belong in the per-stack rules file, not here.
