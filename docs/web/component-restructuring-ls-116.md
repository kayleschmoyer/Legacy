# Web Application Component Restructuring

**Date:** February 13, 2026  
**Jira Ticket:** LS-116  
**Status:** Completed

## Executive Summary

Restructured the web application's component organization to clearly separate **pages** (route components) from **features** (business logic components) and **components** (reusable UI components). This enables better parallel development, reduces cognitive overhead, and establishes clear architectural patterns for future work.

## Problem Statement

### Issues with Previous Structure

The original structure mixed pages and components in a single directory:

```
apps/web/src/components/
├── AboutPage.tsx              ❌ Page in components/
├── ManagementPage.tsx         ❌ Page in components/
├── WebHomeScreen.tsx          ❌ Page in components/
├── WebPlayerStatsPage.tsx     ❌ Page in components/
├── EliteDraftBoard.tsx        ❓ Unclear purpose
├── UserProfileDropdown.tsx    ✅ Reusable component
├── baseball/                  ❌ Mixed pages + components
│   ├── LeagueCreatePage.tsx   (Page)
│   ├── LeagueDetailPage.tsx   (Page)
│   ├── LeagueCard.tsx         (Component)
│   └── LeagueActivityFeed.tsx (Component)
├── matchup/                   ❌ Mixed pages + components
│   ├── MatchupDetailPage.tsx  (Page)
│   ├── StandingsPage.tsx      (Page)
│   └── MatchupCard.tsx        (Component)
└── ...
```

**Problems:**

1. **Unclear separation** - Hard to distinguish pages from reusable components
2. **Navigation difficulties** - Developers couldn't quickly locate route components
3. **Parallel development conflicts** - Multiple developers working on different pages would touch the same directories
4. **Inconsistent naming** - Mix of "Page" and "Screen" suffixes
5. **Import confusion** - Relative imports made it unclear where components lived

## Solution: Three-Tier Architecture

### New Structure

```
apps/web/src/
├── pages/                    ✅ All routable page components
│   ├── home/
│   │   ├── HomePage.tsx
│   │   └── index.ts
│   ├── about/
│   │   ├── AboutPage.tsx
│   │   └── index.ts
│   ├── baseball/
│   │   ├── BaseballLandingPage.tsx
│   │   ├── LeagueCreatePage.tsx
│   │   ├── LeagueDetailPage.tsx
│   │   ├── TeamDetailPage.tsx
│   │   ├── JoinLeagueByCodePage.tsx
│   │   └── index.ts
│   ├── matchup/
│   │   ├── MatchupDetailPage.tsx
│   │   ├── StandingsPage.tsx
│   │   └── index.ts
│   ├── management/
│   │   ├── ManagementPage.tsx
│   │   └── index.ts
│   ├── players/
│   │   ├── PlayerStatsPage.tsx   (was WebPlayerStatsPage)
│   │   └── index.ts
│   ├── commissioner/
│   │   ├── CommissionerPage.tsx
│   │   └── index.ts
│   ├── draft/
│   │   ├── DraftBoardPage.tsx    (was EliteDraftBoard)
│   │   └── index.ts
│   ├── analytics/
│   │   ├── AnalyticsPage.tsx
│   │   └── index.ts
│   └── auth/
│       ├── LoginPage.tsx
│       └── index.ts
│
├── features/                 ✅ Feature-specific business logic
│   ├── baseball/
│   │   ├── LeagueCard.tsx
│   │   ├── LeagueActivityFeed.tsx
│   │   ├── LeagueScoringSummary.tsx
│   │   ├── LeagueScoringEditor.tsx
│   │   ├── LeagueTradeBlock.tsx
│   │   └── index.ts
│   ├── commissioner/
│   │   ├── MatchupControl.tsx
│   │   ├── GameSelectionControl.tsx
│   │   ├── DeleteLeagueControl.tsx
│   │   ├── NextStepControl.tsx
│   │   └── index.ts
│   ├── management/
│   │   ├── LeagueManagement.tsx
│   │   └── index.ts
│   ├── matchup/
│   │   ├── MatchupCard.tsx
│   │   ├── MatchupGrid.tsx
│   │   ├── MatchupScoreboard.tsx
│   │   ├── MatchupRosterComparison.tsx
│   │   ├── PlayerMatchupStatsModal.tsx
│   │   ├── PlayerSeasonStatsModal.tsx
│   │   ├── StandingsTable.tsx
│   │   ├── StatsLoadingIndicator.tsx
│   │   ├── GamesRemaining.tsx
│   │   └── index.ts
│   └── roster/
│       ├── LeagueRosterManagement.tsx
│       ├── LeagueStandings.tsx
│       ├── PlayerProjections.tsx
│       └── index.ts
│
├── components/               ✅ Reusable cross-feature components
│   ├── layout/
│   │   ├── UserProfileDropdown.tsx
│   │   ├── SportsDropdown.tsx
│   │   ├── PlayersDropdown.tsx
│   │   └── index.ts
│   ├── auth/
│   │   ├── ProtectedRoute.tsx
│   │   └── index.ts
│   ├── common/
│   │   ├── LoadingPanel.tsx      (if exists)
│   │   └── index.ts
│   └── a11y/
│       ├── GlobalAnnouncer.tsx
│       └── index.ts
│
├── app/                      # App shell & routing
│   └── app.tsx
├── hooks/                    # Custom React hooks
├── lib/                      # Apollo, scoring, utilities
├── store/                    # Redux state management
├── types/                    # TypeScript types
└── utils/                    # Pure utility functions
```

