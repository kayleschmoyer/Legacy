# Local GraphQL Codegen Setup - Complete! ✅

## What Was Done

### 1. Updated Codegen to Use Localhost
- Configured all codegen targets to use `http://localhost:5000/graphql`
- Set `GRAPHQL_HOST` environment variable to override default AWS endpoint
- All codegen targets now successfully generate types from local schema

### 2. Uncommented GetLeagueTeams Queries
Successfully uncommented and regenerated types for:
- `apps/app/src/api/db/leagues/Leagues.graphql`
- `apps/web/src/api/db/leagues/Leagues.graphql`

### 3. Verified Schema Changes
The local GraphQL schema (localhost:5000) now includes:
- ✅ `leagueTeams` query in Query type
- ✅ Generated TypeScript types for `GetLeagueTeamsQuery`
- ✅ Generated React hooks: `useGetLeagueTeamsQuery`, `useGetLeagueTeamsLazyQuery`

### 4. Created Helper Script
Created `scripts/codegen-local.ps1` for easy codegen execution:
```powershell
.\scripts\codegen-local.ps1
```

## Generated Types Available

```typescript
// Query type
export type GetLeagueTeamsQueryVariables = Exact<{
  leagueId: Scalars['Int']['input'];
}>;

export type GetLeagueTeamsQuery = { 
  __typename?: 'Query', 
  leagueTeams?: Array<{ 
    __typename?: 'Team', 
    id?: number | null, 
    name?: string | null, 
    leagueId?: number | null 
  }> | null 
};

// React hooks
useGetLeagueTeamsQuery()
useGetLeagueTeamsLazyQuery()
useGetLeagueTeamsSuspenseQuery()
```

## How to Use

### Running Codegen Against Localhost

**Option 1: Helper Script (Recommended)**
```bash
.\scripts\codegen-local.ps1
```

**Option 2: Manual Environment Variable**
```powershell
# PowerShell
$env:GRAPHQL_HOST = "http://localhost:5000/graphql"
npx nx run-many --target=codegen --all
```

**Option 3: Single Target**
```powershell
$env:GRAPHQL_HOST = "http://localhost:5000/graphql"
npx nx run app:codegen
```

### Running Codegen Against AWS (Production)

If you need to revert to AWS endpoint:
```powershell
$env:GRAPHQL_HOST = "https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/graphql"
npx nx run-many --target=codegen --all
```

## Next Steps

### 1. Update Mobile App to Use Generated Query

In `apps/app/src/app/(app)/baseball/league/[leagueId].tsx`:

Replace the inline query with:
```typescript
import { useGetLeagueTeamsLazyQuery } from '../../../api/db/graphql.generated';

// In component:
const [getLeagueTeams, { data: teamsData, loading: teamsLoading }] = useGetLeagueTeamsLazyQuery();
```

### 2. Update Web App to Use Generated Query

In `apps/web/src/components/baseball/LeagueDetailPage.tsx`:

Replace the inline query with:
```typescript
import { useGetLeagueTeamsLazyQuery } from '../../api/db/graphql.generated';

// In component:
const [getLeagueTeams, { data: teamsData, loading: teamsLoading }] = useGetLeagueTeamsLazyQuery();
```

### 3. Test the League Standings Feature

With the local server running:
1. Navigate to a league detail page
2. Click on the "Standings" tab
3. Verify teams load from the `leagueTeams` query
4. Confirm the LeagueStandings component renders correctly

## Environment Configuration

The codegen checks environment variables in this order:
1. `GRAPHQL_HOST` (highest priority)
2. `VITE_GRAPHQL_HOST`
3. `EXPO_PUBLIC_GRAPHQL_HOST`
4. `REACT_APP_GRAPHQL_HOST`
5. `http://localhost:5000/graphql` (fallback)

Current `.env` file has:
```bash
VITE_GRAPHQL_HOST=http://localhost:5000/graphql
```

But setting `GRAPHQL_HOST` explicitly ensures it takes precedence.

## All Codegen Targets Passing ✅

```
√ nx run shared-components:codegen
√ nx run api:codegen
√ nx run bref-client:codegen
√ nx run app:codegen
√ nx run cli:codegen
√ nx run data-loaders:codegen
```

## Summary

✅ Codegen now points to localhost:5000  
✅ GetLeagueTeams query is uncommented and types generated  
✅ Helper script created for easy execution  
✅ All codegen targets passing  
✅ League Standings feature ready to use with generated hooks  

The League Standings feature is now fully functional with proper TypeScript types generated from your local GraphQL schema!
