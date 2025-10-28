# League Invite Code System Implementation Guide

## Overview

This document outlines the complete implementation of an invite code system for joining leagues in the Legacy Sports application.

## Database Changes

### Migration File Created

**File**: `lib/db-client/migrations/0008_add_invite_code_to_leagues.sql`

This migration:

- Adds `invite_code` column (8-character VARCHAR, UNIQUE, NOT NULL)
- Creates a PostgreSQL function to generate random invite codes
- Populates existing leagues with unique codes
- Adds an index for fast lookups

### Drizzle Schema Update

**File**: `lib/db-client/src/drizzle/public/models/Leagues.ts`

Updated the `leagues` table definition to include:

```typescript
inviteCode: varchar('invite_code', { length: 8 }).notNull().unique(),
```

## Backend (GraphQL) Changes

### Files Modified

1. **`lambdas/db/src/schema/leagues.ts`**

#### Changes Needed (Partially Implemented):

1. **Helper Functions Added** ✅
   - `generateInviteCode()`: Generates random 8-character codes
   - `isInviteCodeUnique()`: Checks if code exists
   - `generateUniqueInviteCode()`: Generates unique codes with retry logic

2. **League Type Updated** ✅
   - Added `inviteCode: string` field to League GraphQL type

3. **Queries to Update** ⚠️ (Need to add `inviteCode` to SELECT statements)
   - `league` query - line 277 ✅ DONE
   - `userLeagues` query - line 361 ✅ DONE
   - Need to find and update remaining queries that fetch leagues

4. **Create League Mutation** ⚠️ (line ~589)
   - Add invite code generation before inserting league

   ```typescript
   const inviteCode = await generateUniqueInviteCode(db);
   const leagueData = {
     name: args.input.leagueName,
     owner: userId,
     maxRosterSize: args.input.maxRosterSize,
     currentMatchup: null,
     inviteCode: inviteCode, // ADD THIS
   };
   ```

5. **Start Draft Mutation** ⚠️ (line ~1002)
   - Add `inviteCode` to the SELECT statement when fetching league after draft

6. **New Mutation to Add**: `joinLeagueByCode` ❌ NOT STARTED

   ```typescript
   builder.mutationField('joinLeagueByCode', (t) =>
     t.field({
       type: JoinLeaguePayload,
       args: {
         inviteCode: t.arg.string({ required: true }),
         teamName: t.arg.string({ required: true }),
       },
       resolve: async (parent, args, context) => {
         // Implementation:
         // 1. Find league by invite code
         // 2. Check if user is already a member
         // 3. Create team for the user
         // 4. Add user to league_members
         // 5. Return the team and league info
       },
     }),
   );
   ```

7. **New Query to Add**: `validateInviteCode` ❌ NOT STARTED
   ```typescript
   builder.queryField('validateInviteCode', (t) =>
     t.field({
       type: League,
       nullable: true,
       args: {
         code: t.arg.string({ required: true }),
       },
       resolve: async (parent, args, context) => {
         // Look up league by invite code
         // Return league info or null
       },
     }),
   );
   ```

## Frontend Changes

### Files to Modify/Create

#### 1. Update League Detail Page ⚠️ PARTIALLY DONE

**File**: `apps/web/src/components/baseball/LeagueDetailPage.tsx`

Current state: Shows full URL link
Needed: Update to show invite code instead

```typescript
// CHANGE FROM:
{
  `${window.location.origin}/baseball/league/${leagueId}`;
}

// TO:
{
  league.inviteCode;
}

// Update button text and instructions accordingly
```

#### 2. Create Join League Component ❌ NOT STARTED

**File**: `apps/web/src/components/baseball/JoinLeagueByCode.tsx`

```typescript
export function JoinLeagueByCode() {
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);

  // GraphQL mutation: useJoinLeagueByCodeMutation()

  const handleJoin = async () => {
    // Validate inputs
    // Call mutation
    // Redirect to league page on success
  };

  return (
    // Form with:
    // - Invite code input (8 characters, uppercase)
    // - Team name input
    // - Join button
    // - Error handling UI
  );
}
```

