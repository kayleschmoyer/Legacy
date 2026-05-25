import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    CREATE VIEW game_football_player_offense_stats AS
    SELECT
      COALESCE(p.player_id, r.player_id, rc.player_id, k.player_id)           AS player_id,
      COALESCE(p.season,    r.season,    rc.season,    k.season)              AS season,
      COALESCE(p.game_num,  r.game_num,  rc.game_num,  k.game_num)            AS game_num,
      COALESCE(p.game_identifier, r.game_identifier, rc.game_identifier, k.game_identifier)
                                                                               AS game_identifier,
      -- passing
      p.cmp,
      p.att        AS pass_att,
      p.yds        AS pass_yds,
      p.td         AS pass_td,
      p.interceptions,
      p.sacked,
      p.sack_yds,
      p.rating,
      -- rushing
      r.att        AS rush_att,
      r.yds        AS rush_yds,
      r.td         AS rush_td,
      r.lng        AS rush_lng,
      r.fumbles    AS rush_fumbles,
      -- receiving
      rc.rec,
      rc.tgt,
      rc.yds       AS rec_yds,
      rc.td        AS rec_td,
      rc.lng       AS rec_lng,
      rc.fumbles   AS rec_fumbles,
      -- kicking
      k.fgm,
      k.fga,
      k.fg_0_19m,
      k.fg_0_19a,
      k.fg_20_29m,
      k.fg_20_29a,
      k.fg_30_39m,
      k.fg_30_39a,
      k.fg_40_49m,
      k.fg_40_49a,
      k.fg_50m,
      k.fg_50a,
      k.xpm,
      k.xpa,
      k.lng        AS k_lng
    FROM       game_football_passing   p
    FULL JOIN  game_football_rushing   r  USING (player_id, season, game_num)
    FULL JOIN  game_football_receiving rc USING (player_id, season, game_num)
    FULL JOIN  game_football_kicking   k  USING (player_id, season, game_num);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    DROP VIEW IF EXISTS game_football_player_offense_stats;
  `);
};
