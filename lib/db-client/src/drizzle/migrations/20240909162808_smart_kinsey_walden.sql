-- Custom SQL migration file, put you code below! --
 DO $$ BEGIN
CREATE VIEW users AS
SELECT id,
       email,
       username,
       access_level::character varying::access_level AS access_level
FROM app_internal.users;

COMMENT ON VIEW users IS E'@primaryKey id\n@unique email';
COMMENT ON TABLE public.leagues is E'@foreignKey (owner) references public.users (id)';
COMMENT ON TABLE public.league_members is E'@foreignKey (user_id) references public.users (id)';
COMMENT ON TABLE public.league_messages is E'@foreignKey (user_id) references public.users (id)';

EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
 DO $$ BEGIN
CREATE VIEW career_batting AS
SELECT player_id,
       sum(g) AS g,
       sum(pa) AS pa,
       sum(ab) AS ab,
       sum(r) AS r,
       sum(h) AS h,
       sum(doubles) AS doubles,
       sum(triples) AS triples,
       sum(hr) AS hr,
       sum(rbi) AS rbi,
       sum(sb) AS sb,
       sum(cs) AS cs,
       sum(bb) AS bb,
       sum(so) AS so,
       sum(tb) AS tb,
       sum(gidp) AS gidp,
       sum(hbp) AS hbp,
       sum(sh) AS sh,
       sum(ibb) AS ibb
FROM season_batting
WHERE (
         (SELECT count(1) AS count
          FROM regexp_split_to_table(season_batting.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
          WHERE season_batting.lg_id::text = ANY (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]) )) > 0
GROUP BY player_id;

COMMENT ON VIEW public.career_batting IS E'@foreignKey (player_id) references public.players (id)';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
 DO $$ BEGIN
CREATE VIEW career_pitching AS
SELECT player_id,
       w,
       l,
       g,
       gs,
       gf,
       cg,
       sho,
       sv,
       h,
       r,
       er,
       hr,
       bb,
       ibb,
       so,
       hbp,
       bk,
       wp,
       batters_faced,
       outs_recorded,
       out_rate,
       era
FROM
  (SELECT season_pitching.player_id,
          sum(season_pitching.w) AS w,
          sum(season_pitching.l) AS l,
          sum(season_pitching.g) AS g,
          sum(season_pitching.gs) AS gs,
          sum(season_pitching.gf) AS gf,
          sum(season_pitching.cg) AS cg,
          sum(season_pitching.sho) AS sho,
          sum(season_pitching.sv) AS sv,
          sum(season_pitching.h) AS h,
          sum(season_pitching.r) AS r,
          sum(season_pitching.er) AS er,
          sum(season_pitching.hr) AS hr,
          sum(season_pitching.bb) AS bb,
          sum(season_pitching.ibb) AS ibb,
          sum(season_pitching.so) AS so,
          sum(season_pitching.hbp) AS hbp,
          sum(season_pitching.bk) AS bk,
          sum(season_pitching.wp) AS wp,
          sum(season_pitching.batters_faced) AS batters_faced,
          sum(season_pitching.outs_recorded) AS outs_recorded,
          sum(season_pitching.outs_recorded) / CASE sum(season_pitching.batters_faced)
                                                   WHEN 0 THEN 1::bigint
                                                   ELSE sum(season_pitching.batters_faced)
                                               END AS out_rate,
                                               sum(season_pitching.er)::numeric / CASE sum(season_pitching.outs_recorded)
                                                                                      WHEN 0 THEN 1::bigint::numeric
                                                                                      ELSE sum(season_pitching.outs_recorded)::numeric / 27.0
                                                                                  END AS era
   FROM season_pitching
   WHERE (
            (SELECT count(1) AS count
             FROM regexp_split_to_table(season_pitching.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
             WHERE season_pitching.lg_id::text = ANY (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]) )) > 0
   GROUP BY season_pitching.player_id) unnamed_subquery;

COMMENT ON VIEW public.career_pitching IS E'@foreignKey (player_id) references public.players (id)';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
 DO $$ BEGIN
