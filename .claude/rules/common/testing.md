# Testing Requirements

## Minimum Test Coverage: 80%

Test Types (ALL required):

1. **Unit Tests** - Individual functions, utilities, and modules in isolation
2. **Integration Tests** - Multiple modules wired together (data flow, side effects, contracts between layers)
3. **E2E Tests** - Critical user flows through the running application (framework chosen per stack)

## Test Structure (AAA Pattern)

Prefer Arrange-Act-Assert structure for tests:

```typescript
test("calculates similarity correctly", () => {
  // Arrange
  const vector1 = [1, 0, 0];
  const vector2 = [0, 1, 0];

  // Act
  const similarity = calculateCosineSimilarity(vector1, vector2);

  // Assert
  expect(similarity).toBe(0);
});
```

## Test Naming

Use descriptive names that explain the behavior under test:

```typescript
test("returns empty array when input is empty", () => {});
test("throws error when required configuration is missing", () => {});
test("falls back to default value when source is unavailable", () => {});
```

## Fixing Failing Tests

- Fix the implementation, not the test (unless the test is wrong)
- Check test isolation
- Verify mocks are correct
