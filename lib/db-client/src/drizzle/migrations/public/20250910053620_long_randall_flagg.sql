-- Create users view matching schema definition
CREATE OR REPLACE VIEW users AS
SELECT id,
       email,
       username,
       access_level::character varying::access_level AS access_level
FROM app_internal.users;

-- Create career_batting view matching schema definition  
CREATE OR REPLACE VIEW career_batting AS
SELECT player_id,
       sum(g)       AS g,
       sum(pa)      AS pa,
       sum(ab)      AS ab,
       sum(r)       AS r,
       sum(h)       AS h,
       sum(doubles) AS doubles,
       sum(triples) AS triples,
       sum(hr)      AS hr,
       sum(rbi)     AS rbi,
       sum(sb)      AS sb,
       sum(cs)      AS cs,
       sum(bb)      AS bb,
       sum(so)      AS so,
       sum(tb)      AS tb,
       sum(gidp)    AS gidp,
       sum(hbp)     AS hbp,
       sum(sh)      AS sh,
       sum(ibb)     AS ibb
FROM season_batting
WHERE ((SELECT count(1) AS count
        FROM regexp_split_to_table(season_batting.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
        WHERE
            season_batting.lg_id::text = ANY (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]))) >
      0
GROUP BY player_id;

-- Create career_pitching view matching schema definition
CREATE OR REPLACE VIEW career_pitching AS
SELECT season_pitching.player_id,
             sum(season_pitching.w)             AS w,
             sum(season_pitching.l)             AS l,
             sum(season_pitching.g)             AS g,
             sum(season_pitching.gs)            AS gs,
             sum(season_pitching.gf)            AS gf,
             sum(season_pitching.cg)            AS cg,
             sum(season_pitching.sho)           AS sho,
             sum(season_pitching.sv)            AS sv,
             sum(season_pitching.h)             AS h,
             sum(season_pitching.r)             AS r,
             sum(season_pitching.er)            AS er,
             sum(season_pitching.hr)            AS hr,
             sum(season_pitching.bb)            AS bb,
             sum(season_pitching.ibb)           AS ibb,
             sum(season_pitching.so)            AS so,
             sum(season_pitching.hbp)           AS hbp,
             sum(season_pitching.bk)            AS bk,
             sum(season_pitching.wp)            AS wp,
             sum(season_pitching.batters_faced) AS batters_faced,
             sum(season_pitching.outs_recorded) AS outs_recorded,
             sum(season_pitching.outs_recorded) /
             CASE sum(season_pitching.batters_faced)
                 WHEN 0 THEN 1::bigint
                 ELSE sum(season_pitching.batters_faced)
                 END                            AS out_rate,
             sum(season_pitching.er)::numeric /
             CASE sum(season_pitching.outs_recorded)
                 WHEN 0 THEN 1::bigint::numeric
                 ELSE sum(season_pitching.outs_recorded)::numeric / 27.0
                 END                            AS era
      FROM season_pitching
      WHERE ((SELECT count(1) AS count
              FROM regexp_split_to_table(season_pitching.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
              WHERE season_pitching.lg_id::text = ANY
                    (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]))) > 0
      GROUP BY season_pitching.player_id;

-- Create career_fielding_by_position view matching schema definition
CREATE OR REPLACE VIEW career_fielding_by_position AS
SELECT player_id,
       pos,
       sum(g)        AS g,
       sum(gs)       AS gs,
       sum(cg)       AS cg,
       sum(inn_def)  AS inn_def,
       sum(chances)  AS chances,
       sum(po)       AS po,
       sum(a)        AS a,
       sum(e_def)    AS e_def,
       sum(dp_def)   AS dp_def,
       sum(sb)       AS sb,
       sum(cs)       AS cs,
       sum(pickoffs) AS pickoffs,
       sum(wp)       AS wp
FROM season_fielding
WHERE ((SELECT count(1) AS count
        FROM regexp_split_to_table(season_fielding.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
        WHERE
            season_fielding.lg_id::text = ANY (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]))) >
      0
GROUP BY player_id, pos;

-- Create player_eligible_positions view matching schema definition
CREATE OR REPLACE VIEW player_eligible_positions AS
SELECT player_id,
       pos AS position
FROM career_fielding_by_position
WHERE g > 50
  AND pos != 'P'
UNION
SELECT player_id,
       'SP' AS position
FROM career_pitching
WHERE gs > 50
UNION
SELECT player_id,
       'RP' AS position
FROM career_pitching
WHERE g - gs > 50;