# Artifact: Repro Report

A structured record of how to reliably reproduce a defect. Without a repro, there is no ticket — investigation continues until repro is captured or the report concludes "cannot reproduce" with evidence.

## When required

- Entrypoint 2 (bug-investigation) — produced before any fix is attempted.
- Entrypoint 4 (CI flaky triage) — produced for each flake before it can be classified.
- Entrypoint 1 (incident-hotfix) — abbreviated form acceptable; full repro can wait for postmortem.

## Path

Stored as a Jira ticket field (custom field: `repro_report`). For tickets that pre-date the field or are filed elsewhere, paste the report into the description under a `## Repro` heading.

## Required sections

```markdown
## Repro

**Environment**:

- Build SHA / version: <e.g. f73b142fe or web-v1.2.3+456>
- Browser / OS: <e.g. Chrome 130 / macOS 15.1>
- User account: <e.g. test-user-3, league commissioner role>
- Data state: <e.g. league with 12 teams, draft in progress, pick 14>

**Steps**:

1. <Step 1, concrete — "Click X" not "navigate to settings">
2. <Step 2>
3. <Step 3>

**Expected**:
<What the spec / docs / common sense says should happen>

**Actual**:
<What actually happens. Include exact error message, screenshot path, or log line.>

**Frequency**: Always | Sometimes (~N%) | Once

**First seen**: <SHA, date, or version where the bug was first observed>

**Workaround**: <Any known workaround, or "none">
```

## Quality bar

A repro report is **acceptable** when a colleague can follow the steps and observe the bug without further questions. If a step requires implicit knowledge ("you have to be logged in as the right user with the right league state"), make that knowledge explicit in **Environment** or **Steps**.

## "Cannot reproduce" reports

If after investigation the bug cannot be reproduced, the report still gets written:

```markdown
## Repro: Cannot Reproduce

**Attempted environments**: <list>
**Attempted steps**: <what was tried>
**Hypotheses**: <what might cause the original report to be a real bug despite no local repro>
**Recommendation**: <e.g. "request logs from the reporter", "add observability and reopen", "close as not reproducible">
```

This is not a failure — it is a structured record that prevents the next investigator from re-doing the same work.

## Anti-patterns

- ❌ Filing a ticket without a repro and saying "I'll figure it out later". The repro is the ticket.
- ❌ Vague frequency: "happens sometimes". Quantify or say "Once".
- ❌ Steps that assume domain knowledge: "set up the league normally". Spell it out.
- ❌ Skipping the **Actual** section because "you'll see when you run it". Future-you will not see when running it 6 weeks from now.

## Tool surface

MCP tools implemented in `tools/mcp/dev-process-server/` (server: `legacy-sports-dev-process`).
Repro data is stored at `docs/repros/<ticket>.md` (Jira custom field sync is a future enhancement):

- ✅ `repro_capture({ ticket, environment, steps, expected, actual, frequency, firstSeen?, workaround? })` — write structured repro to `docs/repros/<ticket>.md`; validate required fields.
- ✅ `repro_replay({ ticket })` — print the steps in copy-pasteable form.
- ✅ `repro_close_no_repro({ ticket, attempted, hypotheses, recommendation })` — write the structured "cannot reproduce" form.

## Related

- [Entrypoint 02: bug-investigation](../entrypoints/02-bug-investigation.md).
- [Entrypoint 04: CI flaky triage](../entrypoints/04-ci-flaky-triage.md).
- [Template](../templates/repro-report-template.md).
