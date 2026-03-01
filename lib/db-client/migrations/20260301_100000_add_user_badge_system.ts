import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add user badge/achievement system (LS-298)
 *
 * Purpose:
 * - Implement gamification: users earn badges for historical milestones
 * - Support rarity levels (common, rare, legendary)
 * - Support global and league-scoped badges
 * - Support progress tracking toward multi-step achievements
 *
 * Changes:
 * - Creates `user_badges` table — records of earned badges
 * - Creates `badge_progress` table — progress toward unearned badges
 * - Adds partial unique indexes to prevent duplicate badge awards
 * - Adds updated_at triggers on both tables
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // ── user_badges ──────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE public.user_badges (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL,
      badge_key     VARCHAR(100) NOT NULL,
      league_id     INTEGER REFERENCES public.leagues(id) ON DELETE CASCADE,
      team_id       INTEGER REFERENCES public.teams(id) ON DELETE SET NULL,
      rarity        VARCHAR(20) NOT NULL DEFAULT 'common'
                    CHECK (rarity IN ('common', 'rare', 'legendary')),
      metadata      JSONB NOT NULL DEFAULT '{}',
      earned_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(`
    CREATE TRIGGER user_badges_updated_at_trigger
    BEFORE UPDATE ON public.user_badges
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // One-time global badges: only one row per (user, badge_key) when league_id IS NULL
  await db.execute(`
    CREATE UNIQUE INDEX user_badges_uk_global
      ON public.user_badges(user_id, badge_key)
      WHERE league_id IS NULL;
  `);

  // One-time per-league badges: only one row per (user, badge_key, league_id)
  await db.execute(`
    CREATE UNIQUE INDEX user_badges_uk_league
      ON public.user_badges(user_id, badge_key, league_id)
      WHERE league_id IS NOT NULL;
  `);

  await db.execute(`
    CREATE INDEX user_badges_user_id_idx    ON public.user_badges(user_id);
    CREATE INDEX user_badges_league_id_idx  ON public.user_badges(league_id);
    CREATE INDEX user_badges_badge_key_idx  ON public.user_badges(badge_key);
    CREATE INDEX user_badges_earned_at_idx  ON public.user_badges(user_id, earned_at DESC);
  `);

  // ── badge_progress ───────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE public.badge_progress (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL,
      badge_key       VARCHAR(100) NOT NULL,
      league_id       INTEGER REFERENCES public.leagues(id) ON DELETE CASCADE,
      progress_value  INTEGER NOT NULL DEFAULT 0,
      progress_target INTEGER NOT NULL DEFAULT 1,
      created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(`
    CREATE TRIGGER badge_progress_updated_at_trigger
    BEFORE UPDATE ON public.badge_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  await db.execute(`
    CREATE UNIQUE INDEX badge_progress_uk_global
      ON public.badge_progress(user_id, badge_key)
      WHERE league_id IS NULL;
  `);

  await db.execute(`
    CREATE UNIQUE INDEX badge_progress_uk_league
      ON public.badge_progress(user_id, badge_key, league_id)
      WHERE league_id IS NOT NULL;
  `);

  await db.execute(`
    CREATE INDEX badge_progress_user_id_idx   ON public.badge_progress(user_id);
    CREATE INDEX badge_progress_league_id_idx ON public.badge_progress(league_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TRIGGER IF EXISTS badge_progress_updated_at_trigger ON public.badge_progress;
    DROP TABLE IF EXISTS public.badge_progress;
    DROP TRIGGER IF EXISTS user_badges_updated_at_trigger ON public.user_badges;
    DROP TABLE IF EXISTS public.user_badges;
  `);
};