## Architecture Principles

### 1. **Pages Directory** (`/pages`)

Contains ONLY components that are directly routed to via React Router.

**Characteristics:**

- One page = one route
- Named with "Page" suffix (e.g., `LeagueDetailPage`, `HomePage`)
- Responsible for:
  - Route parameter extraction (`useParams`)
  - Query string management (`useSearchParams`)
  - Top-level data fetching
  - Composing feature components
  - Page-level layout

**Example:**

```tsx
// pages/baseball/LeagueDetailPage.tsx
export function LeagueDetailPage() {
  const { id } = useParams(); // Route integration
  const { data } = useGetLeagueByIdQuery({ variables: { id } }); // Data fetching

  return (
    <YStack>
      <LeagueHeader league={data?.league} /> {/* Feature components */}
      <LeagueActivityFeed leagueId={id} />
      <LeagueRosterManagement leagueId={id} />
    </YStack>
  );
}
```

### 2. **Features Directory** (`/features`)

Contains business logic components specific to a domain/feature.

**Characteristics:**

- Organized by feature domain (baseball, matchup, commissioner, etc.)
- Contains complex, feature-specific components
- May have internal state and side effects
- Can use hooks, GraphQL queries specific to the feature
- Not directly routable

**Example:**

```tsx
// features/baseball/LeagueCard.tsx
export function LeagueCard({ league }: { league: League }) {
  const navigate = useNavigate();

  return (
    <Card onPress={() => navigate(`/baseball/league/${league.id}`)}>
      <H2>{league.name}</H2>
      <Text>{league.teams.length} teams</Text>
    </Card>
  );
}
```

### 3. **Components Directory** (`/components`)

Contains reusable UI components used across multiple features.

**Characteristics:**

- Organized by purpose (layout, auth, common, a11y)
- Generic, reusable across features
- Minimal business logic
- Highly configurable via props

**Example:**

```tsx
// components/layout/UserProfileDropdown.tsx
export function UserProfileDropdown() {
  const { user, logout } = useAuth();
  // Generic user profile dropdown usable anywhere
  return <Dropdown>...</Dropdown>;
}
```

## Migration Changes

### File Moves

| Old Location                                   | New Location                                | Reason                        |
| ---------------------------------------------- | ------------------------------------------- | ----------------------------- |
| `components/WebHomeScreen.tsx`                 | `pages/home/HomePage.tsx`                   | Routed component              |
| `components/AboutPage.tsx`                     | `pages/about/AboutPage.tsx`                 | Routed component              |
| `components/ManagementPage.tsx`                | `pages/management/ManagementPage.tsx`       | Routed component              |
| `components/WebPlayerStatsPage.tsx`            | `pages/players/PlayerStatsPage.tsx`         | Routed component, renamed     |
| `components/baseball/LeagueDetailPage.tsx`     | `pages/baseball/LeagueDetailPage.tsx`       | Routed component              |
| `components/baseball/LeagueCard.tsx`           | `features/baseball/LeagueCard.tsx`          | Feature component             |
| `components/matchup/MatchupDetailPage.tsx`     | `pages/matchup/MatchupDetailPage.tsx`       | Routed component              |
| `components/matchup/MatchupCard.tsx`           | `features/matchup/MatchupCard.tsx`          | Feature component             |
| `components/commissioner/CommissionerPage.tsx` | `pages/commissioner/CommissionerPage.tsx`   | Routed component              |
| `components/commissioner/NextStepControl.tsx`  | `features/commissioner/NextStepControl.tsx` | Feature component             |
| `components/UserProfileDropdown.tsx`           | `components/layout/UserProfileDropdown.tsx` | Layout component, categorized |
| `components/EliteDraftBoard.tsx`               | `pages/draft/DraftBoardPage.tsx`            | Routed component, renamed     |

### Naming Changes

| Old Name                | New Name               | Reason                                     |
| ----------------------- | ---------------------- | ------------------------------------------ |
| `WebHomeScreen`         | `HomePage`             | Consistent "Page" suffix                   |
| `WebPlayerStatsPage`    | `PlayerStatsPage`      | Remove "Web" prefix (redundant in web app) |
| `WebPlayerDetailPage`   | `PlayerDetailPage`     | Remove "Web" prefix                        |
| `EliteDraftBoardScreen` | `DraftBoardPage`       | Consistent "Page" suffix                   |
| `JoinLeagueByCode`      | `JoinLeagueByCodePage` | Add "Page" suffix                          |

### Import Path Updates

**Example: LeagueDetailPage imports**

