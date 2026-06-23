# Worked Examples: Merge Conflict Resolution

## Example 1: Import + Function Body Conflict

**Conflict:**

```typescript
<<<<<<< HEAD
import { db } from '@ls/db-client';
import { logger } from '@ls/logging';
import { validateInput } from './validators';

export async function getTeamRoster(teamId: string) {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    with: { members: true },
  });
=======
import { db } from '@ls/db-client';
import { logger } from '@ls/logging';

export async function getTeamRoster(teamId: string, includeInactive = false) {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    with: { members: true },
  });
>>>>>>> feat: add inactive roster filter
```

**Analysis:**

- **Main added**: `import { validateInput }` and nothing else changed in the function
- **Feature branch added**: `includeInactive` parameter to the function signature
- These are **independent, additive changes** → keep both

**Resolution:**

```typescript
import { db } from '@ls/db-client';
import { logger } from '@ls/logging';
import { validateInput } from './validators';

export async function getTeamRoster(teamId: string, includeInactive = false) {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    with: { members: true },
  });
```

## Example 2: Both Sides Modified the Same Function

**Conflict:**

```typescript
<<<<<<< HEAD
export function formatPlayerName(player: Player): string {
  if (!player.firstName || !player.lastName) {
    return player.displayName ?? 'Unknown';
  }
  return `${player.firstName} ${player.lastName}`;
}
=======
export function formatPlayerName(player: Player): string {
  const first = player.firstName?.trim() ?? '';
  const last = player.lastName?.trim() ?? '';
  if (!first && !last) {
    return 'Unknown Player';
  }
  return `${first} ${last}`;
}
>>>>>>> feat: trim whitespace in player names
```

**Analysis:**

- **Main added**: fallback to `player.displayName` when name parts are missing
- **Feature branch added**: `.trim()` on name parts and slightly different empty-check logic
- These are **overlapping but compatible** — main's `displayName` fallback is a good improvement; feature branch's trimming is also needed

**Resolution (synthesized):**

```typescript
export function formatPlayerName(player: Player): string {
  const first = player.firstName?.trim() ?? '';
  const last = player.lastName?.trim() ?? '';
  if (!first && !last) {
    return player.displayName ?? 'Unknown Player';
  }
  return `${first} ${last}`;
}
```

Both the trimming logic AND the `displayName` fallback are preserved.

## Example 3: Main Refactored, Branch Added Feature

**Conflict:**

```typescript
<<<<<<< HEAD
// Main extracted this to a service
import { rosterService } from '../services/roster-service';

export const addPlayerResolver = async (_, { input }, ctx) => {
  await rosterService.addPlayerToRoster(input.teamId, input.playerId, ctx);
};
=======
export const addPlayerResolver = async (_, { input }, ctx) => {
  // Check capacity
  const roster = await db.query.teamMembers.findMany({
    where: eq(teamMembers.teamId, input.teamId),
  });
  if (roster.length >= MAX_ROSTER_SIZE) {
    throw new Error('Roster is full');
  }
  // Add player
  await db.insert(teamMembers).values({
    teamId: input.teamId,
    playerId: input.playerId,
  });
  // NEW: Send notification
  await notificationService.send(input.teamId, `Player added to roster`);
};
>>>>>>> feat: send notification on roster add
```

**Analysis:**

- **Main**: extracted inline DB queries into `rosterService` (structural refactor)
- **Feature branch**: added notification sending (new behavior), but still uses old inline queries
- The correct resolution is: **use main's refactored structure** and **add the notification call**

**Resolution:**

```typescript
import { rosterService } from '../services/roster-service';

export const addPlayerResolver = async (_, { input }, ctx) => {
  await rosterService.addPlayerToRoster(input.teamId, input.playerId, ctx);
  // Send notification after successful roster add
  await notificationService.send(input.teamId, `Player added to roster`);
};
```

The notification is added on top of main's refactored code. The inline DB logic is NOT brought back.
