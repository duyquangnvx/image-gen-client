# Security Guidelines

## Mandatory Security Checks

- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All external input validated at the boundary
- [ ] Authentication/authorization verified where applicable
- [ ] Sensitive data not logged or exposed in error messages
- [ ] File paths and resource identifiers sanitized
- [ ] Untrusted data never passed to dynamic code execution (`eval`, `Function`, etc.)

## Secret Management

- NEVER hardcode secrets in source code
- ALWAYS use environment variables or a secret manager
- Validate that required secrets are present at startup
- Rotate any secrets that may have been exposed
