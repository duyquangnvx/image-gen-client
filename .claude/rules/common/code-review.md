# Code Review Standards

## Review Checklist

- [ ] Code is readable and well-named
- [ ] Functions are focused (<50 lines)
- [ ] Files are cohesive (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Errors are handled explicitly
- [ ] No hardcoded secrets or credentials
- [ ] No console.log or debug statements
- [ ] Tests exist for new functionality
- [ ] Test coverage meets 80% minimum

## Security-Sensitive Areas

Apply extra scrutiny when changes touch:

- Authentication or authorization code
- User input handling
- File system operations
- External API or service calls
- Cryptographic operations
- Code that handles sensitive data (credentials, tokens, personal info)

## Review Severity Levels

| Level    | Meaning                                  | Action                             |
| -------- | ---------------------------------------- | ---------------------------------- |
| CRITICAL | Security vulnerability or data loss risk | **BLOCK** - Must fix before merge  |
| HIGH     | Bug or significant quality issue         | **WARN** - Should fix before merge |
| MEDIUM   | Maintainability concern                  | **INFO** - Consider fixing         |
| LOW      | Style or minor suggestion                | **NOTE** - Optional                |

## Common Issues to Catch

### Security

- Hardcoded credentials (API keys, passwords, tokens)
- Unvalidated external input
- Path traversal (unsanitized file paths)
- Authentication or authorization bypasses
- Sensitive data leaked through logs or error messages

### Code Quality

- Large functions (>50 lines) - split into smaller
- Large files (>800 lines) - extract modules
- Deep nesting (>4 levels) - use early returns
- Missing error handling - handle explicitly
- Mutation patterns - prefer immutable operations
- Missing tests - add test coverage

### Performance

- Repeated work in hot paths - cache or memoize
- Unbounded loops or collections - add explicit limits
- Missing batching for repeated I/O or async calls
- Allocations inside tight loops
