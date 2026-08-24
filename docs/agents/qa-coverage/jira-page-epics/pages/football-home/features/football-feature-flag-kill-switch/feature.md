# Feature: Football Feature-Flag Kill-Switch

**Jira:** LS-7633 (GAP-001)
**Page:** `football-home` (Epic LS-5267)
**Platforms:** web
**Entitlement:** all

## Description

The entire Football Hub is gated behind a single GrowthBook feature flag,
`football_enabled`. `FootballGate` (`apps/web/src/app/app.tsx`) wraps every
`/football/*` route and calls `useFeatureValue('football_enabled', true)`:

```ts
function FootballGate({ children }: { children: React.ReactNode }) {
  const footballEnabled = useFeatureValue('football_enabled', true);
  if (footballEnabled === false) {
    trackFeatureGateBlocked('football_enabled');
    return <Navigate to="/" replace />;
  }
  return children;
}
```

- **Flag off (`false`)** — the user is redirected to `/` and a
  `feature_gate_blocked` analytics event fires (`feature_name: 'football_enabled'`).
  This is the intended kill-switch behavior: an operator can flip the flag in
  GrowthBook to pull the entire Football Hub out of rotation without a deploy.
- **Flag on (`true`) or loading/unconfigured (`null`)** — the wrapped route
  renders normally. `true` is the explicit fallback value passed to
  `useFeatureValue`, so `FootballGate` renders children (not the redirect)
  both while GrowthBook is still fetching feature definitions on first mount
  and in environments where no GrowthBook client key is configured (e.g. some
  E2E setups) — avoiding a flash-redirect on every page load.

## Why the `true` Fallback Is Intentional (Not a Bug)

The `true` default is a deliberate choice, documented in-code immediately
above `FootballGate` (`app.tsx:218-221`): "Uses `true` as the fallback so the
gate doesn't redirect while features are still loading (avoids a flash
redirect on first render or when GrowthBook is unconfigured — e.g. E2E
environments without a client key)." This ticket does not change that
default — see Out of Scope below.

## Outage-Masking Risk

Because the fallback is `true`, a GrowthBook Cloud outage is indistinguishable
from "flag on" as far as `FootballGate` is concerned. `GrowthBookProvider`
(`apps/web/src/context/GrowthBookProvider.tsx:71-80`) calls
`growthbook.loadFeatures({ autoRefresh: true })` on mount and, on failure,
only logs a warning (`LOGGER.warn('[GrowthBook] Feature load failed
(non-fatal):', ...)`) — no retry beyond the SDK's own `autoRefresh`, no error
metric, no analytics event. If an operator flips `football_enabled` to
`false` during an incident while GrowthBook Cloud is unreachable, the kill
switch is **silently ineffective**: users keep seeing the Football Hub, and
nothing in telemetry signals that GrowthBook itself is down. This risk is
documented here but intentionally not fixed by this ticket — see Out of
Scope.

## Analytics

`trackFeatureGateBlocked(featureName)` (`apps/web/src/utils/analytics.ts`,
mirrors the existing `trackPremiumFeatureBlocked` pattern) fires a
`feature_gate_blocked` GA4 event with `{ feature_name, category:
'feature_flag' }` immediately before `FootballGate` returns the `<Navigate
to="/">`. This makes a kill-switch flip visible in GA4 instead of a silent,
unmonitored bounce to `/`.

## Test Coverage

### Unit tests

**File:** `apps/web/src/app/app.spec.tsx` — `describe('FootballGate')`

- `useFeatureValue` returning `false` renders `<Navigate to="/">` (asserted
  via the rendered Home Page content) and fires `trackFeatureGateBlocked`
  exactly once with `'football_enabled'`
- `useFeatureValue` returning `true` renders the Football Hub and does not
  fire `trackFeatureGateBlocked`
- `useFeatureValue` returning `null` (loading/unconfigured GrowthBook) renders
  the Football Hub and does not fire `trackFeatureGateBlocked`

## Why This Feature Story Was Filed Retroactively

An automated QA feature-discovery pass over the Football Home page (parent
epic LS-5267) flagged this as GAP-001: the `football_enabled` kill-switch
gates the entire Football Hub, but no Feature Story documented its three
behaviors (flag-off redirect, loading/unconfigured fallback, mid-session
flip), it had no dedicated test coverage of the redirect itself, and its
redirect fired no analytics event. Same pattern as Login Google Sign-In
(LS-7583) — a third-party SDK/flag toggle that was never enumerated by the
original QA pass. This Feature Story exists to retroactively give the
kill-switch behavior a documented home and close the test/analytics gaps
identified in LS-7633.

## Source / Discovery

Discovered via GAP-001 (source finding:
`pages/football-home/features/feature-discovery-gaps/variants/non-premium/findings/GAP-001.md`)
and confirmed by reading `apps/web/src/app/app.tsx:186-230` (`AdminGuard`,
`PremiumGuard`, `FootballGate`) and
`apps/web/src/context/GrowthBookProvider.tsx:20-83`.

## Out of Scope

- Changing the `true` fallback default, or adding retry/backoff to
  `growthbook.loadFeatures` — a GrowthBook-outage resiliency improvement is a
  separate, larger ticket.
- Deep-link preservation across the redirect (returning the user to their
  original `/football/...` path once the flag flips back on) — would require
  a consistent redesign of all three route guards (`AdminGuard`,
  `PremiumGuard`, `FootballGate`), none of which currently preserve the
  origin path.
- Backfilling the rest of the `football-home` epic's Feature Story docs
  beyond this one file.
- LS-7583 (Google Sign-In) — related "un-enumerated SDK toggle" pattern, but
  a separate ticket.

## Related

- **Ticket:** LS-7633 (GAP-001) — this Feature Story's origin
- **Parent epic:** LS-5267 — QA: Page: Football Home
- **Same-pattern precedent:** [`../../../login/features/google-oauth-login/feature.md`](../../../login/features/google-oauth-login/feature.md) (LS-7583)
