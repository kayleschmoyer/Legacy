# Feature Discovery Gaps — baseball-home

**Jira:** LS-7593
**Page:** `baseball-home` (Epic LS-5258)
**Type:** Feature Discovery Bucket

## Description

Catch-all bucket for features discovered via code audit (Step 0.4) that were missed in the
original page-doc-driven feature extraction. Each GAP-### entry below represents a feature that
exists in code but was never enumerated in the QA inventory.

This bucket exists for parent-tree correctness only. Engineers may promote individual GAP items
into their own Feature Stories if they want to track future findings under them.

## Source

Extracted from: code audit of `lib/shared-components/src/features/baseball/MLBHome.tsx`,
`apps/app/src/app/(app)/baseball/index.tsx`, and
`apps/web/src/components/baseball/BaseballScreen.tsx`

---

## GAP-001: Mock Draft CTA Button

**What it does:** Optional button in the hero section navigating users to a draft simulator.
Visible only when the `onMockDraft` callback is provided (currently wired on mobile only).

**Implementation:**

- `lib/shared-components/src/features/baseball/MLBHome.tsx` lines 338–351 (compact hero), 448–461 (full hero)
- Prop: `MLBHomeProps.onMockDraft?: () => void`

**Platforms:** Mobile (web wrapper omits callback)
**Test coverage:** None

---

## GAP-002: Live Scores / Scoreboard CTA Button

**What it does:** Optional button in the hero section linking to a live scoreboard/games view.
Renders only when `onScoreboard` callback is provided.

**Implementation:**

- `lib/shared-components/src/features/baseball/MLBHome.tsx` lines 352–365 (compact hero), 462–475 (full hero)
- Prop: `MLBHomeProps.onScoreboard?: () => void`
- Mobile wrapper: `apps/app/src/app/(app)/baseball/index.tsx` line 181
- Web wrapper: `apps/web/src/components/baseball/BaseballScreen.tsx` line 152

**Platforms:** Both (web and mobile)
**Test coverage:** None

---

## GAP-003: Invite Friends CTA Button (Mobile-only)

**What it does:** Native share sheet integration for sharing league invite codes. Opens a modal
listing all user leagues for selection, then invokes the native Share API.

**Implementation:**

- `lib/shared-components/src/features/baseball/MLBHome.tsx` lines 636–650
- `apps/app/src/app/(app)/baseball/index.tsx` lines 34–104 (`shareLeagueInvite()` + modal UI)
- Prop: `MLBHomeProps.onInviteFriends?: () => void`

**Platforms:** Mobile only (web wrapper omits callback)
**Test coverage:** None

---

## GAP-004: Advanced League Settings Link (Quick-Create Dialog)

**What it does:** Link inside the quick-create dialog that exits the modal and navigates to the
full league creation form (`/baseball/league/create`) with the league name pre-filled.

**Implementation:**

- `lib/shared-components/src/features/baseball/CreateLeagueDialog.tsx` lines 464–478
- `apps/web/src/components/baseball/BaseballScreen.tsx` lines 156–161
- Prop: `CreateLeagueDialogProps.onAdvanced?: (leagueName: string) => void`

**Platforms:** Web only (mobile wrapper omits this prop)
**Test coverage:** None

---

## GAP-005: League Search / Filtering

**What it does:** Real-time search input that filters the league list by league name. Debounced
at 200 ms to avoid excessive re-renders. Search state resets on pagination.

**Implementation:**

- `lib/shared-components/src/features/baseball/MLBHome.tsx` lines 173–180 (debounce), 228–237 (filter logic), 688–700 (search input UI)
- Local state: `search`, `debouncedSearch`
- Filters both active and archived leagues independently

**Platforms:** Both
**Test coverage:** None

---

## GAP-006: Archived Leagues Collapsible Section

**What it does:** Collapsed/expandable section showing frozen leagues (`tierFrozenAt` or
`frozenAt` set). Toggle shows/hides the list with a chevron indicator. Archived rows render at
reduced opacity (0.65) for visual de-emphasis.

