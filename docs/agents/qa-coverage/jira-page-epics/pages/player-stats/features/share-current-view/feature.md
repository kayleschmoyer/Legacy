# Feature: Share Current View

**Jira:** _Feature Story not yet filed_ — enumerated from code via GAP audit LS-7659
**Page:** `player-stats` (Epic LS-5288)
**Platforms:** web
**Entitlement:** all

## Description

Share the current Player Statistics view as a deep link. The shared
`PlayerStatsPage` component builds a relative URL that encodes the active view
mode, page size, and committed filters, then hands it to the host via
`onShare(relativeUrl)`. The web route prepends the origin and the active `sport`
param, then attempts to share the link through a **three-tier fallback chain**:

1. **Web Share API** (`navigator.share`) — invokes the OS-native share sheet.
2. **Clipboard** (`navigator.clipboard.writeText`) — copies the URL and shows a
   "Link copied to clipboard." confirmation.
3. **Manual copy** — when neither API is available (or both fail), shows
   "Could not share link. Please copy the URL manually." so the user can copy
   the address bar by hand.

The branch a user lands on is determined entirely by their browser's API
support (see the [browser-support matrix](#browser-support-matrix) below), which
is why this single feature is enumerated as three variants — each branch is a
distinct user-facing journey with its own confirmation affordance and its own
failure mode.

## Source

Extracted from: `apps/web/src/pages/players/PlayerStatsPage.tsx` (`handleShare`)

## Implementation

### Web

**Relative-URL builder (sport-agnostic, native-safe):**
`lib/shared-components/src/features/players/PlayerStatsPage.tsx` — the inner
`handleShare` (line 426) assembles a relative `/players/stats?…` URL from
`viewMode`, `pageSize`, `search`, `position`, `team`, `minHomeRuns`,
`minBattingAvg`, and `maxERA`, then calls the host `onShare`. It never touches
`window.location`, keeping the shared component safe for native runtimes.

**Three-tier fallback handler (web host):**
`apps/web/src/pages/players/PlayerStatsPage.tsx` — `PlayerStatsRoute.handleShare`
(line 431) prepends `window.location.origin` and forces the active `sport` param
onto the link so the recipient lands on the matching sport variant, then runs
the fallback chain. Confirmation copy is surfaced through the sr-only live region
plus the visible toast (`liveMsg` / `TOAST_DURATION_MS`).

### Variants

#### Variant: `share-api-available`

**Branch:** `navigator.share` is present.

Invokes the OS-native share sheet with a `title`, `text`, and the absolute `url`.
On success no toast is shown — the native sheet is its own confirmation. If the
user **dismisses** the sheet, the Web Share API rejects with a `DOMException`
whose `name` is `AbortError`; the handler treats this as a non-error and returns
early **without** logging or showing a failure toast (intended behaviour —
dismissal is a user choice, not a fault). Any **other** rejection from
`navigator.share` (e.g. `NotAllowedError`, a `DataError`) is logged via
`LOGGER.error` and then falls through to the clipboard branch as a secondary
fallback before the manual-copy message.

#### Variant: `clipboard-fallback`

**Branch:** `navigator.share` is absent **and** `navigator.clipboard` is present
(or the share branch threw a non-`AbortError` and clipboard is available).

Calls `navigator.clipboard.writeText(url)` and shows the toast
**"Link copied to clipboard."** If `writeText` itself rejects (permissions
denied, insecure context), the error is logged and the handler degrades to the
manual-copy message.

#### Variant: `manual-copy-message`

**Branch:** neither `navigator.share` nor `navigator.clipboard` is available, or
every preceding branch failed.

Shows the toast **"Could not share link. Please copy the URL manually."** — no
clipboard write is attempted; the user copies the address bar by hand.

### Browser-support matrix

| Environment                                     | `navigator.share` | `navigator.clipboard` | Variant hit           | User-visible result                                   |
| ----------------------------------------------- | ----------------- | --------------------- | --------------------- | ----------------------------------------------------- |
| Safari iOS / iPadOS                             | ✅ supported      | ✅                    | `share-api-available` | Native share sheet; dismissal silently ignored        |
| Android Chrome                                  | ✅ supported      | ✅                    | `share-api-available` | Native share sheet; dismissal silently ignored        |
| Desktop Chrome / Edge (no share, HTTPS)         | ❌ unsupported    | ✅                    | `clipboard-fallback`  | "Link copied to clipboard."                           |
| Desktop Firefox                                 | ❌ unsupported    | ✅                    | `clipboard-fallback`  | "Link copied to clipboard."                           |
| Insecure context / clipboard permission blocked | ❌                | ❌ / write rejects    | `manual-copy-message` | "Could not share link. Please copy the URL manually." |

> The matrix reflects the **code branches**, not a live capability survey —
> support for `navigator.share` on desktop varies by version and user gesture.
> What is guaranteed is that any environment lacking a working `navigator.share`
> degrades to clipboard, and any environment lacking a working clipboard degrades
> to the manual-copy message.

## Test Coverage

**Status: not yet covered by a hermetic E2E test.** Per the [QA-coverage
model](../../../../README.md), a Feature Story is "covered" only when a passing,
hermetic Playwright E2E test asserts the user-facing journey. No
`apps/web-e2e/src/tests/` spec yet drives the share affordance, and no unit test
asserts the fallback-chain branching. Recommended coverage (tracked separately
from this enumeration finding):

- Unit: mock `navigator.share` / `navigator.clipboard` to assert each of the
  three variants produces the correct `liveMsg`, that `AbortError` is swallowed,
  and that a non-`AbortError` share rejection degrades to clipboard then manual.
- E2E: assert the clipboard-fallback toast copy in a desktop Chromium project
  (the variant most CI browsers exercise).

## Related

- **Epic:** LS-5288 — QA — Page: Player Stats
- **Gap audit:** LS-7659 — feature-discovery-gaps GAP-001 (this enumeration)
- **Web host:** `apps/web/src/pages/players/PlayerStatsPage.tsx` — `handleShare`
- **Shared component:** `lib/shared-components/src/features/players/PlayerStatsPage.tsx`
- **Finding:** `../feature-discovery-gaps/variants/non-premium/findings/GAP-001.md`
