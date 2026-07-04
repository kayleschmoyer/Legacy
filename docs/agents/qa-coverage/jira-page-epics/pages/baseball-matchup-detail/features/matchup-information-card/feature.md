# Feature: Matchup Information Card

**Jira:** LS-5352
**Page:** `baseball-matchup-detail` (Epic LS-5260)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The Matchup Information card is a small section on the Baseball Matchup Detail
page that surfaces the matchup's scheduling window: its start and end
timestamps. It sits below the games-remaining visualization and above the
roster editor in the page's vertical layout.

Key behaviours:

- **Conditional render** — the whole section only appears when the matchup has
  a non-null `startTime` **or** `endTime`. When both are absent (the common
  case for matchups that have not been scheduled with explicit windows) the
  card is omitted entirely and the surrounding layout collapses without a gap.
- **Heading** — a bold "Matchup Information" label introduces the section.
- **Start line** — rendered only when `startTime` is present, as
  `Start: <localized date-time>`.
- **End line** — rendered only when `endTime` is present, as
  `End: <localized date-time>`.
- **Localized formatting** — both timestamps are formatted with
  `Date#toLocaleString()`, so the exact string reflects the viewer's locale and
  timezone.

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/matchups/detail.md`
(layout item 7 — "Matchup Information section — start/end timestamps").

## Implementation

**Shared component:** `lib/shared-components/src/features/matchup/MatchupDetailLayout.tsx`

The Matchup Information section is rendered inline by `MatchupDetailLayout`,
the cross-platform layout that composes the whole matchup detail page. The
section is gated on `hasMatchupTimes = matchup.startTime != null ||
matchup.endTime != null`; each of the Start/End lines is then independently
gated on its own field being non-null.

**Web page:** `apps/web/src/pages/matchup/MatchupDetailPage.tsx` renders
`MatchupDetailLayout` with the matchup fetched via `useMatchupById`.

| Component / hook      | File                                                                 | Purpose                                                        |
| --------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `MatchupDetailLayout` | `lib/shared-components/src/features/matchup/MatchupDetailLayout.tsx` | Renders the Matchup Information section (start/end timestamps) |
| `MatchupDetailPage`   | `apps/web/src/pages/matchup/MatchupDetailPage.tsx`                   | Web page that supplies the matchup and mounts the layout       |
| `useMatchupById`      | matchup GraphQL hook                                                 | Provides `startTime` / `endTime` on the matchup payload        |

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/matchup-information-card.spec.ts`

All GraphQL responses are mocked (`route.fulfill`) so no live backend is
required; the matchup fixture supplies non-null `startTime` / `endTime` so the
card actually renders (the sibling `matchup-detail.spec.ts` leaves both null,
which is why the card needs its own spec).

`describe('Matchup Information card – timestamps @regression')`:

- Shows the "Matchup Information" heading
- Shows the matchup start timestamp (`Start:` line, formatted)
- Shows the matchup end timestamp (`End:` line, formatted)

`describe('Matchup Information card – hidden without timestamps @regression')`:

- Does not render the card when start and end times are null (page still
  renders; the section is omitted)

## Related

- **Epic:** LS-5260 — QA — Page: Baseball Matchup Detail
- **Source doc:** `docs/agents/pages/baseball/league/detail/matchups/detail.md`
- **Sibling spec:** `apps/web-e2e/src/tests/matchup-detail.spec.ts` (scoreboard,
  navigation, loading/error/not-found states — nulls the matchup timestamps, so
  it does not exercise this card)