CREATE VIEW career_fielding_by_position AS
SELECT player_id,
       pos,
       sum(g) AS g,
       sum(gs) AS gs,
       sum(cg) AS cg,
       sum(inn_def) AS inn_def,
       sum(chances) AS chances,
       sum(po) AS po,
       sum(a) AS a,
       sum(e_def) AS e_def,
       sum(dp_def) AS dp_def,
       sum(sb) AS sb,
       sum(cs) AS cs,
       sum(pickoffs) AS pickoffs,
       sum(wp) AS wp
FROM season_fielding
WHERE (
         (SELECT count(1) AS count
          FROM regexp_split_to_table(season_fielding.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
          WHERE season_fielding.lg_id::text = ANY (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]) )) > 0
GROUP BY player_id,
         pos;

COMMENT ON VIEW public.career_fielding_by_position IS E'@foreignKey (player_id) references public.players (id)';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
 DO $$ BEGIN
CREATE VIEW public.career_fielding AS
SELECT player_id,
       sum(g) AS g,
       sum(gs) AS gs,
       sum(cg) AS cg,
       sum(inn_def) AS inn_def,
       sum(chances) AS chances,
       sum(po) AS po,
       sum(a) AS a,
       sum(e_def) AS e_def,
       sum(dp_def) AS dp_def,
       sum(sb) AS sb,
       sum(cs) AS cs,
       sum(pickoffs) AS pickoffs,
       sum(wp) AS wp,

  (SELECT string_agg(unnamed_subquery.val, ','::text) AS string_agg
   FROM
     (SELECT DISTINCT regexp_split_to_table(string_agg((season_fielding.pos)::text, ','::text), ','::text) AS val) unnamed_subquery) AS pos
FROM public.season_fielding
WHERE (
         (SELECT count(1) AS count
          FROM regexp_split_to_table((season_fielding.lg_id)::text, ','::text) regexp_split_to_table(regexp_split_to_table)
          WHERE ((season_fielding.lg_id)::text = ANY ((ARRAY['AL'::character varying, 'NL'::character varying])::text[]))) > 0)
GROUP BY player_id;

COMMENT ON VIEW public.career_fielding IS E'@foreignKey (player_id) references public.players (id)';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
 DO $$ BEGIN

CREATE FUNCTION public.create_league_and_teams(user_id integer, number_of_teams integer, league_name text, draft_type public.draft_type, draft_date date) RETURNS public.leagues
    LANGUAGE sql STRICT
    AS $$ with new_league AS
  (INSERT INTO public.leagues (name, owner)
   VALUES (league_name,
           user_id) RETURNING *),
               owner_team AS
  (INSERT INTO public.teams (name, league_id)
   VALUES ('Team 1',
             (SELECT id
              from new_league)) RETURNING *),
               new_teams AS
  (INSERT INTO public.teams (name, league_id) SELECT CONCAT('Team ', i),
     (SELECT id
      from new_league)
   FROM generate_series(2, number_of_teams) i RETURNING *),
               all_teams AS
  (SELECT *
   from owner_team
   UNION SELECT *
   from new_teams),
               owner_mapping AS
  (INSERT INTO public.league_members (user_id, league_id, team_id, permission_level)
   VALUES (user_id,
             (SELECT id
              from new_league),
             (SELECT id
              from owner_team), 'commissioner')),
               league_draft AS
  (INSERT INTO public.drafts (league_id, draft_type, date)
   VALUES (
             (SELECT id
              from new_league), draft_type,
                                draft_date) RETURNING *),
               draft_teams AS
  (INSERT INTO public.draft_teams (draft_id, team_id, league_id, draft_order)
     (SELECT
        (SELECT id
         from league_draft), id,
                             league_id,
                             row_number() over (
                                                ORDER BY id)
      FROM all_teams) RETURNING *)
SELECT *
FROM new_league $$;


ALTER FUNCTION public.create_league_and_teams(user_id integer, number_of_teams integer, league_name text, draft_type public.draft_type, draft_date date) OWNER TO postgres;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
