import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  smallint,
  foreignKey,
  index,
  unique,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { players } from './Players';

/**
 * Progressive Disclosure Minigame Database Schema (LS-1883)
 *
 * A minigame where facts about a baseball player are revealed one at a time.
 * The user guesses the player's identity. Fewer clues used = higher score.
 *
 * Tables defined here:
 *  - playerFactCategory  (enum)   — category of fact (career_stat, award, team_history, …)
 *  - difficultyTier      (enum)   — vague / moderate / identifying
 *  - playerFacts               — the fact pool seeded from existing stats/player data
 */

// ──────────────────────────────────────────────────────────────
// Enums
// ──────────────────────────────────────────────────────────────

export const playerFactCategory = pgEnum('player_fact_category', [
  'career_stat', // e.g. "This player hit 493 career home runs"
  'season_stat', // e.g. "Had a .367 batting average in 1994"
  'award', // e.g. "Won the MVP in 2001"
  'team_history', // e.g. "Played for the Yankees from 1996–2001"
  'transaction', // e.g. "Was traded to the Red Sox in 2004"
  'achievement', // e.g. "Is a Hall of Famer" / "14× All-Star"
]);

export const difficultyTier = pgEnum('difficulty_tier', [
  'vague', // broad / hard to pinpoint (career WAR bucket, era info)
  'moderate', // narrows the field (team history, award count)
  'identifying', // high specificity (specific award year, signature season stat)
]);

// ──────────────────────────────────────────────────────────────
// player_facts — the fact pool
// ──────────────────────────────────────────────────────────────

export const playerFacts = pgTable(
  'player_facts',
  {
    id: serial('id').primaryKey().notNull(),
    playerId: integer('player_id').notNull(),

    // Human-readable clue text displayed to the user.
    // Values are intentionally obfuscated for vague/moderate tiers
    // (e.g. buckets instead of exact numbers).
    clueText: text('clue_text').notNull(),

    category: playerFactCategory('category').notNull(),
    difficultyTier: difficultyTier('difficulty_tier').notNull(),

    // Optional season for season-scoped facts (null for career/achievement facts)
    season: smallint('season'),

    // Stable sort key within a difficulty tier (lower = shown earlier).
    // Seeded deterministically; the game layer adds per-session randomisation
    // within a tier before the session starts.
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => ({
    playerFactsPlayerFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'player_facts_player_fk',
    }).onDelete('cascade'),

    // Fast lookup for all facts belonging to a player (primary access pattern)
    playerIdIdx: index('player_facts_player_id_idx').on(table.playerId),

    // Fast lookup by tier (used when ordering facts before a session)
    playerTierIdx: index('player_facts_player_tier_idx').on(
      table.playerId,
      table.difficultyTier,
    ),

    // Prevent duplicate clues per player
    playerClueUnique: unique('player_facts_player_clue_unique').on(
      table.playerId,
      table.clueText,
    ),
  }),
);
