--
-- PostgreSQL database dump
--

-- Dumped from database version 16.3
-- Dumped by pg_dump version 16.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app_internal; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA app_internal;


ALTER SCHEMA app_internal OWNER TO postgres;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO postgres;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO postgres;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS '';


--
-- Name: access_level; Type: TYPE; Schema: app_internal; Owner: postgres
--

CREATE TYPE app_internal.access_level AS ENUM (
    'none',
    'admin'
);


ALTER TYPE app_internal.access_level OWNER TO postgres;

--
-- Name: access_level; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.access_level AS ENUM (
    'none',
    'admin'
);


ALTER TYPE public.access_level OWNER TO postgres;

--
-- Name: draft_order; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.draft_order AS ENUM (
    'snake',
    'normal'
);


ALTER TYPE public.draft_order OWNER TO postgres;

--
-- Name: draft_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.draft_type AS ENUM (
    'blind',
    'normal',
    'legacy'
);


ALTER TYPE public.draft_type OWNER TO postgres;

--
-- Name: league_permission_level; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.league_permission_level AS ENUM (
    'owner',
    'commissioner'
);


ALTER TYPE public.league_permission_level OWNER TO postgres;

--
-- Name: player_position; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.player_position AS ENUM (
    'SP',
    'RP',
    'C',
    '1B',
    '2B',
    '3B',
    'SS',
    'RF',
    'LF',
    'CF',
    'DH'
);


ALTER TYPE public.player_position OWNER TO postgres;

--
-- Name: position_slot; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.position_slot AS ENUM (
    'SP',
    'RP',
    'C',
    '1B',
    '2B',
    '3B',
    'SS',
    'RF',
    'LF',
    'CF',
    'DH',
    'XDH',
    'OF',
    'IF'
);


ALTER TYPE public.position_slot OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: leagues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leagues (
    id integer NOT NULL,
    name character varying NOT NULL,
    owner integer NOT NULL,
    max_roster_size integer DEFAULT 25 NOT NULL,
    current_matchup integer
);


ALTER TABLE public.leagues OWNER TO postgres;

--
-- Name: TABLE leagues; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.leagues IS '@foreignKey (owner) references public.users (id)';


