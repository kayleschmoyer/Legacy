# Season Draft Game

A turn-based drafting game where players select baseball player + season combinations to fill roster positions. Scoring is based solely on home runs hit in that season with position eligibility validation.

## Overview

The Season Draft Game is a standalone game type (separate from traditional fantasy leagues/matchups) that allows 2-6 human players to compete in a draft-style format where they select historical baseball seasons to fill their rosters.

### Key Features

- **Turn-based drafting**: Players take turns selecting baseball players + seasons
- **9 roster positions per player**: 1B, 2B, 3B, SS, OF (3 slots), C, UT (utility)
- **Position eligibility validation**: Players only score HRs if they had eligibility at that position in that season
- **Player autocomplete**: Search functionality for finding baseball players
- **Year validation**: 4-digit numeric input for season selection
- **Real-time scoring**: Automatic calculation based on season_batting and season_fielding data

## Architecture

### Database Schema

Located in: [`lib/db-client/src/drizzle/public/models/SeasonDraftGame.ts`](../../lib/db-client/src/drizzle/public/models/SeasonDraftGame.ts)

**Tables:**

1. **season_draft_games** - Main game table
   - Game metadata (name, status, created_by)
   - Current turn tracking
   - Number of players (2-6)
   - Timestamps (created, started, completed)

2. **season_draft_players** - Human players in the game
   - Links to users table
   - Draft order (0-indexed)
   - Total score (cumulative score)
   - Display name

3. **season_draft_roster_slots** - Position slots for each player
   - 9 slots per player (1B, 2B, 3B, SS, OFÃ—3, C, UT)
   - Tracks filled/unfilled status
   - One-to-one with picks

4. **SEASON_DRAFT_PICKs** - Completed draft picks
   - Baseball player ID (from players table)
   - Season (year)
   - Position (for eligibility checking)
   - Stat value (cached)
   - Pick number (sequential)

### Business Logic

Service layer: [`lib/db-client/src/lib/services/SeasonDraftGameService.ts`](../../lib/db-client/src/lib/services/SeasonDraftGameService.ts)

**Key Methods:**

- `createGame()` - Initialize game with players and roster slots
- `startGame()` - Transition from setup â†’ drafting
- `getGameState()` - Fetch complete game state with rosters and picks
- `makePick()` - Execute a draft pick with validation
- `getStatValueForPlayerSeasonPosition()` - Calculate HR score with position eligibility

**Position Eligibility Logic:**

```typescript
// Check season_fielding for position eligibility
const hasEligibility = fieldingStats.some((stat) => {
  if (position === 'OF') {
    return ['LF', 'CF', 'RF'].includes(stat.pos);
  }
  if (position === 'UT') {
    return true; // Utility accepts any position
  }
  return stat.pos === position;
});

// If no eligibility â†’ return 0 HR
// If has eligibility â†’ return season_batting.hr
```

### GraphQL API

Schema: [`lambdas/db/src/schema/season-draft-game.ts`](../../lambdas/db/src/schema/season-draft-game.ts)

**Types:**

- `SeasonDraftGame` - Full game state
- `SeasonDraftPlayer` - Player with roster
- `SeasonDraftRosterSlot` - Position slot with optional pick
- `SeasonDraftGameStatus` - Enum (setup, drafting, completed, cancelled)

**Queries:**

- `SeasonDraftGame(gameId)` - Get full game state
- `SeasonDraftGames` - List games for current user
- `SeasonDraftGamePlayerSeasonHomeRuns(playerId, season, position)` - Preview HRs

**Mutations:**

- `createSeasonDraftGame(name, playerNames, userIds)` - Create new game
- `startSeasonDraftGame(gameId)` - Begin drafting
- `makeSeasonDraftPick(gameId, rosterSlotId, playerId, season, position)` - Make pick

### UI Components

Component: [`lib/shared-components/src/features/season-draft/SeasonDraftGame.tsx`](../../lib/shared-components/src/features/season-draft/SeasonDraftGame.tsx)

**Features:**

- Turn indicator (shows whose turn it is)
- Draft interface (only visible on your turn)
  - Player search with autocomplete
  - Year input (4-digit validation)
  - Position selection (buttons for unfilled slots)
  - Preview (shows HR count before confirming)