#### 3. Add Route ❌ NOT STARTED

**File**: `apps/web/src/app/app.tsx`

Add route:

```typescript
<Route path="/join-league" element={<JoinLeagueByCode />} />
```

#### 4. GraphQL Schema Regeneration ❌ NOT STARTED

After backend changes are complete, regenerate the TypeScript types:

```bash
pnpm run codegen
```

This will create:

- `useJoinLeagueByCodeMutation`
- `useValidateInviteCodeQuery`
- Updated `League` type with `inviteCode`

## Deployment Steps

### 1. Backend Deployment

```bash
# 1. Run the migration
pnpm run migrate:production

# 2. Build and deploy the lambda
cd lambdas/db
pnpm run build
pnpm run deploy  # or your deployment command

# 3. Regenerate GraphQL schema
cd ../../
pnpm run codegen
```

### 2. Frontend Deployment

```bash
# Build and deploy web app
cd apps/web
pnpm run build
pnpm run deploy  # or your deployment command
```

## Testing Checklist

### Database

- [ ] Migration runs successfully
- [ ] Existing leagues have unique invite codes
- [ ] New leagues get invite codes automatically
- [ ] Invite codes are unique (constraint works)

### Backend (GraphQL)

- [ ] `league` query returns inviteCode
- [ ] `userLeagues` query returns inviteCodes
- [ ] `createLeagueAndTeams` generates unique invite code
- [ ] `joinLeagueByCode` mutation works correctly
- [ ] `validateInviteCode` query finds leagues
- [ ] Error handling for invalid codes
- [ ] Can't join same league twice

### Frontend

- [ ] League detail page shows invite code
- [ ] Copy button works
- [ ] Join league page accessible
- [ ] Can enter invite code
- [ ] Form validation works
- [ ] Successfully joins league
- [ ] Redirects to league after joining
- [ ] Shows appropriate error messages

## Remaining Work

### Critical (Must Do)

1. ✅ Create migration file
2. ✅ Update Drizzle schema
3. ⚠️ Fix all GraphQL queries to include inviteCode
4. ⚠️ Add inviteCode generation in createLeagueAndTeams
5. ❌ Implement joinLeagueByCode mutation
6. ❌ Implement validateInviteCode query
7. ❌ Create JoinLeagueByCode component
8. ❌ Add routing for join page
9. ❌ Update League Detail Page to show code

### Optional (Nice to Have)

- [ ] Add invite code to league creation response
- [ ] Add ability to regenerate invite codes
- [ ] Add usage analytics for invite codes
- [ ] Email invitations with invite codes
- [ ] QR code generation for invite codes

## Code Status Summary

✅ **Completed:**

- Database migration file created
- Drizzle schema updated
- Helper functions for code generation added
- GraphQL League type updated with inviteCode field
- Two queries updated to select inviteCode

⚠️ **In Progress:**

- Fixing remaining queries/mutations to include inviteCode

❌ **Not Started:**

- joinLeagueByCode mutation implementation
- validateInviteCode query implementation
- JoinLeagueByCode frontend component
- Route configuration
- Frontend UI updates

## Next Steps

Due to the complexity and number of remaining changes, here's the recommended approach:

1. **Complete Backend First:**
   - Fix all type errors in `leagues.ts`
   - Implement `joinLeagueByCode` mutation
   - Implement `validateInviteCode` query
   - Run migration on development database
   - Test with GraphQL playground

2. **Regenerate Frontend Types:**
   - Run `pnpm run codegen`
   - Verify new types are generated

3. **Implement Frontend:**
   - Create JoinLeagueByCode component
   - Update LeagueDetailPage
   - Add routing
   - Test end-to-end flow

4. **Deploy:**
   - Test in staging environment
   - Deploy to production

## Estimated Time

- Backend completion: 2-3 hours
- Frontend implementation: 2-3 hours
- Testing & deployment: 1-2 hours
- **Total: 5-8 hours**
