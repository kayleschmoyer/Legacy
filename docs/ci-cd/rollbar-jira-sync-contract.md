# Rollbar ↔ Jira Sync Contract

> Research + design deliverable for **LS-8344**
> (`research: Rollbar→Jira auto-sync not reliably creating/resolving tickets`).
> Documents what actually syncs Rollbar items and Jira tickets today, why the two
> observed gaps happen, the intended sync contract, and the proposed automation to
> close the loop.

## TL;DR

- **There is no repo-side Rollbar↔Jira sync automation.** Nothing in
  `.github/workflows`, `lambdas/`, or `terraform/` creates or resolves a Rollbar
  item from Jira (or vice-versa). The only Rollbar-consuming runtime is
  `lambdas/rollbar-discord`, which forwards occurrence webhooks to Discord and
  never touches Jira.
- **Ticket creation is done by Rollbar's own native Jira integration** (configured
  in the Rollbar project UI, not in this repo). It writes a bidirectional link into
  the item's `integrations_data.jira` and embeds the Rollbar item URL in the Jira
  ticket description.
- **Create-side gap** (item #89, `level=warning`, no ticket): the native
  integration's _minimum item level_ is set to **error**, so `warning`-level items
  are never auto-filed. This is a Rollbar SaaS setting + a policy question, not a
  code bug.
- **Resolve-side gap** (~8 items `active` while their Jira ticket is `Done`): the
  native integration is **create-only** — it does not consume Jira status changes.
  No automation resolves a Rollbar item when its ticket reaches Done. The one-time
  reconciliations to date (LS-8202 context: "27 items synced") were **manual agent
  sweeps** using the `rollbar_set_status` MCP tool.

## Evidence (captured 2026-07-06)

| Rollbar item                                           | Level       | Status | `integrations_data.jira` | Jira status              |
| ------------------------------------------------------ | ----------- | ------ | ------------------------ | ------------------------ |
| #174 `Error updating team member position`             | error       | active | LS-8340                  | (open)                   |
| #171 `CombinedGraphQLErrors` (production)              | error       | active | LS-8287                  | (open)                   |
| #167 `Team not found`                                  | error       | active | LS-8227                  | **Done**                 |
| #164 `Failed to calculate scores`                      | error       | active | LS-8224                  | **Done**                 |
| #11 `item per minute limit reached`                    | error       | active | LS-471                   | (reopened)               |
| **#89 `CORS: rejected unrecognized WebSocket origin`** | **warning** | active | **(none)**               | LS-8342 (manually filed) |

Two facts fall straight out of this table:

1. **Every active error-level item carries an `integrations_data.jira` link; the
   only warning-level item does not.** The discriminator is the item level, not
   dedup keys, not environment (both `dev` and `production` error items are
   linked), and not volume (#89 has 1,253 occurrences — by far the most — yet was
   never ticketed).
2. **Linked items whose Jira ticket is `Done` remain `active` in Rollbar**
   (#167→LS-8227, #164→LS-8224). Nothing closes the loop on the resolve side.

The `integrations_data.jira.issue.key` field is the canonical, machine-readable
link. Jira tickets additionally carry the reverse pointer as the first line of the
description (`View details in Rollbar: https://app.rollbar.com/a/…/item/Legacy-Sports/<counter>`)
and, on older tickets, a `rollbar` label. The Rollbar-side link is authoritative and
consistent; the Jira-side link (label) is not consistently applied.

## How it works today (actual mechanism)

```
Error thrown ──► lib/rollbar (LOGGER.error → RollbarOutputDestination)
                     │
                     ▼
             Rollbar item created / reactivated
                     │
     ┌───────────────┼─────────────────────────────┐
     ▼               ▼                                ▼
 Rollbar native   Occurrence webhook             (nothing)
 Jira integration  → lambdas/rollbar-discord       resolve-side
 (SaaS config)     → Discord channel               is unwired
     │
     ▼
 Jira ticket created IF item level ≥ threshold (currently "error"),
 link stored in item.integrations_data.jira
```

- **Create:** an outbound push **from Rollbar to Jira** — Rollbar's own Jira
  integration/webhook creates the issue via Jira's API and records the link in
  `item.integrations_data.jira`. This is configured in the Rollbar project UI, not in
  this repo. One-directional and threshold-gated at `error`. No repo code.
- **Notify:** `lambdas/rollbar-discord` receives Rollbar occurrence + status-change
  webhooks but only posts Discord embeds (LS-8203 recolors resolved/muted). It does
  **not** call Jira. `lambdas/jira-proxy` _does_ create Jira Bugs, but only from the
  in-app JWT-authenticated "Report a bug" endpoint (`POST /jira/bug`) — it is not
  triggered by Rollbar. Both repo webhook receivers are dead-ends for the Rollbar↔Jira
  sync.
- **Resolve:** unimplemented — there is **no reverse webhook (Jira → Rollbar)** and no
  repo automation. `rollbar_set_status` (LS-8202) exists as a _manual_ MCP write tool.
- **GitHub → Jira status** (`jira-branch-sync.yml`, `jira-status-audit.yml`,
  `tools/jira-sync`) moves tickets `To Do → In Progress → In Review → Done` from PR
  activity. It is **Jira-only** and never reads or writes Rollbar.

## Root causes

### Create-side (some active items have no ticket)

Rollbar's native Jira integration auto-files a ticket only for items at or above its
configured **minimum level**, which is currently **error**. Item #89 is
`level=warning`, so no ticket was ever created despite its high volume. The original
hypotheses (dedup-key mismatch, per-item rate limiting) are **not** the cause: error
items across `dev` and `production` are reliably ticketed.

Secondary, distinct risk: item #11 (`item per minute limit reached, ignoring errors
until timeout`) shows the Rollbar **account-level item-per-minute cap** is being hit.
When that cap trips, brand-new items can be dropped at ingestion and never appear in
Rollbar at all — so they can never be ticketed. This is an occurrence-ingestion
concern, orthogonal to the level-threshold gap that produced #89.

### Resolve-side (Done tickets leave items active)

There is **no resolve-side automation in any direction**:

- Rollbar's native Jira integration is create-only in the current configuration; it
  does not listen for Jira transitions.
- The repo's Jira automation is GitHub→Jira status only and has no Rollbar client.
- `rollbar_set_status` is invoked by hand. The historical "27-item sync" was a
  manual sweep, so items whose tickets merged after that sweep (LS-8227, LS-8224,
  LS-8256, LS-8226, LS-8223, LS-8222, LS-8215, LS-8205, …) were left `active`.

## Intended sync contract

The target state is a single, idempotent, **reconcile-style** loop keyed on
`integrations_data.jira.issue.key`. Reconciliation (list current state, converge)
is preferred over event hooks because it is self-healing: a missed webhook or a
manual Jira edit is corrected on the next run rather than lost forever.

### 1. Create-on-new-active

- **Owner:** Rollbar native Jira integration (SaaS), not repo code.
- **Contract:** every Rollbar item at or above the agreed minimum level SHALL have
  exactly one linked Jira ticket, recorded in `item.integrations_data.jira`.
- **Open policy decision (see LS-8342 / #89):** whether to lower the integration
  threshold to `warning`. A 1,253-occurrence warning is a real signal, but
  auto-filing _every_ warning class risks ticket spam. Recommended: keep the
  auto-file threshold at `error`, and treat high-volume warnings as a triage/mute
  decision (fix the source or lower the log level so it stops flooding Rollbar),
  per the `checkIgnore` / classification guidance in
  [`.agents/skills/debugging/references/prod-errors.md`](../../.agents/skills/debugging/references/prod-errors.md).
- **Backstop:** a reconcile job MAY file a ticket for any active item above
  threshold that lacks `integrations_data.jira`, covering integration outages.

### 2. Resolve-on-done

- **Owner:** a new repo-side reconcile job (design below).
- **Contract:** when a linked item's Jira ticket is `Done` (or `Closed`) **and the
  fix is deployed**, the Rollbar item SHALL be set to `resolved` via
  `rollbar_set_status`. Reactivation (a fresh occurrence after resolve) is left to
  Rollbar's normal reactivation behavior — the loop does not fight it.
- **Direction:** driven from the Rollbar side. Enumerate active items, read
  `integrations_data.jira.issue.key`, check that ticket's Jira status, resolve when
  Done. This needs no reverse index and no change to the PR-triggered, secret-bearing
  `jira-branch-sync.yml`.

### 3. Invariants

- **Idempotent:** re-running changes nothing once converged.
- **One item ⇄ one ticket**, keyed on `integrations_data.jira.issue.key`.
- **Forward-safe:** never reopen a resolved item and never reopen a Done ticket;
  only `active → resolved` on the Rollbar side is automated.
- **Dry-run gated:** ships behind a repo-var flag (mirroring
  `JIRA_AUDIT_AUTO_REPAIR`) so proposals are logged before any write is enabled.

## Proposed implementation (follow-up)

Scoped as follow-up work because it is outward-facing (mutates production Rollbar
item state) and requires provisioning a write-scoped Rollbar token as a GitHub
secret — see [Prerequisites](#prerequisites).

**Shape:** mirror `jira-status-audit.yml` — a scheduled + `workflow_dispatch`
workflow (`rollbar-jira-reconcile.yml`) that checks out from `main`, authenticates
to both APIs, and runs the two reconcile passes. Keep all decision logic in a small,
unit-tested `tools/rollbar-jira-reconcile/` package (the pattern established by
`tools/jira-sync`): the workflow is a thin adapter, the logic is tested in isolation.

**Resolve pass (primary, lowest-risk):**

1. `GET /api/1/items?status=active` (Rollbar) — paginate.
2. For each item with `integrations_data.jira.issue.key`, `GET` that Jira issue's
   status.
3. If status is `Done`/`Closed`, `PATCH /api/1/item/{id}/ {"status":"resolved"}`
   (the `rollbar_set_status` path from LS-8202), gated on the dry-run flag.
4. Emit a step-summary table of resolved / proposed / skipped, matching the audit
   workflow's reporting style.

**Create backstop pass (optional, higher-policy):**

1. `GET /api/1/items?status=active&level=error` (or the agreed threshold).
2. For each item **without** `integrations_data.jira`, create a Jira Bug embedding
   the Rollbar URL, then rely on the native integration (or write the link back).
   Prefer instead simply setting the native integration threshold correctly — code
   duplication of the SaaS integration is a maintenance cost only justified if the
   native integration proves unreliable for error items (it currently is reliable).

### Prerequisites

- A **write-scoped** Rollbar project access token exposed to Actions as a repo
  secret (e.g. `ROLLBAR_WRITE_TOKEN`). The current CI token `ROLLBAR_ACCESS_TOKEN`
  is used for sourcemap upload and its item-write scope is unconfirmed; the read
  token `ROLLBAR_READ_ACCESS_TOKEN` cannot mutate. Provisioning secrets is a
  user-only action.
- A decision on the create-side threshold policy (keep `error`, or include
  `warning`).
- The dry-run repo var (e.g. `ROLLBAR_JIRA_RECONCILE_AUTO` defaulting to `false`).

## References

- `lambdas/rollbar-discord/` — Rollbar occurrence/status webhooks → Discord (the
  only Rollbar-consuming runtime).
- `.github/workflows/jira-branch-sync.yml`, `.github/workflows/jira-status-audit.yml`,
  `tools/jira-sync/` — GitHub→Jira status automation (no Rollbar involvement).
- `tools/mcp/rollbar-server/` — hosted `legacy-sports-rollbar` MCP server;
  `rollbar_set_status` write tool (LS-8202).
- [`.agents/skills/debugging/references/prod-errors.md`](../../.agents/skills/debugging/references/prod-errors.md)
  — manual triage workflow and the `rollbar_*` tool surface.
- [`.agents/skills/infrastructure/references/rollbar-monitoring.md`](../../.agents/skills/infrastructure/references/rollbar-monitoring.md)
  — error-delivery wiring and sourcemap upload.
- LS-8202 (`rollbar_set_status` write tool), LS-8203 (rollbar-discord resolved-item
  styling), LS-8342 (item #89 manually filed).