- Live scoreboard (sorted by total score)
- Roster view (all players' rosters with filled positions)
- Draft history (chronological pick log)

## Usage

### Creating a Game

```typescript
import { useMutation } from '@apollo/client';
import { CREATE_season_draft_game_MUTATION } from '@legacy-sports/shared-components';

const [createGame] = useMutation(CREATE_season_draft_game_MUTATION);

const gameId = await createGame({
  variables: {
    name: 'Sunday HR Draft',
    playerNames: ['Alice', 'Bob', 'Charlie'],
    userIds: [1, 2, 3],
  },
});
```

### Starting a Game

```typescript
import { useMutation } from '@apollo/client';
import { START_season_draft_game_MUTATION } from '@legacy-sports/shared-components';

const [startGame] = useMutation(START_season_draft_game_MUTATION);

await startGame({
  variables: { gameId: 123 },
});
```

### Making a Pick

```typescript
import { useMutation } from '@apollo/client';
import { MAKE_SEASON_DRAFT_PICK_MUTATION } from '@legacy-sports/shared-components';

const [makePick] = useMutation(MAKE_SEASON_DRAFT_PICK_MUTATION);

await makePick({
  variables: {
    gameId: 123,
    rosterSlotId: 456, // Which position slot to fill
    playerId: 789, // Baseball player ID
    season: 2023, // Year
    position: '1B', // Position for eligibility check
  },
});
```

### Rendering the UI

```tsx
import React from 'react';
import { SeasonDraftGame } from '@legacy-sports/shared-components';

export const SeasonDraftGamePage = () => {
  return (
    <SeasonDraftGame
      gameId={123}
      currentUserId={1}
      onBack={() => navigation.goBack()}
    />
  );
};
```

## Game Flow

1. **Setup Phase**
   - Game creator initializes game with player names and user IDs
   - System creates 9 roster slots per player
   - Status: `setup`

2. **Start Game**
   - Game transitions to `drafting` status
   - Current turn set to player with draftOrder = 0

3. **Drafting Phase**
   - Players take turns selecting player + season + position
   - System validates:
     - Is it the player's turn?
     - Is the roster slot unfilled?
     - Is the year valid (4 digits)?
   - System calculates HRs based on position eligibility
   - System updates:
     - Creates pick record
     - Marks roster slot as filled
     - Updates player's total score
     - Advances turn to next player

4. **Completion**
   - Game completes when all roster slots filled (9 Ã— numPlayers)
   - Status transitions to `completed`
   - Final scores visible in scoreboard

## Position Eligibility Rules

- **Standard positions** (1B, 2B, 3B, SS, C): Exact match required in season_fielding
- **OF positions**: Player must have played LF, CF, or RF in that season
- **UT (Utility)**: Accepts any position (always eligible if player has any fielding data)

## Scoring

Scoring is straightforward:

- **HR count** from `season_batting.hr` for that player + season
- **Position eligibility** must be validated via `season_fielding.pos`
- **No HRs awarded** if player didn't play that position in that season

## Example Scenarios

### Valid Pick

```
Player: Babe Ruth
Season: 1927
Position: OF
Result: 60 HR (Ruth played RF in 1927 and hit 60 HR)
```

### Invalid Pick (Position Mismatch)

```
Player: Mariano Rivera
Season: 2004
Position: 1B
Result: 0 HR (Rivera was a pitcher, never played 1B)
```

### Valid Pick (Utility)

```
Player: Any player
Season: Any season
Position: UT
Result: HR count from season_batting (as long as player has any fielding data)
```

## Database Migrations

To add this feature to your database, you'll need to create a migration with the schema defined in `SeasonDraftGame.ts`.

**Migration checklist:**

1. Create enum type `season_draft_game_status`
2. Create table `season_draft_games`
3. Create table `season_draft_players`
4. Create table `season_draft_roster_slots`
5. Create table `SEASON_DRAFT_PICKs`
6. Add foreign key constraints
7. Add indexes for performance

## Testing

### Manual Testing Checklist

- [ ] Create game with 2-6 players
- [ ] Start game transitions status correctly
- [ ] Turn advances after each pick
- [ ] Player search/autocomplete works
- [ ] Year validation (4 digits, reasonable range)
- [ ] Position eligibility validation works
- [ ] HR preview shows correct values
- [ ] HRs = 0 when position mismatch
- [ ] Roster slots fill correctly
- [ ] Scoreboard updates in real-time
- [ ] Game completes when all slots filled
- [ ] Game prevents picks when not your turn
- [ ] Game prevents duplicate slot fills

### Integration Tests

Service tests should cover:

- Game creation with various player counts
- Position eligibility logic (OF, UT, standard positions)
- Turn management and validation
- HR calculation accuracy
- Game completion detection

GraphQL tests should cover:

- Authentication requirements
- Query/mutation permissions
- Error handling (invalid inputs)
- Real-time updates

## Future Enhancements

Potential improvements:

- **Snake draft order** - Reverse order on even rounds
- **Time limits** - Add draft clock per pick
- **Player stats preview** - Show career stats during selection
- **Multiple scoring stats** - Add RBI, SB, etc. options
- **Playoff format** - Tournament bracket after drafting
- **Live notifications** - Push notifications for turn changes
- **Draft history replay** - Visual timeline of picks
- **Advanced filters** - Filter players by position, era, team

## Dependencies

- Database: PostgreSQL with Drizzle ORM
- GraphQL: Apollo Server + Pothos schema builder
- UI: React Native + Tamagui
- Data: Uses existing `players`, `season_batting`, `season_fielding` tables

## Related Documentation

- [Database Schema](../architecture/database-schema.md)
- [GraphQL Integration](../architecture/graphql-integration.md)
- [Position Models](../../lib/shared-components/src/utils/PositionModels.ts)
- [Statistics Service](../../lib/db-client/src/lib/services/StatisticsService.ts)
