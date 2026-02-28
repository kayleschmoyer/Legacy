# draft-processor

AWS Lambda that processes live draft events — handles pick submissions, auto-picks on timer expiry, and draft state transitions via SQS messages.

## Quick Start

```powershell
pnpm exec nx build draft-processor
```

## Related

- [Draft Pick Implementation](../../docs/features/DRAFT_PICK_IMPLEMENTATION.md)
- [Draft Timer Implementation](../../docs/features/DRAFT_TIMER_IMPLEMENTATION.md)
- [Async State Management CSV](../../docs/agents/async-state-management.csv)