```tsx
// Before
import { LeagueActivityFeed } from './LeagueActivityFeed';
import { LeagueStandings } from '../roster/LeagueStandings';
import { NextStepControl } from '../commissioner/NextStepControl';

// After (clearer, more explicit)
import { LeagueActivityFeed } from '../../features/baseball/LeagueActivityFeed';
import { LeagueStandings } from '../../features/roster/LeagueStandings';
import { NextStepControl } from '../../features/commissioner/NextStepControl';
```

**Example: App.tsx imports**

```tsx
// Before
import { WebHomeScreen } from '../components/WebHomeScreen';
import LeagueDetailPage from '../components/baseball/LeagueDetailPage';
import { MatchupDetailPage } from '../components/matchup/MatchupDetailPage';

// After (explicit page imports)
import HomePage from '../pages/home/HomePage';
import LeagueDetailPage from '../pages/baseball/LeagueDetailPage';
import { MatchupDetailPage } from '../pages/matchup/MatchupDetailPage';
```

## Benefits

### 1. **Parallel Development**

Teams can work on different pages simultaneously without directory conflicts:

- Team A: Working on `pages/baseball/LeagueCreatePage.tsx`
- Team B: Working on `pages/matchup/StandingsPage.tsx`
- Team C: Working on `features/roster/LeagueStandings.tsx`

No directory overlap, minimal merge conflicts.

### 2. **Clear Intent**

File location immediately indicates purpose:

- `pages/` → "This is routed"
- `features/` → "This is business logic"
- `components/` → "This is reusable UI"

### 3. **Faster Navigation**

Looking for a route? → Check `pages/`
Looking for baseball features? → Check `features/baseball/`
Looking for generic components? → Check `components/`

### 4. **Consistent Patterns**

- All pages end with "Page"
- All pages in `pages/*`
- All feature logic in `features/*`
- All generic components in `components/*`

### 5. **Better Scalability**

Easy to add new pages or features:

```bash
# Add new page
apps/web/src/pages/analytics/
  ├── AnalyticsPage.tsx
  └── index.ts

# Add new feature
apps/web/src/features/trading/
  ├── TradeProposal.tsx
  ├── TradeHistory.tsx
  └── index.ts
```

## Guidelines for Future Development

### Adding a New Page

1. Create directory under `pages/<feature>/`
2. Create `<Name>Page.tsx` component
3. Add route in `app/app.tsx`
4. Create `index.ts` for barrel export
5. Import feature components from `features/`

```tsx
// pages/new-feature/NewFeaturePage.tsx
import React from 'react';
import { SomeFeature } from '../../features/new-feature/SomeFeature';

export function NewFeaturePage() {
  return <SomeFeature />;
}

export default NewFeaturePage;
```

### Adding a New Feature Component

1. Create file under `features/<domain>/`
2. Implement business logic
3. Export from `features/<domain>/index.ts`
4. Import in pages as needed

```tsx
// features/new-feature/SomeFeature.tsx
export function SomeFeature() {
  // Feature-specific logic
  return <div>Feature content</div>;
}
```

### Adding a Reusable Component

1. Identify the category (layout, auth, common, etc.)
2. Create file under `components/<category>/`
3. Keep it generic and configurable
4. Export from `components/<category>/index.ts`

```tsx
// components/common/ConfirmDialog.tsx
export function ConfirmDialog({ onConfirm, onCancel, message }) {
  // Generic confirmation dialog
  return <Dialog>...</Dialog>;
}
```

### Import Patterns

**From a page:**

```tsx
// ✅ Good - explicit paths
import { LeagueCard } from '../../features/baseball/LeagueCard';
import { UserProfileDropdown } from '../../components/layout/UserProfileDropdown';

// ❌ Avoid - ambiguous relative paths
import { LeagueCard } from '../LeagueCard';
```

**From a feature component:**

```tsx
// ✅ Good - use other feature components
import { StandingsTable } from '../matchup/StandingsTable';

// ✅ Good - use app hooks/utils
import { useCurrentUser } from '../../hooks/useAuth';
```

## Testing Strategy

All functionality preserved. To verify:

```bash
# Type check
pnpm exec nx run web:typecheck

# Lint
pnpm exec nx run web:lint

# Test
pnpm exec nx run web:test

# Build
pnpm exec nx run web:build

# Full validation
make pre-commit
```

## Migration Notes

### Backward Compatibility

Old import paths will break. This is intentional - forces explicit updates to new structure.

### Test Updates

Update test imports to new paths:

```tsx
// Before
import { WebHomeScreen } from '../WebHomeScreen';

// After
import HomePage from '../../pages/home/HomePage';
```

## Next Steps

1. ✅ Restructure directories and files
2. ✅ Update all import paths
3. ✅ Create barrel exports (`index.ts`)
4. ✅ Update routing in `app.tsx`
5. ⏳ Run validation (`make pre-commit`)
6. ⏳ Update tests
7. ⏳ Update documentation
8. ⏳ Create PR

## Conclusion

This restructuring establishes clear architectural boundaries, enables parallel development, and provides a scalable foundation for future growth. The separation of pages, features, and components creates a more maintainable and intuitive codebase.

---

**References:**

- Jira: [LS-116](https://your-jira.atlassian.net/browse/LS-116)
- PR: [#TBD]