--
-- Name: create_league_and_teams(integer, integer, text, public.draft_type, date); Type: FUNCTION; Schema: public; Owner: postgres
--

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
  ( INSERT INTO public.teams (name, league_id) SELECT CONCAT('Team ', i),
     (SELECT id
      from new_league)
   FROM generate_series(2, number_of_teams) i RETURNING *),
               all_teams AS
  (SELECT *
   from owner_team
   UNION SELECT *
   from new_teams),
               owner_mapping AS
  ( INSERT INTO public.league_members (user_id, league_id, team_id, permission_level)
   VALUES (user_id,
             (SELECT id
              from new_league),
             (SELECT id
              from owner_team), 'commissioner')),
               league_draft AS
  ( INSERT INTO public.drafts (league_id, draft_type, date)
   VALUES (
             (SELECT id
              from new_league), draft_type,
                                draft_date) RETURNING *),
               draft_teams AS
  ( INSERT INTO public.draft_teams (draft_id, team_id, league_id, draft_order)
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

--
-- Name: is_major_league(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_major_league(lg_id text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
        BEGIN
                RETURN cardinality(ARRAY(
               SELECT UNNEST(string_to_array(lg_id, ','))
                   INTERSECT
               SELECT UNNEST(Array['AL', 'NL', 'NN2', 'NAL','NNL', 'ECL','FL', 'EWL', 'NSL', 'PL', 'UA'])
       )) > 0 ;
        END;
$$;


ALTER FUNCTION public.is_major_league(lg_id text) OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: app_internal; Owner: postgres
--

CREATE TABLE app_internal.users (
    id integer NOT NULL,
    username character varying(50),
    email character varying(100) NOT NULL,
    password_hash character(128),
    access_level app_internal.access_level DEFAULT 'none'::app_internal.access_level
);


ALTER TABLE app_internal.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: app_internal; Owner: postgres
--

CREATE SEQUENCE app_internal.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE app_internal.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: app_internal; Owner: postgres
--

ALTER SEQUENCE app_internal.users_id_seq OWNED BY app_internal.users.id;


--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: postgres
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO postgres;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: postgres
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO postgres;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: postgres
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: season_batting; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.season_batting (
    player_id integer NOT NULL,
    season integer NOT NULL,
    g integer,
    pa integer,
    ab integer,
    r integer,
    h integer,
    doubles integer,
    triples integer,
    hr integer,
    rbi integer,
    sb integer,
    cs integer,
    bb integer,
    so integer,
    batting_avg double precision,
    onbase_perc double precision,
    slugging_perc double precision,
    onbase_plus_slugging double precision,
    onbase_plus_slugging_plus double precision,
    tb integer,
    gidp integer,
    hbp integer,
    sh integer,
    sf integer,
    ibb integer,
    pos_season character varying(50),
    award_summary text,
    lg_id character varying(20),
    team character varying(20) NOT NULL,
    row_id character varying(10) NOT NULL
);


ALTER TABLE public.season_batting OWNER TO postgres;

--
-- Name: aggregate_season_batting; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.aggregate_season_batting AS
 SELECT player_id,
    season,
    (sum(g))::integer AS g,
    (sum(pa))::integer AS pa,
    (sum(ab))::integer AS ab,
    (sum(r))::integer AS r,
    (sum(h))::integer AS h,
    (sum(doubles))::integer AS doubles,
    (sum(triples))::integer AS triples,
    (sum(hr))::integer AS hr,
    (sum(rbi))::integer AS rbi,
    (sum(sb))::integer AS sb,
    (sum(cs))::integer AS cs,
    (sum(bb))::integer AS bb,
    (sum(so))::integer AS so,
    (sum(tb))::integer AS tb,
    (sum(gidp))::integer AS gidp,
    (sum(hbp))::integer AS hbp,
    (sum(sh))::integer AS sh,
    (sum(sf))::integer AS sf,
    (sum(ibb))::integer AS ibb
   FROM public.season_batting
  WHERE public.is_major_league((lg_id)::text)
  GROUP BY player_id, season;


ALTER VIEW public.aggregate_season_batting OWNER TO postgres;

--
-- Name: VIEW aggregate_season_batting; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.aggregate_season_batting IS '@foreignKey (player_id) references public.players (id)';


--
-- Name: season_fielding; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.season_fielding (
    player_id integer NOT NULL,
    season integer NOT NULL,
    pos character varying(10) NOT NULL,
    lg_id character varying(20),
    g integer,
    gs integer,
    cg integer,
    inn_def double precision,
    chances double precision,
    po integer,
    a integer,
    e_def integer,
    dp_def integer,
    fielding_perc double precision,
    range_factor_per_nine double precision,
    range_factor_per_game double precision,
    fielding_perc_lg double precision,
    range_factor_per_nine_lg double precision,
    range_factor_per_game_lg double precision,
    g_of_parts integer,
    sb integer,
    cs integer,
    caught_stealing_perc double precision,
    caught_stealing_perc_lg double precision,
    pickoffs integer,
    award_summary text,
    wp integer,
    team character varying(20) NOT NULL,
    row_id character varying(10) NOT NULL
);


ALTER TABLE public.season_fielding OWNER TO postgres;

--
-- Name: aggregate_season_fielding; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.aggregate_season_fielding AS
 SELECT player_id,
    season,
    (sum(g))::integer AS g,
    (sum(gs))::integer AS gs,
    (sum(cg))::integer AS cg,
    (sum(inn_def))::integer AS inn_def,
    (sum(chances))::integer AS chances,
    (sum(po))::integer AS po,
    (sum(a))::integer AS a,
    (sum(e_def))::integer AS e_def,
    (sum(dp_def))::integer AS dp_def,
    (sum(sb))::integer AS sb,
    (sum(cs))::integer AS cs,
    (sum(pickoffs))::integer AS pickoffs,
    (sum(wp))::integer AS wp
   FROM public.season_fielding
  WHERE (public.is_major_league((lg_id)::text) AND ((pos)::text <> 'DH'::text) AND ((pos)::text <> 'OF'::text))
  GROUP BY player_id, season;


ALTER VIEW public.aggregate_season_fielding OWNER TO postgres;

--
-- Name: VIEW aggregate_season_fielding; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.aggregate_season_fielding IS '@foreignKey (player_id) references public.players (id)';


--
-- Name: aggregate_season_fielding_by_pos; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.aggregate_season_fielding_by_pos AS
 SELECT player_id,
    season,
    pos,
    (sum(g))::integer AS g,
    (sum(gs))::integer AS gs,
    (sum(cg))::integer AS cg,
    (sum(inn_def))::integer AS inn_def,
    (sum(chances))::integer AS chances,
    (sum(po))::integer AS po,
    (sum(a))::integer AS a,
    (sum(e_def))::integer AS e_def,
    (sum(dp_def))::integer AS dp_def,
    (sum(sb))::integer AS sb,
    (sum(cs))::integer AS cs,
    (sum(pickoffs))::integer AS pickoffs,
    (sum(wp))::integer AS wp
   FROM public.season_fielding
  WHERE (public.is_major_league((lg_id)::text) AND ((pos)::text <> 'DH'::text) AND ((pos)::text <> 'OF'::text) AND ((pos)::text <> 'P'::text))
  GROUP BY player_id, season, pos;


ALTER VIEW public.aggregate_season_fielding_by_pos OWNER TO postgres;

--
-- Name: VIEW aggregate_season_fielding_by_pos; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.aggregate_season_fielding_by_pos IS '@foreignKey (player_id) references public.players (id)';


--
-- Name: season_pitching; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.season_pitching (
    player_id integer NOT NULL,
    season integer NOT NULL,
    w integer,
    l integer,
    win_loss_perc numeric,
    earned_run_avg numeric,
    g integer,
    gs integer,
    gf integer,
    cg integer,
    sho integer,
    sv integer,
    ip double precision,
    h integer,
    r integer,
    er integer,
    hr integer,
    bb integer,
    ibb integer,
    so integer,
    hbp integer,
    bk integer,
    wp integer,
    row_id character varying(10) NOT NULL,
    batters_faced integer,
    earned_run_avg_plus double precision,
    fip double precision,
    whip double precision,
    hits_per_nine double precision,
    home_runs_per_nine double precision,
    bases_on_balls_per_nine double precision,
    strikeouts_per_nine double precision,
    strikeouts_per_base_on_balls double precision,
    award_summary text,
    team character varying(20) NOT NULL,
    lg_id character varying(20),
    outs_recorded integer GENERATED ALWAYS AS (((floor(ip) * (3)::double precision) + ((ip - floor(ip)) * (10)::double precision))) STORED
);


ALTER TABLE public.season_pitching OWNER TO postgres;

--
-- Name: aggregate_season_pitching; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.aggregate_season_pitching AS
 SELECT player_id,
    season,
    (sum(w))::integer AS w,
    (sum(l))::integer AS l,
    (sum(g))::integer AS g,
    (sum(gs))::integer AS gs,
    (sum(gf))::integer AS gf,
    (sum(cg))::integer AS cg,
    (sum(sho))::integer AS sho,
    (sum(sv))::integer AS sv,
    (sum(h))::integer AS h,
    (sum(r))::integer AS r,
    (sum(er))::integer AS er,
    (sum(hr))::integer AS hr,
    (sum(bb))::integer AS bb,
    (sum(ibb))::integer AS ibb,
    (sum(so))::integer AS so,
    (sum(hbp))::integer AS hbp,
    (sum(bk))::integer AS bk,
    (sum(wp))::integer AS wp,
    (sum(batters_faced))::integer AS batters_faced,
    (sum(outs_recorded))::integer AS outs_recorded
   FROM public.season_pitching
  WHERE public.is_major_league((lg_id)::text)
  GROUP BY player_id, season;


ALTER VIEW public.aggregate_season_pitching OWNER TO postgres;

--
-- Name: VIEW aggregate_season_pitching; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.aggregate_season_pitching IS '@foreignKey (player_id) references public.players (id)';


--
-- Name: career_batting; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.career_batting AS
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
   FROM public.season_batting
  WHERE public.is_major_league((lg_id)::text)
  GROUP BY player_id;


ALTER VIEW public.career_batting OWNER TO postgres;

--
-- Name: VIEW career_batting; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.career_batting IS '@foreignKey (player_id) references public.players (id)';


--
-- Name: career_fielding; Type: VIEW; Schema: public; Owner: postgres
--

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
    ( SELECT string_agg(unnamed_subquery.val, ','::text) AS string_agg
           FROM ( SELECT DISTINCT regexp_split_to_table(string_agg((season_fielding.pos)::text, ','::text), ','::text) AS val) unnamed_subquery) AS pos
   FROM public.season_fielding
  WHERE public.is_major_league((lg_id)::text)
  GROUP BY player_id;


ALTER VIEW public.career_fielding OWNER TO postgres;

--
-- Name: VIEW career_fielding; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.career_fielding IS '@foreignKey (player_id) references public.players (id)';


--
-- Name: career_fielding_by_position; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.career_fielding_by_position AS
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
   FROM public.season_fielding
  WHERE public.is_major_league((lg_id)::text)
  GROUP BY player_id, pos;


ALTER VIEW public.career_fielding_by_position OWNER TO postgres;

--
-- Name: VIEW career_fielding_by_position; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.career_fielding_by_position IS '@foreignKey (player_id) references public.players (id)';


--
-- Name: career_pitching; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.career_pitching AS
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
   FROM ( SELECT season_pitching.player_id,
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
            (sum(season_pitching.outs_recorded) /
                CASE sum(season_pitching.batters_faced)
                    WHEN 0 THEN (1)::bigint
                    ELSE sum(season_pitching.batters_faced)
                END) AS out_rate,
            ((sum(season_pitching.er))::numeric /
                CASE sum(season_pitching.outs_recorded)
                    WHEN 0 THEN ((1)::bigint)::numeric
                    ELSE ((sum(season_pitching.outs_recorded))::numeric / 27.0)
                END) AS era
           FROM public.season_pitching
          WHERE public.is_major_league((season_pitching.lg_id)::text)
          GROUP BY season_pitching.player_id) unnamed_subquery;


ALTER VIEW public.career_pitching OWNER TO postgres;

--
-- Name: VIEW career_pitching; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.career_pitching IS '@foreignKey (player_id) references public.players (id)';


--
-- Name: draft_teams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.draft_teams (
    draft_id integer NOT NULL,
    team_id integer NOT NULL,
    league_id integer NOT NULL,
    draft_order integer NOT NULL
);


ALTER TABLE public.draft_teams OWNER TO postgres;

--
-- Name: drafts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.drafts (
    id integer NOT NULL,
    league_id integer NOT NULL,
    draft_type public.draft_type NOT NULL,
    date date,
    draft_order public.draft_order DEFAULT 'snake'::public.draft_order NOT NULL
);


ALTER TABLE public.drafts OWNER TO postgres;

--
-- Name: drafts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.drafts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.drafts_id_seq OWNER TO postgres;

--
-- Name: drafts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.drafts_id_seq OWNED BY public.drafts.id;


--
-- Name: game_batting; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.game_batting (
    player_id integer NOT NULL,
    season integer NOT NULL,
    game_number integer NOT NULL,
    game_identifier character(12) NOT NULL,
    pa integer,
    ab integer,
    r integer,
    h integer,
    doubles integer,
    triples integer,
    hr integer,
    rbi integer,
    sb integer,
    cs integer,
    bb integer,
    so integer,
    gidp integer,
    hbp integer,
    sh integer,
    sf integer,
    ibb integer
);


ALTER TABLE public.game_batting OWNER TO postgres;

--
-- Name: game_fielding; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.game_fielding (
    player_id integer NOT NULL,
    season integer NOT NULL,
    game_num integer NOT NULL,
    game_identifier character(12) NOT NULL,
    inn_def double precision,
    chances double precision,
    po integer,
    a integer,
    e_def integer,
    dp_def integer
);


ALTER TABLE public.game_fielding OWNER TO postgres;

--
-- Name: game_pitching; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.game_pitching (
    player_id integer NOT NULL,
    season integer NOT NULL,
    game_num integer NOT NULL,
    game_identifier character(12) NOT NULL,
    w integer,
    l integer,
    gs integer,
    gf integer,
    cg integer,
    sho integer,
    sv integer,
    ip double precision,
    h integer,
    r integer,
    er integer,
    hr integer,
    bb integer,
    ibb integer,
    so integer,
    hbp integer,
    batters_faced integer,
    outs_recorded integer GENERATED ALWAYS AS (((floor(ip) * (3)::double precision) + ((ip - floor(ip)) * (10)::double precision))) STORED
);


ALTER TABLE public.game_pitching OWNER TO postgres;

--
-- Name: league_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.league_members (
    league_id integer NOT NULL,
    team_id integer,
    permission_level public.league_permission_level NOT NULL,
    user_id integer NOT NULL
);


ALTER TABLE public.league_members OWNER TO postgres;

--
-- Name: TABLE league_members; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.league_members IS '@foreignKey (user_id) references public.users (id)';


--
-- Name: league_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.league_messages (
    league_id integer NOT NULL,
    message_text character varying NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now(),
    id integer NOT NULL,
    user_id integer NOT NULL
);


ALTER TABLE public.league_messages OWNER TO postgres;

--
-- Name: TABLE league_messages; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.league_messages IS '@foreignKey (user_id) references public.users (id)';


--
-- Name: league_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.league_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.league_messages_id_seq OWNER TO postgres;

--
-- Name: league_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.league_messages_id_seq OWNED BY public.league_messages.id;


--
-- Name: league_positions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.league_positions (
    id integer NOT NULL,
    position_type public.position_slot NOT NULL,
    league_id integer NOT NULL
);


ALTER TABLE public.league_positions OWNER TO postgres;

--
-- Name: leagues_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.leagues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.leagues_id_seq OWNER TO postgres;

--
-- Name: leagues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.leagues_id_seq OWNED BY public.leagues.id;


--
-- Name: matchup_player_games; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.matchup_player_games (
    id integer NOT NULL,
    game_num integer NOT NULL,
    batting_game_num integer,
    fielding_game_num integer,
    pitching_game_num integer,
    matchup_player_id integer NOT NULL,
    fielding_game_pos character(2)
);


ALTER TABLE public.matchup_player_games OWNER TO postgres;

--
-- Name: matchup_players; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.matchup_players (
    id integer NOT NULL,
    matchup_id integer NOT NULL,
    player_id integer NOT NULL,
    season integer NOT NULL
);


ALTER TABLE public.matchup_players OWNER TO postgres;

--
-- Name: TABLE matchup_players; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.matchup_players IS '@foreignKey (player_id,season) references public.aggregate_season_batting (player_id, season)
@foreignKey (player_id,season) references public.aggregate_season_pitching (player_id, season)
@foreignKey (player_id,season) references public.aggregate_season_fielding (player_id, season)';


--
-- Name: matchup_batting; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.matchup_batting AS
 SELECT matchup_players.id AS matchup_player_id,
    game_batting.player_id,
    (sum(game_batting.pa))::integer AS pa,
    (sum(game_batting.ab))::integer AS ab,
    (sum(game_batting.r))::integer AS r,
    (sum(game_batting.h))::integer AS h,
    (sum(game_batting.doubles))::integer AS doubles,
    (sum(game_batting.triples))::integer AS triples,
    (sum(game_batting.hr))::integer AS hr,
    (sum(game_batting.rbi))::integer AS rbi,
    (sum(game_batting.sb))::integer AS sb,
    (sum(game_batting.cs))::integer AS cs,
    (sum(game_batting.bb))::integer AS bb,
    (sum(game_batting.so))::integer AS so,
    (sum(game_batting.gidp))::integer AS gidp,
    (sum(game_batting.hbp))::integer AS hbp,
    (sum(game_batting.sh))::integer AS sh,
    (sum(game_batting.sf))::integer AS sf,
    (sum(game_batting.ibb))::integer AS ibb
   FROM ((public.matchup_player_games
     JOIN public.matchup_players ON ((matchup_player_games.matchup_player_id = matchup_players.id)))
     JOIN public.game_batting ON (((game_batting.season = matchup_players.season) AND (game_batting.player_id = matchup_players.player_id) AND (game_batting.game_number = matchup_player_games.batting_game_num))))
  GROUP BY matchup_players.id, game_batting.player_id;


ALTER VIEW public.matchup_batting OWNER TO postgres;

--
-- Name: VIEW matchup_batting; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.matchup_batting IS '@foreignKey (matchup_player_id) references public.matchup_players (id)
@unique matchup_player_id';


--
-- Name: matchup_fielding; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.matchup_fielding AS
 SELECT matchup_players.id AS matchup_player_id,
    game_fielding.player_id,
    (sum(game_fielding.inn_def))::integer AS inn_def,
    (sum(game_fielding.chances))::integer AS chances,
    (sum(game_fielding.po))::integer AS po,
    (sum(game_fielding.a))::integer AS a,
    (sum(game_fielding.e_def))::integer AS e_def,
    (sum(game_fielding.dp_def))::integer AS dp_def
   FROM ((public.matchup_player_games
     JOIN public.matchup_players ON ((matchup_player_games.matchup_player_id = matchup_players.id)))
     JOIN public.game_fielding ON (((game_fielding.season = matchup_players.season) AND (game_fielding.player_id = matchup_players.player_id) AND (game_fielding.game_num = matchup_player_games.fielding_game_num))))
  GROUP BY matchup_players.id, game_fielding.player_id;


ALTER VIEW public.matchup_fielding OWNER TO postgres;

--
-- Name: VIEW matchup_fielding; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.matchup_fielding IS '@foreignKey (matchup_player_id) references public.matchup_players (id)
@unique matchup_player_id';


--
-- Name: matchup_pitching; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.matchup_pitching AS
 SELECT matchup_players.id AS matchup_player_id,
    game_pitching.player_id,
    (sum(game_pitching.w))::integer AS w,
    (sum(game_pitching.l))::integer AS l,
    (sum(game_pitching.gs))::integer AS gs,
    (sum(game_pitching.gf))::integer AS gf,
    (sum(game_pitching.cg))::integer AS cg,
    (sum(game_pitching.sho))::integer AS sho,
    (sum(game_pitching.sv))::integer AS sv,
    (sum(game_pitching.ip))::integer AS ip,
    (sum(game_pitching.h))::integer AS h,
    (sum(game_pitching.r))::integer AS r,
    (sum(game_pitching.er))::integer AS er,
    (sum(game_pitching.hr))::integer AS hr,
    (sum(game_pitching.bb))::integer AS bb,
    (sum(game_pitching.ibb))::integer AS ibb,
    (sum(game_pitching.so))::integer AS so,
    (sum(game_pitching.hbp))::integer AS hbp,
    (sum(game_pitching.batters_faced))::integer AS batters_faced,
    (sum(game_pitching.outs_recorded))::integer AS outs_recorded
   FROM ((public.matchup_player_games
     JOIN public.matchup_players ON ((matchup_player_games.matchup_player_id = matchup_players.id)))
     JOIN public.game_pitching ON (((game_pitching.season = matchup_players.season) AND (game_pitching.player_id = matchup_players.player_id) AND (game_pitching.game_num = matchup_player_games.pitching_game_num))))
  GROUP BY matchup_players.id, game_pitching.player_id;


ALTER VIEW public.matchup_pitching OWNER TO postgres;

--
-- Name: VIEW matchup_pitching; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.matchup_pitching IS '@foreignKey (matchup_player_id) references public.matchup_players (id)
@unique matchup_player_id';


--
-- Name: matchup_player_games_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.matchup_player_games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.matchup_player_games_id_seq OWNER TO postgres;

--
-- Name: matchup_player_games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.matchup_player_games_id_seq OWNED BY public.matchup_player_games.id;


--
-- Name: matchup_players_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.matchup_players_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.matchup_players_id_seq OWNER TO postgres;

--
-- Name: matchup_players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.matchup_players_id_seq OWNED BY public.matchup_players.id;


--
-- Name: matchups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.matchups (
    id integer NOT NULL,
    league_id integer NOT NULL,
    week_number integer NOT NULL,
    number_of_games integer NOT NULL
);


ALTER TABLE public.matchups OWNER TO postgres;

--
-- Name: matchups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.matchups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.matchups_id_seq OWNER TO postgres;

--
-- Name: matchups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.matchups_id_seq OWNED BY public.matchups.id;


--
-- Name: player_eligible_positions; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.player_eligible_positions AS
 SELECT career_fielding_by_position.player_id,
    career_fielding_by_position.pos AS "position"
   FROM public.career_fielding_by_position
  WHERE ((career_fielding_by_position.g > 50) AND ((career_fielding_by_position.pos)::text <> 'P'::text))
UNION
 SELECT career_pitching.player_id,
    'SP'::character varying AS "position"
   FROM public.career_pitching
  WHERE (career_pitching.gs > 50)
UNION
 SELECT career_pitching.player_id,
    'RP'::character varying AS "position"
   FROM public.career_pitching
  WHERE ((career_pitching.g - career_pitching.gs) > 50);


ALTER VIEW public.player_eligible_positions OWNER TO postgres;

--
-- Name: VIEW player_eligible_positions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.player_eligible_positions IS '@foreignKey (player_id) references public.players (id)';


--
-- Name: players; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.players (
    id integer NOT NULL,
    name text NOT NULL,
    bref_id character varying(10) NOT NULL
);


ALTER TABLE public.players OWNER TO postgres;

--
-- Name: players_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.players_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.players_id_seq OWNER TO postgres;

--
-- Name: players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.players_id_seq OWNED BY public.players.id;


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_members (
    id integer NOT NULL,
    team_id integer,
    league_id integer NOT NULL,
    player_id integer NOT NULL,
    position_id integer
);


ALTER TABLE public.team_members OWNER TO postgres;

--
-- Name: team_members_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.team_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.team_members_id_seq OWNER TO postgres;

--
-- Name: team_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.team_members_id_seq OWNED BY public.team_members.id;


--
-- Name: team_positions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.team_positions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.team_positions_id_seq OWNER TO postgres;

--
-- Name: team_positions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.team_positions_id_seq OWNED BY public.league_positions.id;


--
-- Name: teams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teams (
    id integer NOT NULL,
    name character varying NOT NULL,
    league_id integer NOT NULL
);


ALTER TABLE public.teams OWNER TO postgres;

--
-- Name: teams_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.teams_id_seq OWNER TO postgres;

--
-- Name: teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.teams_id_seq OWNED BY public.teams.id;


--
-- Name: users; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.users AS
 SELECT id,
    email,
    username,
    ((access_level)::character varying)::public.access_level AS access_level
   FROM app_internal.users;


ALTER VIEW public.users OWNER TO postgres;

--
-- Name: VIEW users; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.users IS '@primaryKey id
@unique email';


--
-- Name: users id; Type: DEFAULT; Schema: app_internal; Owner: postgres
--

ALTER TABLE ONLY app_internal.users ALTER COLUMN id SET DEFAULT nextval('app_internal.users_id_seq'::regclass);


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: postgres
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: drafts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drafts ALTER COLUMN id SET DEFAULT nextval('public.drafts_id_seq'::regclass);


--
-- Name: league_messages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.league_messages ALTER COLUMN id SET DEFAULT nextval('public.league_messages_id_seq'::regclass);


--
-- Name: league_positions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.league_positions ALTER COLUMN id SET DEFAULT nextval('public.team_positions_id_seq'::regclass);


--
-- Name: leagues id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leagues ALTER COLUMN id SET DEFAULT nextval('public.leagues_id_seq'::regclass);


--
-- Name: matchup_player_games id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matchup_player_games ALTER COLUMN id SET DEFAULT nextval('public.matchup_player_games_id_seq'::regclass);


--
-- Name: matchup_players id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matchup_players ALTER COLUMN id SET DEFAULT nextval('public.matchup_players_id_seq'::regclass);


--
-- Name: matchups id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matchups ALTER COLUMN id SET DEFAULT nextval('public.matchups_id_seq'::regclass);


--
-- Name: players id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.players ALTER COLUMN id SET DEFAULT nextval('public.players_id_seq'::regclass);


--
-- Name: team_members id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members ALTER COLUMN id SET DEFAULT nextval('public.team_members_id_seq'::regclass);


--
-- Name: teams id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams ALTER COLUMN id SET DEFAULT nextval('public.teams_id_seq'::regclass);


--
-- Name: users users_email_uk; Type: CONSTRAINT; Schema: app_internal; Owner: postgres
--

ALTER TABLE ONLY app_internal.users
    ADD CONSTRAINT users_email_uk UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: app_internal; Owner: postgres
--

ALTER TABLE ONLY app_internal.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_uk; Type: CONSTRAINT; Schema: app_internal; Owner: postgres
--

ALTER TABLE ONLY app_internal.users
    ADD CONSTRAINT users_username_uk UNIQUE (username);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: postgres
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: draft_teams draft_teams_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.draft_teams
    ADD CONSTRAINT draft_teams_pk PRIMARY KEY (draft_id, team_id, league_id);


--
-- Name: draft_teams draft_teams_uk_order; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.draft_teams
    ADD CONSTRAINT draft_teams_uk_order UNIQUE (draft_id, draft_order);


--
-- Name: drafts drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drafts
    ADD CONSTRAINT drafts_pkey PRIMARY KEY (id);


--
-- Name: game_batting game_batting_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.game_batting
    ADD CONSTRAINT game_batting_pk PRIMARY KEY (player_id, season, game_number);


--
-- Name: game_fielding game_fielding_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.game_fielding
    ADD CONSTRAINT game_fielding_pk PRIMARY KEY (player_id, season, game_num);


--
-- Name: game_pitching game_pitching_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.game_pitching
    ADD CONSTRAINT game_pitching_pk PRIMARY KEY (player_id, season, game_num);


--
-- Name: league_members league_members_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.league_members
    ADD CONSTRAINT league_members_pk PRIMARY KEY (league_id, user_id);


--
-- Name: league_messages league_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.league_messages
    ADD CONSTRAINT league_messages_pkey PRIMARY KEY (id);


--
-- Name: leagues leagues_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leagues
    ADD CONSTRAINT leagues_pkey PRIMARY KEY (id);


--
-- Name: matchup_player_games matchup_player_games_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matchup_player_games
    ADD CONSTRAINT matchup_player_games_pk PRIMARY KEY (id);


--
-- Name: matchup_players matchup_players_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matchup_players
    ADD CONSTRAINT matchup_players_pk UNIQUE (matchup_id, player_id);


--
-- Name: matchup_players matchup_players_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matchup_players
    ADD CONSTRAINT matchup_players_pkey PRIMARY KEY (id);


--
-- Name: matchups matchups_league_id_week_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matchups
    ADD CONSTRAINT matchups_league_id_week_number_unique UNIQUE (league_id, week_number);


--
-- Name: matchups matchups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matchups
    ADD CONSTRAINT matchups_pkey PRIMARY KEY (id);


--
-- Name: players players_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);


--
-- Name: players players_uk_bref_id; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_uk_bref_id UNIQUE (bref_id);


--
-- Name: season_batting season_batting_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.season_batting
    ADD CONSTRAINT season_batting_pk PRIMARY KEY (player_id, season, team, row_id);


--
-- Name: season_fielding season_fielding_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.season_fielding
    ADD CONSTRAINT season_fielding_pk PRIMARY KEY (player_id, season, pos, team, row_id);


--
-- Name: season_pitching season_pitching_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.season_pitching
    ADD CONSTRAINT season_pitching_pk PRIMARY KEY (player_id, season, team, row_id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: league_positions team_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.league_positions
    ADD CONSTRAINT team_positions_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: teams teams_uk_id_league_id; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_uk_id_league_id UNIQUE (id, league_id);


--
-- Name: users__index; Type: INDEX; Schema: app_internal; Owner: postgres
--

CREATE INDEX users__index ON app_internal.users USING btree (username);


--
-- Name: users_email_index; Type: INDEX; Schema: app_internal; Owner: postgres
--

CREATE INDEX users_email_index ON app_internal.users USING btree (email);


--
-- Name: league_messages_league_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX league_messages_league_id_index ON public.league_messages USING btree (league_id);


--
-- Name: league_messages_league_id_timestamp_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX league_messages_league_id_timestamp_index ON public.league_messages USING btree (league_id, "timestamp");


--
-- Name: season_batting_hr_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX season_batting_hr_index ON public.season_batting USING btree (hr);


--
-- Name: season_batting_player_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX season_batting_player_id_index ON public.season_batting USING btree (player_id);


--
-- Name: season_fielding_player_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX season_fielding_player_id_index ON public.season_fielding USING btree (player_id);


--
-- Name: season_fielding_player_id_pos_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX season_fielding_player_id_pos_index ON public.season_fielding USING btree (player_id, pos);


--
-- Name: season_fielding_po_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX season_fielding_po_index ON public.season_fielding USING btree (po);


--
-- Name: season_pitching_player_id_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX season_pitching_player_id_index ON public.season_pitching USING btree (player_id);


--
-- Name: season_pitching_w_index; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX season_pitching_w_index ON public.season_pitching USING btree (w);


--
-- Name: draft_teams draft_teams_drafts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.draft_teams
    ADD CONSTRAINT draft_teams_drafts_id_fk FOREIGN KEY (draft_id) REFERENCES public.drafts(id);


--
-- Name: draft_teams draft_teams_teams_id_league_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.draft_teams
    ADD CONSTRAINT draft_teams_teams_id_league_id_fk FOREIGN KEY (team_id, league_id) REFERENCES public.teams(id, league_id);


--
-- Name: drafts drafts_leagues_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drafts
    ADD CONSTRAINT drafts_leagues_id_fk FOREIGN KEY (league_id) REFERENCES public.leagues(id);


--
-- Name: game_batting game_batting_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.game_batting
    ADD CONSTRAINT game_batting_players_id_fk FOREIGN KEY (player_id) REFERENCES public.players(id);


--
-- Name: game_fielding game_fielding_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.game_fielding
    ADD CONSTRAINT game_fielding_players_id_fk FOREIGN KEY (player_id) REFERENCES public.players(id);


--
-- Name: game_pitching game_pitching_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.game_pitching
    ADD CONSTRAINT game_pitching_players_id_fk FOREIGN KEY (player_id) REFERENCES public.players(id);


--
-- Name: league_members league_members_leagues_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.league_members
    ADD CONSTRAINT league_members_leagues_id_fk FOREIGN KEY (league_id) REFERENCES public.leagues(id);


--
-- Name: league_messages league_messages_leagues_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.league_messages
    ADD CONSTRAINT league_messages_leagues_id_fk FOREIGN KEY (league_id) REFERENCES public.leagues(id);


--
-- Name: league_positions league_positions_leagues_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.league_positions
    ADD CONSTRAINT league_positions_leagues_id_fk FOREIGN KEY (league_id) REFERENCES public.leagues(id);


--
-- Name: leagues leagues_matchups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leagues
    ADD CONSTRAINT leagues_matchups_id_fk FOREIGN KEY (current_matchup) REFERENCES public.matchups(id);


--
-- Name: matchup_player_games matchup_player_games_matchup_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matchup_player_games
    ADD CONSTRAINT matchup_player_games_matchup_players_id_fk FOREIGN KEY (matchup_player_id) REFERENCES public.matchup_players(id);


--
-- Name: matchup_players matchup_players_matchup_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matchup_players
    ADD CONSTRAINT matchup_players_matchup_fk FOREIGN KEY (matchup_id) REFERENCES public.matchups(id);


--
-- Name: matchup_players matchup_players_player_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matchup_players
    ADD CONSTRAINT matchup_players_player_fk FOREIGN KEY (player_id) REFERENCES public.players(id);


--
-- Name: matchups matchups_league_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matchups
    ADD CONSTRAINT matchups_league_fk FOREIGN KEY (id) REFERENCES public.leagues(id);


--
-- Name: season_batting season_batting_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.season_batting
    ADD CONSTRAINT season_batting_players_id_fk FOREIGN KEY (player_id) REFERENCES public.players(id);


--
-- Name: season_fielding season_fielding_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.season_fielding
    ADD CONSTRAINT season_fielding_players_id_fk FOREIGN KEY (player_id) REFERENCES public.players(id);


--
-- Name: season_pitching season_pitching_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.season_pitching
    ADD CONSTRAINT season_pitching_players_id_fk FOREIGN KEY (player_id) REFERENCES public.players(id);


--
-- Name: team_members team_members_league_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_league_fk FOREIGN KEY (league_id) REFERENCES public.leagues(id);


--
-- Name: team_members team_members_players_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_players_fk FOREIGN KEY (player_id) REFERENCES public.players(id);


--
-- Name: team_members team_members_position_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_position_fk FOREIGN KEY (position_id) REFERENCES public.league_positions(id);


--
-- Name: team_members team_members_teams_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_teams_fk FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: teams teams_leagues_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_leagues_id_fk FOREIGN KEY (league_id) REFERENCES public.leagues(id);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--
