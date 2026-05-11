# Entrypoint 09: Docs-Only

**Trigger**: change is documentation only — no code change, no schema change, no infra change.

**Default risk tier**: Low

**Required artifacts**: none.

## Path notes

The lightest entrypoint. Most spine phases compress to "do the thing." The discipline that remains: accuracy.

### Phase 1: Frame

- State the doc gap or correction in the ticket / commit message.
- If the gap was discovered while doing other work: **separate ticket and PR**. Bundling docs with unrelated code is a review hazard.

### Phase 2: Design

- Skip.

### Phase 3: Implement

- Write the doc.
- Verify all links resolve.
- Verify all code examples actually work (run them).
- Verify any referenced file paths, tool names, or env vars exist.

### Phase 4: Verify

- `make pc` not strictly required for pure prose changes; pre-push hook catches the markdown formatter.
- For docs that include code: copy the code into a scratch file and run it. "Looks right" is not verified.

### Phase 5: Document

- (This _is_ the document phase.)

### Phase 6: Handoff

- Standard PR flow.
- Bot review applies but is usually a no-op for prose changes.

## Anti-patterns

- ❌ Bundling docs with unrelated code changes "while I'm here."
- ❌ Code examples in docs that were never executed. They drift.
- ❌ Linking to files / tools / env vars by name without verifying they exist.
- ❌ Marketing-style prose. Docs are reference material — terse and accurate.
- ❌ "Update X.md" with no description of what changed and why. Even doc PRs need a description.

## Related skills

- [documentation-freshness gate](../gates/documentation-freshness.md)
