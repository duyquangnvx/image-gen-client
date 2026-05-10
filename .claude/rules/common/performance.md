---
trigger: always_on
---

# Performance Optimization

## Context Window Management

Avoid last 20% of context window for:

- Large-scale refactoring
- Feature implementation spanning multiple files
- Debugging complex interactions

Lower context sensitivity tasks:

- Single-file edits
- Independent utility creation
- Documentation updates
- Simple bug fixes

## Deep Reasoning Tasks

For complex tasks requiring deep reasoning:

1. Use multiple critique rounds for thorough analysis
2. Use split role sub-agents for diverse perspectives