**Implementation:**

- `lib/shared-components/src/features/baseball/MLBHome.tsx` lines 915–1015
- Local state: `showArchived` (boolean toggle)
- Detection: `archivedLeagues = leagues.filter(l => !!(l.tierFrozenAt || l.frozenAt))`

**Platforms:** Both
**Test coverage:** None

---

## GAP-007: League Status Badges (Dynamic Draft States)

**What it does:** Color-coded status badges on each league row conveying draft state, current
week, or archive status. Five badge types:

| Badge              | Color     | Condition                                |
| ------------------ | --------- | ---------------------------------------- |
| Archived           | gray      | `tierFrozenAt` or `frozenAt` set         |
| Drafting           | navy/gold | `draftStatus: 'in-progress'`             |
| Week N / In Season | green     | `draftStatus: 'completed'` + week number |
| Draft Scheduled    | amber     | `draftStatus: 'queued' \| 'not-started'` |
| Unknown            | gray      | unrecognized state                       |

**Implementation:**

- `lib/shared-components/src/features/baseball/MLBHome.tsx` lines 97–146 (`getLeagueBadge()`)
- Badge rendered at lines 706–763 (active), 943–992 (archived)

**Platforms:** Both
**Test coverage:** None

---

## GAP-008: Week Advance Status Indicators

**What it does:** Inline badges on active league rows showing week-advancement process state:

- **"Advancing"** (yellow) — `weekAdvanceStatus: 'processing' | 'queued'`
- **"Advance failed"** (red) — `weekAdvanceStatus: 'failed'`

Not shown on archived league rows.

**Implementation:**

- `lib/shared-components/src/features/baseball/MLBHome.tsx` lines 764–795
- Prop: `MLBHomeLeague.weekAdvanceStatus?: string | null`

**Platforms:** Both
**Test coverage:** None

---

## GAP-009: Pagination ("Show More Leagues") Button

**What it does:** Lazy-load pagination of the league list. Initially displays 20 leagues
(`LEAGUES_PAGE_SIZE = 20`); clicking "Show X more leagues" increments the visible count.
Pagination state resets when the search filter changes.

**Implementation:**

- `lib/shared-components/src/features/baseball/MLBHome.tsx` line 148 (constant), lines 239–246 (state), lines 817–831 (button)
- Local state: `visibleCount`

**Platforms:** Both
**Test coverage:** None

---

## GAP-010: Quick Wins Context Cards (New-User UX)

**What it does:** Two contextual info cards in the full-screen hero for users with no leagues:

- **"Build your first roster"** — Getting-started copy explaining the onboarding flow
- **"Quick Wins"** — Three bulleted tips (with cyan dot indicators) tailored to whether the
  user already has leagues

**Implementation:**

- `lib/shared-components/src/features/baseball/MLBHome.tsx` lines 210–226 (`quickWins` array), 483–544 (card UI)
- Conditional on `hasLeagues` boolean (line 286)

**Platforms:** Both
**Test coverage:** None

---

## GAP-011: Responsive Layout Breakpoints

**What it does:** Tamagui breakpoint props (`$gtSm`, `$gtMd`) reflow the UI across viewport
sizes:

- **Phone (default):** Stacked layout, narrower padding
- **Tablet (`$gtSm`):** Increased padding, flexbox wrap
- **Desktop (`$gtMd`):** Side-by-side layouts, row alignments

**Implementation:**

- Throughout `lib/shared-components/src/features/baseball/MLBHome.tsx`: lines 283, 298–303, 380–381, 661–665, 732, 962

**Platforms:** Both
**Test coverage:** None (viewport mocking required)

---

## Related

- **Epic:** LS-5258 — QA — Page: Baseball Home
- **Main component:** `lib/shared-components/src/features/baseball/MLBHome.tsx`
- **Mobile data wrapper:** `apps/app/src/app/(app)/baseball/index.tsx`
- **Web data wrapper:** `apps/web/src/components/baseball/BaseballScreen.tsx`
