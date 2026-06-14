/**
 * Football schema extensions (LS-255)
 *
 * Exposes football players, season stats (passing/rushing/receiving/kicking/defense/IDP),
 * and career totals via GraphQL queries.
 *
 * defensiveFormat on League (LS-246): 'dst' = team defense, 'idp' = individual.
 * Football player identity columns (LS-246): pfrId, isDst, nflTeam, position.
 * Season stats tables (LS-247): football_season_passing/rushing/receiving/kicking/defense.
 * IDP season stats (LS-4155): football_season_defense_idp + career_football_defense_idp view.
 * Career stat tables (LS-250): career_football_passing/rushing/receiving/kicking/defense.
 * Matchup game-level stat types (LS-4765): used by LS-4151 matchup resolver.
 */
import { PublicSchema } from '@legacy-sports/db-client';
import {
  computeIDPScore,
  computeScoring,
  DEFAULT_DEFENSE_SCORING,
  DEFAULT_IDP_SCORING,
  DEFAULT_KICKING_SCORING,
  DEFAULT_PASSING_SCORING,
  DEFAULT_RECEIVING_SCORING,
  DEFAULT_RUSHING_SCORING,
} from '@legacy-sports/scoring';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import { builder } from './builder';
import { AuthenticationError, UserInputError } from './graphql-errors';
import { requireEntitlement } from './authorization';
import { ENTITLEMENTS } from './entitlements';

// ── Shared nullable-numeric helper ───────────────────────────────────────────
// Drizzle returns numeric columns as string | null; GraphQL floats need number.
function toFloat(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// ── Season stat types ─────────────────────────────────────────────────────────

const FootballSeasonPassingRef = builder.objectRef<{
  season: number;
  team: string;
  g: number | null;
  gs: number | null;
  cmp: number | null;
  att: number | null;
  yds: number | null;
  td: number | null;
  int: number | null;
  sacked: number | null;
  sackYds: number | null;
  lng: number | null;
  rating: number | null;
}>('FootballSeasonPassing');

FootballSeasonPassingRef.implement({
  description: 'Season passing stats for a football player (LS-247)',
  fields: (t) => ({
    season: t.exposeInt('season'),
    team: t.exposeString('team'),
    g: t.exposeInt('g', { nullable: true }),
    gs: t.exposeInt('gs', { nullable: true }),
    cmp: t.exposeInt('cmp', { nullable: true }),
    att: t.exposeInt('att', { nullable: true }),
    yds: t.exposeInt('yds', { nullable: true }),
    td: t.exposeInt('td', { nullable: true }),
    int: t.exposeInt('int', { nullable: true }),
    sacked: t.exposeInt('sacked', { nullable: true }),
    sackYds: t.exposeInt('sackYds', { nullable: true }),
    lng: t.exposeInt('lng', { nullable: true }),
    rating: t.exposeFloat('rating', { nullable: true }),
  }),
});

const FootballSeasonRushingRef = builder.objectRef<{
  season: number;
  team: string;
  g: number | null;
  gs: number | null;
  att: number | null;
  yds: number | null;
  td: number | null;
  lng: number | null;
  firstDowns: number | null;
  fumbles: number | null;
  ydsPerAtt: number | null;
}>('FootballSeasonRushing');

FootballSeasonRushingRef.implement({
  description: 'Season rushing stats for a football player (LS-247)',
  fields: (t) => ({
    season: t.exposeInt('season'),
    team: t.exposeString('team'),
    g: t.exposeInt('g', { nullable: true }),
    gs: t.exposeInt('gs', { nullable: true }),
    att: t.exposeInt('att', { nullable: true }),
    yds: t.exposeInt('yds', { nullable: true }),
    td: t.exposeInt('td', { nullable: true }),
    lng: t.exposeInt('lng', { nullable: true }),
    firstDowns: t.exposeInt('firstDowns', { nullable: true }),
    fumbles: t.exposeInt('fumbles', { nullable: true }),
    ydsPerAtt: t.exposeFloat('ydsPerAtt', { nullable: true }),
  }),
});

const FootballSeasonReceivingRef = builder.objectRef<{
  season: number;
  team: string;
  g: number | null;
  gs: number | null;
  rec: number | null;
  tgt: number | null;
  yds: number | null;
  td: number | null;
  lng: number | null;
  firstDowns: number | null;
  fumbles: number | null;
  ydsPerRec: number | null;
}>('FootballSeasonReceiving');

FootballSeasonReceivingRef.implement({
  description: 'Season receiving stats for a football player (LS-247)',
  fields: (t) => ({
    season: t.exposeInt('season'),
    team: t.exposeString('team'),
    g: t.exposeInt('g', { nullable: true }),
    gs: t.exposeInt('gs', { nullable: true }),
    rec: t.exposeInt('rec', { nullable: true }),
    tgt: t.exposeInt('tgt', { nullable: true }),
    yds: t.exposeInt('yds', { nullable: true }),
    td: t.exposeInt('td', { nullable: true }),
    lng: t.exposeInt('lng', { nullable: true }),
    firstDowns: t.exposeInt('firstDowns', { nullable: true }),
    fumbles: t.exposeInt('fumbles', { nullable: true }),
    ydsPerRec: t.exposeFloat('ydsPerRec', { nullable: true }),
  }),
});

const FootballSeasonKickingRef = builder.objectRef<{
  season: number;
  team: string;
  g: number | null;
  fgm: number | null;
  fga: number | null;
  fgPct: number | null;
  fg019m: number | null;
  fg019a: number | null;
  fg2029m: number | null;
  fg2029a: number | null;
  fg3039m: number | null;
  fg3039a: number | null;
  fg4049m: number | null;
  fg4049a: number | null;
  fg50m: number | null;
  fg50a: number | null;
  xpm: number | null;
  xpa: number | null;
  lng: number | null;
}>('FootballSeasonKicking');

FootballSeasonKickingRef.implement({
  description: 'Season kicking stats for a football player (LS-247)',
  fields: (t) => ({
    season: t.exposeInt('season'),
    team: t.exposeString('team'),
    g: t.exposeInt('g', { nullable: true }),
    fgm: t.exposeInt('fgm', { nullable: true }),
    fga: t.exposeInt('fga', { nullable: true }),
    fgPct: t.exposeFloat('fgPct', { nullable: true }),
    fg019m: t.exposeInt('fg019m', { nullable: true }),
    fg019a: t.exposeInt('fg019a', { nullable: true }),
    fg2029m: t.exposeInt('fg2029m', { nullable: true }),
    fg2029a: t.exposeInt('fg2029a', { nullable: true }),
    fg3039m: t.exposeInt('fg3039m', { nullable: true }),
    fg3039a: t.exposeInt('fg3039a', { nullable: true }),
    fg4049m: t.exposeInt('fg4049m', { nullable: true }),
    fg4049a: t.exposeInt('fg4049a', { nullable: true }),
    fg50m: t.exposeInt('fg50m', { nullable: true }),
    fg50a: t.exposeInt('fg50a', { nullable: true }),
    xpm: t.exposeInt('xpm', { nullable: true }),
    xpa: t.exposeInt('xpa', { nullable: true }),
    lng: t.exposeInt('lng', { nullable: true }),
  }),
});

const FootballSeasonDefenseRef = builder.objectRef<{
  season: number;
  team: string;
  g: number | null;
  sacks: number | null;
  int: number | null;
  fumRec: number | null;
  defTd: number | null;
  safeties: number | null;
  ptsAllowed: number | null;
  ydsAllowed: number | null;
  passYdsAllowed: number | null;
  rushYdsAllowed: number | null;
}>('FootballSeasonDefense');

FootballSeasonDefenseRef.implement({
  description:
    'Season DST (team defense/special teams) stats for a football player (LS-247)',
  fields: (t) => ({
    season: t.exposeInt('season'),
    team: t.exposeString('team'),
    g: t.exposeInt('g', { nullable: true }),
    sacks: t.exposeFloat('sacks', { nullable: true }),
    int: t.exposeInt('int', { nullable: true }),
    fumRec: t.exposeInt('fumRec', { nullable: true }),
    defTd: t.exposeInt('defTd', { nullable: true }),
    safeties: t.exposeInt('safeties', { nullable: true }),
    ptsAllowed: t.exposeInt('ptsAllowed', { nullable: true }),
    ydsAllowed: t.exposeInt('ydsAllowed', { nullable: true }),
    passYdsAllowed: t.exposeInt('passYdsAllowed', { nullable: true }),
    rushYdsAllowed: t.exposeInt('rushYdsAllowed', { nullable: true }),
  }),
});

const FootballSeasonDefenseIdpRef = builder.objectRef<{
  season: number;
  team: string;
  g: number | null;
  gs: number | null;
  soloTkl: number | null;
  astTkl: number | null;
  totalTkl: number | null;
  sacks: number | null;
  int: number | null;
  pd: number | null;
  ff: number | null;
  fr: number | null;
  defTd: number | null;
  safeties: number | null;
}>('FootballSeasonDefenseIdp');

FootballSeasonDefenseIdpRef.implement({
  description:
    'Season individual defensive player (IDP) stats for a football player (LS-4155)',
  fields: (t) => ({
    season: t.exposeInt('season'),
    team: t.exposeString('team'),
    g: t.exposeInt('g', { nullable: true }),
    gs: t.exposeInt('gs', { nullable: true }),
    soloTkl: t.exposeInt('soloTkl', { nullable: true }),
    astTkl: t.exposeInt('astTkl', { nullable: true }),
    totalTkl: t.exposeInt('totalTkl', { nullable: true }),
    sacks: t.exposeFloat('sacks', { nullable: true }),
    int: t.exposeInt('int', { nullable: true }),
    pd: t.exposeInt('pd', { nullable: true }),
    ff: t.exposeInt('ff', { nullable: true }),
    fr: t.exposeInt('fr', { nullable: true }),
    defTd: t.exposeInt('defTd', { nullable: true }),
    safeties: t.exposeInt('safeties', { nullable: true }),
  }),
});

// ── Season stats union container ──────────────────────────────────────────────

const FootballPlayerSeasonStatsRef = builder.objectRef<{
  playerId: number;
  passing: Array<{
    season: number;
    team: string;
    g: number | null;
    gs: number | null;
    cmp: number | null;
    att: number | null;
    yds: number | null;
    td: number | null;
    int: number | null;
    sacked: number | null;
    sackYds: number | null;
    lng: number | null;
    rating: number | null;
  }>;
  rushing: Array<{
    season: number;
    team: string;
    g: number | null;
    gs: number | null;
    att: number | null;
    yds: number | null;
    td: number | null;
    lng: number | null;
    firstDowns: number | null;
    fumbles: number | null;
    ydsPerAtt: number | null;
  }>;
  receiving: Array<{
    season: number;
    team: string;
    g: number | null;
    gs: number | null;
    rec: number | null;
    tgt: number | null;
    yds: number | null;
    td: number | null;
    lng: number | null;
    firstDowns: number | null;
    fumbles: number | null;
    ydsPerRec: number | null;
  }>;
  kicking: Array<{
    season: number;
    team: string;
    g: number | null;
    fgm: number | null;
    fga: number | null;
    fgPct: number | null;
    fg019m: number | null;
    fg019a: number | null;
    fg2029m: number | null;
    fg2029a: number | null;
    fg3039m: number | null;
    fg3039a: number | null;
    fg4049m: number | null;
    fg4049a: number | null;
    fg50m: number | null;
    fg50a: number | null;
    xpm: number | null;
    xpa: number | null;
    lng: number | null;
  }>;
  defense: Array<{
    season: number;
    team: string;
    g: number | null;
    sacks: number | null;
    int: number | null;
    fumRec: number | null;
    defTd: number | null;
    safeties: number | null;
    ptsAllowed: number | null;
    ydsAllowed: number | null;
    passYdsAllowed: number | null;
    rushYdsAllowed: number | null;
  }>;
  idp: Array<{
    season: number;
    team: string;
    g: number | null;
    gs: number | null;
    soloTkl: number | null;
    astTkl: number | null;
    totalTkl: number | null;
    sacks: number | null;
    int: number | null;
    pd: number | null;
    ff: number | null;
    fr: number | null;
    defTd: number | null;
    safeties: number | null;
  }>;
}>('FootballPlayerSeasonStats');

FootballPlayerSeasonStatsRef.implement({
  description:
    'All season stats across stat categories for a football player (LS-255)',
  fields: (t) => ({
    passing: t.field({
      type: [FootballSeasonPassingRef],
      resolve: (parent) => parent.passing,
    }),
    rushing: t.field({
      type: [FootballSeasonRushingRef],
      resolve: (parent) => parent.rushing,
    }),
    receiving: t.field({
      type: [FootballSeasonReceivingRef],
      resolve: (parent) => parent.receiving,
    }),
    kicking: t.field({
      type: [FootballSeasonKickingRef],
      resolve: (parent) => parent.kicking,
    }),
    defense: t.field({
      type: [FootballSeasonDefenseRef],
      resolve: (parent) => parent.defense,
    }),
    idp: t.field({
      type: [FootballSeasonDefenseIdpRef],
      resolve: (parent) => parent.idp,
    }),
  }),
});

// ── Career stat types ─────────────────────────────────────────────────────────

const FootballCareerStatsRef = builder.objectRef<{
  playerId: number;
  passing: {
    g: number | null;
    cmp: number | null;
    att: number | null;
    yds: number | null;
    td: number | null;
    int: number | null;
    sacked: number | null;
    sackYds: number | null;
    rating: number | null;
  } | null;
  rushing: {
    g: number | null;
    att: number | null;
    yds: number | null;
    td: number | null;
    lng: number | null;
    fumbles: number | null;
  } | null;
  receiving: {
    g: number | null;
    rec: number | null;
    tgt: number | null;
    yds: number | null;
    td: number | null;
    lng: number | null;
    fumbles: number | null;
  } | null;
  kicking: {
    g: number | null;
    fgm: number | null;
    fga: number | null;
    fg019m: number | null;
    fg019a: number | null;
    fg2029m: number | null;
    fg2029a: number | null;
    fg3039m: number | null;
    fg3039a: number | null;
    fg4049m: number | null;
    fg4049a: number | null;
    fg50m: number | null;
    fg50a: number | null;
    xpm: number | null;
    xpa: number | null;
    lng: number | null;
  } | null;
  defense: {
    g: number | null;
    sacks: number | null;
    int: number | null;
    fumRec: number | null;
    defTd: number | null;
    safeties: number | null;
    ptsAllowedPerG: number | null;
    ydsAllowedPerG: number | null;
  } | null;
  idp: {
    g: number | null;
    soloTkl: number | null;
    astTkl: number | null;
    totalTkl: number | null;
    sacks: number | null;
    int: number | null;
    pd: number | null;
    ff: number | null;
    fr: number | null;
    defTd: number | null;
    safeties: number | null;
  } | null;
}>('FootballCareerStats');

const CareerPassingRef = builder.objectRef<{
  g: number | null;
  cmp: number | null;
  att: number | null;
  yds: number | null;
  td: number | null;
  int: number | null;
  sacked: number | null;
  sackYds: number | null;
  rating: number | null;
}>('FootballCareerPassing');

CareerPassingRef.implement({
  fields: (t) => ({
    g: t.exposeInt('g', { nullable: true }),
    cmp: t.exposeInt('cmp', { nullable: true }),
    att: t.exposeInt('att', { nullable: true }),
    yds: t.exposeInt('yds', { nullable: true }),
    td: t.exposeInt('td', { nullable: true }),
    int: t.exposeInt('int', { nullable: true }),
    sacked: t.exposeInt('sacked', { nullable: true }),
    sackYds: t.exposeInt('sackYds', { nullable: true }),
    rating: t.exposeFloat('rating', { nullable: true }),
  }),
});

const CareerRushingRef = builder.objectRef<{
  g: number | null;
  att: number | null;
  yds: number | null;
  td: number | null;
  lng: number | null;
  fumbles: number | null;
}>('FootballCareerRushing');

CareerRushingRef.implement({
  fields: (t) => ({
    g: t.exposeInt('g', { nullable: true }),
    att: t.exposeInt('att', { nullable: true }),
    yds: t.exposeInt('yds', { nullable: true }),
    td: t.exposeInt('td', { nullable: true }),
    lng: t.exposeInt('lng', { nullable: true }),
    fumbles: t.exposeInt('fumbles', { nullable: true }),
  }),
});

const CareerReceivingRef = builder.objectRef<{
  g: number | null;
  rec: number | null;
  tgt: number | null;
  yds: number | null;
  td: number | null;
  lng: number | null;
  fumbles: number | null;
}>('FootballCareerReceiving');

CareerReceivingRef.implement({
  fields: (t) => ({
    g: t.exposeInt('g', { nullable: true }),
    rec: t.exposeInt('rec', { nullable: true }),
    tgt: t.exposeInt('tgt', { nullable: true }),
    yds: t.exposeInt('yds', { nullable: true }),
    td: t.exposeInt('td', { nullable: true }),
    lng: t.exposeInt('lng', { nullable: true }),
    fumbles: t.exposeInt('fumbles', { nullable: true }),
  }),
});

const CareerKickingRef = builder.objectRef<{
  g: number | null;
  fgm: number | null;
  fga: number | null;
  fg019m: number | null;
  fg019a: number | null;
  fg2029m: number | null;
  fg2029a: number | null;
  fg3039m: number | null;
  fg3039a: number | null;
  fg4049m: number | null;
  fg4049a: number | null;
  fg50m: number | null;
  fg50a: number | null;
  xpm: number | null;
  xpa: number | null;
  lng: number | null;
}>('FootballCareerKicking');

CareerKickingRef.implement({
  fields: (t) => ({
    g: t.exposeInt('g', { nullable: true }),
    fgm: t.exposeInt('fgm', { nullable: true }),
    fga: t.exposeInt('fga', { nullable: true }),
    // Server-computed field goal percentage — single source of truth so clients
    // never re-derive it from fgm/fga (LS-6244). Rounded to 1 decimal to match the
    // season kicking fgPct scale (numeric(4,1)). Null when no attempts.
    fgPct: t.float({
      nullable: true,
      resolve: (k) =>
        k.fga && k.fga > 0
          ? Math.round(((k.fgm ?? 0) / k.fga) * 1000) / 10
          : null,
    }),
    fg019m: t.exposeInt('fg019m', { nullable: true }),
    fg019a: t.exposeInt('fg019a', { nullable: true }),
    fg2029m: t.exposeInt('fg2029m', { nullable: true }),
    fg2029a: t.exposeInt('fg2029a', { nullable: true }),
    fg3039m: t.exposeInt('fg3039m', { nullable: true }),
    fg3039a: t.exposeInt('fg3039a', { nullable: true }),
    fg4049m: t.exposeInt('fg4049m', { nullable: true }),
    fg4049a: t.exposeInt('fg4049a', { nullable: true }),
    fg50m: t.exposeInt('fg50m', { nullable: true }),
    fg50a: t.exposeInt('fg50a', { nullable: true }),
    xpm: t.exposeInt('xpm', { nullable: true }),
    xpa: t.exposeInt('xpa', { nullable: true }),
    lng: t.exposeInt('lng', { nullable: true }),
  }),
});

const CareerDefenseRef = builder.objectRef<{
  g: number | null;
  sacks: number | null;
  int: number | null;
  fumRec: number | null;
  defTd: number | null;
  safeties: number | null;
  ptsAllowedPerG: number | null;
  ydsAllowedPerG: number | null;
}>('FootballCareerDefense');

CareerDefenseRef.implement({
  fields: (t) => ({
    g: t.exposeInt('g', { nullable: true }),
    sacks: t.exposeFloat('sacks', { nullable: true }),
    int: t.exposeInt('int', { nullable: true }),
    fumRec: t.exposeInt('fumRec', { nullable: true }),
    defTd: t.exposeInt('defTd', { nullable: true }),
    safeties: t.exposeInt('safeties', { nullable: true }),
    ptsAllowedPerG: t.exposeFloat('ptsAllowedPerG', { nullable: true }),
    ydsAllowedPerG: t.exposeFloat('ydsAllowedPerG', { nullable: true }),
  }),
});

const CareerIdpRef = builder.objectRef<{
  g: number | null;
  soloTkl: number | null;
  astTkl: number | null;
  totalTkl: number | null;
  sacks: number | null;
  int: number | null;
  pd: number | null;
  ff: number | null;
  fr: number | null;
  defTd: number | null;
  safeties: number | null;
}>('FootballCareerIdp');

CareerIdpRef.implement({
  description: 'Career IDP totals aggregated from season_defense_idp (LS-4155)',
  fields: (t) => ({
    g: t.exposeInt('g', { nullable: true }),
    soloTkl: t.exposeInt('soloTkl', { nullable: true }),
    astTkl: t.exposeInt('astTkl', { nullable: true }),
    totalTkl: t.exposeInt('totalTkl', { nullable: true }),
    sacks: t.exposeFloat('sacks', { nullable: true }),
    int: t.exposeInt('int', { nullable: true }),
    pd: t.exposeInt('pd', { nullable: true }),
    ff: t.exposeInt('ff', { nullable: true }),
    fr: t.exposeInt('fr', { nullable: true }),
    defTd: t.exposeInt('defTd', { nullable: true }),
    safeties: t.exposeInt('safeties', { nullable: true }),
  }),
});

FootballCareerStatsRef.implement({
  description:
    'Career stat totals across all stat categories (LS-250, LS-4155)',
  fields: (t) => ({
    passing: t.field({
      type: CareerPassingRef,
      nullable: true,
      resolve: (parent) => parent.passing,
    }),
    rushing: t.field({
      type: CareerRushingRef,
      nullable: true,
      resolve: (parent) => parent.rushing,
    }),
    receiving: t.field({
      type: CareerReceivingRef,
      nullable: true,
      resolve: (parent) => parent.receiving,
    }),
    kicking: t.field({
      type: CareerKickingRef,
      nullable: true,
      resolve: (parent) => parent.kicking,
    }),
    defense: t.field({
      type: CareerDefenseRef,
      nullable: true,
      resolve: (parent) => parent.defense,
    }),
    idp: t.field({
      type: CareerIdpRef,
      nullable: true,
      resolve: (parent) => parent.idp,
    }),
    fantasyPoints: t.float({
      nullable: true,
      description:
        'Career fantasy point total computed from career stats using default PPR scoring (LS-6469). ' +
        'DST excludes per-game points-allowed band scoring since only season averages are stored.',
      resolve: (stats) => {
        // DST: flat multipliers only — ptsAllowedPerG is a season average, not
        // per-game total, so the points-allowed band cannot be applied accurately.
        if (stats.defense) {
          const d = stats.defense;
          const score = computeScoring(
            {
              sacks: d.sacks,
              int: d.int,
              fumbles_rec: d.fumRec,
              def_td: d.defTd,
              safeties: d.safeties,
            },
            DEFAULT_DEFENSE_SCORING,
          );
          // A present defense row means a valid total — preserve a 0 score
          // (do not collapse it to null, which would hide the card value).
          return score;
        }

        // IDP: career totals map cleanly to per-play multipliers.
        if (stats.idp) {
          const idp = stats.idp;
          const score = computeIDPScore(
            {
              solo_tkl: idp.soloTkl,
              ast_tkl: idp.astTkl,
              sacks: idp.sacks,
              int: idp.int,
              pd: idp.pd,
              ff: idp.ff,
              fr: idp.fr,
              def_td: idp.defTd,
              safeties: idp.safeties,
            },
            DEFAULT_IDP_SCORING,
          );
          // A present IDP row means a valid total — preserve a 0 score
          // (do not collapse it to null, which would hide the card value).
          return score;
        }

        // Offense / kicking — sum across all available stat categories.
        let total = 0;
        let hasData = false;

        if (stats.passing) {
          total += computeScoring(
            {
              yds: stats.passing.yds,
              td: stats.passing.td,
              int: stats.passing.int,
              sacked: stats.passing.sacked,
            },
            DEFAULT_PASSING_SCORING,
          );
          hasData = true;
        }
        if (stats.rushing) {
          total += computeScoring(
            {
              yds: stats.rushing.yds,
              td: stats.rushing.td,
              fumbles: stats.rushing.fumbles,
            },
            DEFAULT_RUSHING_SCORING,
          );
          hasData = true;
        }
        if (stats.receiving) {
          total += computeScoring(
            {
              rec: stats.receiving.rec,
              yds: stats.receiving.yds,
              td: stats.receiving.td,
              fumbles: stats.receiving.fumbles,
            },
            DEFAULT_RECEIVING_SCORING,
          );
          hasData = true;
        }
        if (stats.kicking) {
          // fg_50m is the 50+ yard bonus (additional pts on top of base fgm×3).
          total += computeScoring(
            {
              fgm: stats.kicking.fgm,
              fg_50m: stats.kicking.fg50m,
              xpm: stats.kicking.xpm,
            },
            DEFAULT_KICKING_SCORING,
          );
          hasData = true;
        }

        return hasData ? total : null;
      },
    }),
  }),
});

// ── Weekly game log type (LS-6233) ───────────────────────────────────────────
// isBye: true rows are explicit sentinels for a player's bye week.
// All stat fields are null on a bye row; the week field is always populated so
// the UI can never silently shift week numbers by treating gaps as absent data.

export interface FootballWeeklyGameLogShape {
  week: number;
  isBye: boolean;
  opponent: string | null;
  gameDate: string | null;
  passing: {
    cmp: number | null;
    att: number | null;
    yds: number | null;
    td: number | null;
    int: number | null;
  } | null;
  rushing: { att: number | null; yds: number | null; td: number | null } | null;
  receiving: {
    rec: number | null;
    tgt: number | null;
    yds: number | null;
    td: number | null;
  } | null;
  kicking: {
    fgm: number | null;
    fga: number | null;
    xpm: number | null;
    xpa: number | null;
  } | null;
  defense: {
    sacks: number | null;
    int: number | null;
    fumRec: number | null;
    defTd: number | null;
    safeties: number | null;
    ptsAllowed: number | null;
    ydsAllowed: number | null;
  } | null;
  idp: {
    soloTkl: number | null;
    astTkl: number | null;
    sacks: number | null;
    int: number | null;
    pd: number | null;
    ff: number | null;
    fr: number | null;
    defTd: number | null;
    safeties: number | null;
  } | null;
  fantasyPoints: number | null;
}

export const FootballWeeklyGameLogRef =
  builder.objectRef<FootballWeeklyGameLogShape>('FootballWeeklyGameLog');

FootballWeeklyGameLogRef.implement({
  description:
    'One row in a football player game log for a given NFL week (LS-6233). ' +
    'When isBye is true the row is a bye-week sentinel — all stat fields are null ' +
    'and the row must be rendered explicitly rather than hidden.',
  fields: (t) => ({
    week: t.exposeInt('week', { nullable: false }),
    isBye: t.exposeBoolean('isBye', { nullable: false }),
    opponent: t.exposeString('opponent', { nullable: true }),
    gameDate: t.exposeString('gameDate', { nullable: true }),
    passing: t.field({
      type: FootballGamePassingStatsRef,
      nullable: true,
      resolve: (parent) => parent.passing ?? null,
    }),
    rushing: t.field({
      type: FootballGameRushingStatsRef,
      nullable: true,
      resolve: (parent) => parent.rushing ?? null,
    }),
    receiving: t.field({
      type: FootballGameReceivingStatsRef,
      nullable: true,
      resolve: (parent) => parent.receiving ?? null,
    }),
    kicking: t.field({
      type: FootballGameKickingStatsRef,
      nullable: true,
      resolve: (parent) => parent.kicking ?? null,
    }),
    defense: t.field({
      type: FootballGameDefenseStatsRef,
      nullable: true,
      resolve: (parent) => parent.defense ?? null,
    }),
    idp: t.field({
      type: FootballGameIDPStatsRef,
      nullable: true,
      resolve: (parent) => parent.idp ?? null,
    }),
    fantasyPoints: t.exposeFloat('fantasyPoints', { nullable: true }),
  }),
});

// ── Per-game log type (LS-6456) ──────────────────────────────────────────────
// Exposes one row per game played by a player in a given season.
// Queries game_football_* tables and merges rows by gameNum.
// opponent/gameDate are not available in the DB layer — use the /nfl-game-logs
// REST endpoint for richer per-game views with opponent context.

export interface FootballPlayerGameLogShape {
  season: number;
  gameNum: number;
  gameIdentifier: string;
  passing: {
    cmp: number | null;
    att: number | null;
    yds: number | null;
    td: number | null;
    int: number | null;
  } | null;
  rushing: { att: number | null; yds: number | null; td: number | null } | null;
  receiving: {
    rec: number | null;
    tgt: number | null;
    yds: number | null;
    td: number | null;
  } | null;
  kicking: {
    fgm: number | null;
    fga: number | null;
    xpm: number | null;
    xpa: number | null;
  } | null;
  defense: {
    sacks: number | null;
    int: number | null;
    fumRec: number | null;
    defTd: number | null;
    safeties: number | null;
    ptsAllowed: number | null;
    ydsAllowed: number | null;
  } | null;
  idp: {
    soloTkl: number | null;
    astTkl: number | null;
    sacks: number | null;
    int: number | null;
    pd: number | null;
    ff: number | null;
    fr: number | null;
    defTd: number | null;
    safeties: number | null;
  } | null;
}

export const FootballPlayerGameLogRef =
  builder.objectRef<FootballPlayerGameLogShape>('FootballPlayerGameLog');

FootballPlayerGameLogRef.implement({
  description:
    'Per-game stat row for a football player in a given season (LS-6456). ' +
    'Merges data from game_football_passing/rushing/receiving/kicking/defense/defense_idp ' +
    'tables. Only categories with data for a game are non-null.',
  fields: (t) => ({
    season: t.exposeInt('season', { nullable: false }),
    gameNum: t.exposeInt('gameNum', { nullable: false }),
    gameIdentifier: t.exposeString('gameIdentifier', { nullable: false }),
    passing: t.field({
      type: FootballGamePassingStatsRef,
      nullable: true,
      resolve: (parent) => parent.passing,
    }),
    rushing: t.field({
      type: FootballGameRushingStatsRef,
      nullable: true,
      resolve: (parent) => parent.rushing,
    }),
    receiving: t.field({
      type: FootballGameReceivingStatsRef,
      nullable: true,
      resolve: (parent) => parent.receiving,
    }),
    kicking: t.field({
      type: FootballGameKickingStatsRef,
      nullable: true,
      resolve: (parent) => parent.kicking,
    }),
    defense: t.field({
      type: FootballGameDefenseStatsRef,
      nullable: true,
      resolve: (parent) => parent.defense,
    }),
    idp: t.field({
      type: FootballGameIDPStatsRef,
      nullable: true,
      resolve: (parent) => parent.idp,
    }),
  }),
});

// ── FootballPlayer type ───────────────────────────────────────────────────────

interface FootballPlayerShape {
  id: number;
  firstName: string;
  lastName: string;
  pfrId: string | null;
  isDst: boolean;
  nflTeam: string | null;
  position: string | null;
  jerseyNumber: number | null;
  injuriesLastSyncedAt: Date | null;
  injuryStatus: string | null;
  injuryDesignation: string | null;
  news: string | null;
  projectedFantasyPoints: number | null;
  adpRank: number | null;
}

/**
 * Career-stat categories the ingestion pipeline can write for a player at a
 * given position. The `careerStats` resolver issues one DB read per category,
 * so skipping the categories a position can never accumulate avoids wasted
 * round trips on every player-detail load (LS-6245).
 *
 * This mirrors the position routing in
 * `lib/data-loaders/src/lib/load-football-career-stats.ts`:
 *   - DST (synthetic team defense) → `career_football_defense` only
 *   - IDP individual defenders (DL/LB/DB) → `career_football_defense_idp` only
 *   - everyone else, including unknown/null positions → the offensive/kicking
 *     group (passing/rushing/receiving/kicking)
 *
 * Keeping the null/unknown case on the offensive path matches the ingestion
 * fallback, so no populated table is ever skipped (no data regression).
 */
type CareerStatCategory =
  | 'passing'
  | 'rushing'
  | 'receiving'
  | 'kicking'
  | 'defense'
  | 'idp';

/** Positions whose career stats live in `career_football_defense_idp`. */
const IDP_CAREER_POSITIONS: ReadonlySet<string> = new Set(['DL', 'LB', 'DB']);

const OFFENSIVE_CAREER_CATEGORIES: ReadonlySet<CareerStatCategory> = new Set([
  'passing',
  'rushing',
  'receiving',
  'kicking',
]);

function careerStatCategoriesForPlayer(player: {
  isDst: boolean;
  position: string | null;
}): ReadonlySet<CareerStatCategory> {
  if (player.isDst) {
    return new Set(['defense']);
  }
  if (player.position !== null && IDP_CAREER_POSITIONS.has(player.position)) {
    return new Set(['idp']);
  }
  return OFFENSIVE_CAREER_CATEGORIES;
}

const FootballPlayerRef =
  builder.objectRef<FootballPlayerShape>('FootballPlayer');

FootballPlayerRef.implement({
  description:
    'A football player (skill, IDP, or synthetic DST) with optional season and career stats (LS-255)',
  fields: (t) => ({
    id: t.exposeInt('id', { nullable: false }),
    firstName: t.exposeString('firstName', { nullable: false }),
    lastName: t.exposeString('lastName', { nullable: false }),
    pfrId: t.exposeString('pfrId', { nullable: true }),
    headshotUrl: t.field({
      type: 'String',
      nullable: true,
      resolve: (parent) => {
        if (!parent.pfrId) return null;
        const year = new Date().getFullYear();
        return `https://www.pro-football-reference.com/req/20240117/images/headshots/${parent.pfrId}_${year}.jpg`;
      },
    }),
    isDst: t.exposeBoolean('isDst', { nullable: false }),
    nflTeam: t.exposeString('nflTeam', { nullable: true }),
    position: t.exposeString('position', { nullable: true }),
    jerseyNumber: t.exposeInt('jerseyNumber', { nullable: true }),
    injuriesLastSyncedAt: t.field({
      type: 'String',
      nullable: true,
      description:
        'ISO-8601 timestamp injury data was last refreshed from the upstream ' +
        'provider, or null if never synced. Drives the freshness badge on the ' +
        'player detail page (LS-6251 / FPD-027).',
      resolve: (parent) => parent.injuriesLastSyncedAt?.toISOString() ?? null,
    }),
    previousTeams: t.field({
      type: ['String'],
      nullable: false,
      description:
        'Distinct team codes from season-stats records that differ from the current nflTeam. Non-empty when the player was traded mid-season or changed teams across seasons (LS-6238).',
      resolve: async (parent, _args, context) => {
        const db = context.db;
        const playerId = parent.id;

        const [p, ru, re, k, d, idp] = await Promise.all([
          db
            .selectDistinct({ team: PublicSchema.footballSeasonPassing.team })
            .from(PublicSchema.footballSeasonPassing)
            .where(eq(PublicSchema.footballSeasonPassing.playerId, playerId)),
          db
            .selectDistinct({ team: PublicSchema.footballSeasonRushing.team })
            .from(PublicSchema.footballSeasonRushing)
            .where(eq(PublicSchema.footballSeasonRushing.playerId, playerId)),
          db
            .selectDistinct({ team: PublicSchema.footballSeasonReceiving.team })
            .from(PublicSchema.footballSeasonReceiving)
            .where(eq(PublicSchema.footballSeasonReceiving.playerId, playerId)),
          db
            .selectDistinct({ team: PublicSchema.footballSeasonKicking.team })
            .from(PublicSchema.footballSeasonKicking)
            .where(eq(PublicSchema.footballSeasonKicking.playerId, playerId)),
          db
            .selectDistinct({ team: PublicSchema.footballSeasonDefense.team })
            .from(PublicSchema.footballSeasonDefense)
            .where(eq(PublicSchema.footballSeasonDefense.playerId, playerId)),
          db
            .selectDistinct({
              team: PublicSchema.footballSeasonDefenseIdp.team,
            })
            .from(PublicSchema.footballSeasonDefenseIdp)
            .where(
              eq(PublicSchema.footballSeasonDefenseIdp.playerId, playerId),
            ),
        ]);

        const currentTeam = parent.nflTeam;
        const allTeams = [...p, ...ru, ...re, ...k, ...d, ...idp].map(
          (r) => r.team,
        );
        return [...new Set(allTeams)].filter((team) => team !== currentTeam);
      },
    }),
    injuryStatus: t.exposeString('injuryStatus', { nullable: true }),
    injuryDesignation: t.exposeString('injuryDesignation', { nullable: true }),
    news: t.exposeString('news', { nullable: true }),
    projectedFantasyPoints: t.exposeFloat('projectedFantasyPoints', {
      nullable: true,
      description:
        'Projected season fantasy points (LS-6489 / FPL-008). Null until the ' +
        'projections pipeline populates it. Surfaced as a premium advanced filter.',
    }),
    adpRank: t.exposeInt('adpRank', {
      nullable: true,
      description:
        'Average draft position rank, 1 = earliest (LS-6489 / FPL-008). Null ' +
        'until the ADP pipeline populates it. Surfaced as a premium advanced filter.',
    }),
    seasonStats: t.field({
      type: FootballPlayerSeasonStatsRef,
      nullable: true,
      args: {
        season: t.arg.int({ required: false }),
      },
      resolve: async (parent, args, context) => {
        const db = context.db;
        const playerId = parent.id;
        const seasonFilter = args.season ?? null;

        const [passing, rushing, receiving, kicking, defense, idp] =
          await Promise.all([
            db
              .select({
                season: PublicSchema.footballSeasonPassing.season,
                team: PublicSchema.footballSeasonPassing.team,
                g: PublicSchema.footballSeasonPassing.g,
                gs: PublicSchema.footballSeasonPassing.gs,
                cmp: PublicSchema.footballSeasonPassing.cmp,
                att: PublicSchema.footballSeasonPassing.att,
                yds: PublicSchema.footballSeasonPassing.yds,
                td: PublicSchema.footballSeasonPassing.td,
                int: PublicSchema.footballSeasonPassing.int,
                sacked: PublicSchema.footballSeasonPassing.sacked,
                sackYds: PublicSchema.footballSeasonPassing.sackYds,
                lng: PublicSchema.footballSeasonPassing.lng,
                rating: PublicSchema.footballSeasonPassing.rating,
              })
              .from(PublicSchema.footballSeasonPassing)
              .where(
                and(
                  eq(PublicSchema.footballSeasonPassing.playerId, playerId),
                  seasonFilter != null
                    ? eq(
                        PublicSchema.footballSeasonPassing.season,
                        seasonFilter,
                      )
                    : undefined,
                ),
              )
              .orderBy(PublicSchema.footballSeasonPassing.season),
            db
              .select({
                season: PublicSchema.footballSeasonRushing.season,
                team: PublicSchema.footballSeasonRushing.team,
                g: PublicSchema.footballSeasonRushing.g,
                gs: PublicSchema.footballSeasonRushing.gs,
                att: PublicSchema.footballSeasonRushing.att,
                yds: PublicSchema.footballSeasonRushing.yds,
                td: PublicSchema.footballSeasonRushing.td,
                lng: PublicSchema.footballSeasonRushing.lng,
                firstDowns: PublicSchema.footballSeasonRushing.firstDowns,
                fumbles: PublicSchema.footballSeasonRushing.fumbles,
                ydsPerAtt: PublicSchema.footballSeasonRushing.ydsPerAtt,
              })
              .from(PublicSchema.footballSeasonRushing)
              .where(
                and(
                  eq(PublicSchema.footballSeasonRushing.playerId, playerId),
                  seasonFilter != null
                    ? eq(
                        PublicSchema.footballSeasonRushing.season,
                        seasonFilter,
                      )
                    : undefined,
                ),
              )
              .orderBy(PublicSchema.footballSeasonRushing.season),
            db
              .select({
                season: PublicSchema.footballSeasonReceiving.season,
                team: PublicSchema.footballSeasonReceiving.team,
                g: PublicSchema.footballSeasonReceiving.g,
                gs: PublicSchema.footballSeasonReceiving.gs,
                rec: PublicSchema.footballSeasonReceiving.rec,
                tgt: PublicSchema.footballSeasonReceiving.tgt,
                yds: PublicSchema.footballSeasonReceiving.yds,
                td: PublicSchema.footballSeasonReceiving.td,
                lng: PublicSchema.footballSeasonReceiving.lng,
                firstDowns: PublicSchema.footballSeasonReceiving.firstDowns,
                fumbles: PublicSchema.footballSeasonReceiving.fumbles,
                ydsPerRec: PublicSchema.footballSeasonReceiving.ydsPerRec,
              })
              .from(PublicSchema.footballSeasonReceiving)
              .where(
                and(
                  eq(PublicSchema.footballSeasonReceiving.playerId, playerId),
                  seasonFilter != null
                    ? eq(
                        PublicSchema.footballSeasonReceiving.season,
                        seasonFilter,
                      )
                    : undefined,
                ),
              )
              .orderBy(PublicSchema.footballSeasonReceiving.season),
            db
              .select({
                season: PublicSchema.footballSeasonKicking.season,
                team: PublicSchema.footballSeasonKicking.team,
                g: PublicSchema.footballSeasonKicking.g,
                fgm: PublicSchema.footballSeasonKicking.fgm,
                fga: PublicSchema.footballSeasonKicking.fga,
                fgPct: PublicSchema.footballSeasonKicking.fgPct,
                fg019m: PublicSchema.footballSeasonKicking.fg019m,
                fg019a: PublicSchema.footballSeasonKicking.fg019a,
                fg2029m: PublicSchema.footballSeasonKicking.fg2029m,
                fg2029a: PublicSchema.footballSeasonKicking.fg2029a,
                fg3039m: PublicSchema.footballSeasonKicking.fg3039m,
                fg3039a: PublicSchema.footballSeasonKicking.fg3039a,
                fg4049m: PublicSchema.footballSeasonKicking.fg4049m,
                fg4049a: PublicSchema.footballSeasonKicking.fg4049a,
                fg50m: PublicSchema.footballSeasonKicking.fg50m,
                fg50a: PublicSchema.footballSeasonKicking.fg50a,
                xpm: PublicSchema.footballSeasonKicking.xpm,
                xpa: PublicSchema.footballSeasonKicking.xpa,
                lng: PublicSchema.footballSeasonKicking.lng,
              })
              .from(PublicSchema.footballSeasonKicking)
              .where(
                and(
                  eq(PublicSchema.footballSeasonKicking.playerId, playerId),
                  seasonFilter != null
                    ? eq(
                        PublicSchema.footballSeasonKicking.season,
                        seasonFilter,
                      )
                    : undefined,
                ),
              )
              .orderBy(PublicSchema.footballSeasonKicking.season),
            db
              .select({
                season: PublicSchema.footballSeasonDefense.season,
                team: PublicSchema.footballSeasonDefense.team,
                g: PublicSchema.footballSeasonDefense.g,
                sacks: PublicSchema.footballSeasonDefense.sacks,
                int: PublicSchema.footballSeasonDefense.int,
                fumRec: PublicSchema.footballSeasonDefense.fumRec,
                defTd: PublicSchema.footballSeasonDefense.defTd,
                safeties: PublicSchema.footballSeasonDefense.safeties,
                ptsAllowed: PublicSchema.footballSeasonDefense.ptsAllowed,
                ydsAllowed: PublicSchema.footballSeasonDefense.ydsAllowed,
                passYdsAllowed:
                  PublicSchema.footballSeasonDefense.passYdsAllowed,
                rushYdsAllowed:
                  PublicSchema.footballSeasonDefense.rushYdsAllowed,
              })
              .from(PublicSchema.footballSeasonDefense)
              .where(
                and(
                  eq(PublicSchema.footballSeasonDefense.playerId, playerId),
                  seasonFilter != null
                    ? eq(
                        PublicSchema.footballSeasonDefense.season,
                        seasonFilter,
                      )
                    : undefined,
                ),
              )
              .orderBy(PublicSchema.footballSeasonDefense.season),
            db
              .select({
                season: PublicSchema.footballSeasonDefenseIdp.season,
                team: PublicSchema.footballSeasonDefenseIdp.team,
                g: PublicSchema.footballSeasonDefenseIdp.g,
                gs: PublicSchema.footballSeasonDefenseIdp.gs,
                soloTkl: PublicSchema.footballSeasonDefenseIdp.soloTkl,
                astTkl: PublicSchema.footballSeasonDefenseIdp.astTkl,
                totalTkl: PublicSchema.footballSeasonDefenseIdp.totalTkl,
                sacks: PublicSchema.footballSeasonDefenseIdp.sacks,
                int: PublicSchema.footballSeasonDefenseIdp.int,
                pd: PublicSchema.footballSeasonDefenseIdp.pd,
                ff: PublicSchema.footballSeasonDefenseIdp.ff,
                fr: PublicSchema.footballSeasonDefenseIdp.fr,
                defTd: PublicSchema.footballSeasonDefenseIdp.defTd,
                safeties: PublicSchema.footballSeasonDefenseIdp.safeties,
              })
              .from(PublicSchema.footballSeasonDefenseIdp)
              .where(
                and(
                  eq(PublicSchema.footballSeasonDefenseIdp.playerId, playerId),
                  seasonFilter != null
                    ? eq(
                        PublicSchema.footballSeasonDefenseIdp.season,
                        seasonFilter,
                      )
                    : undefined,
                ),
              )
              .orderBy(PublicSchema.footballSeasonDefenseIdp.season),
          ]);

        return {
          playerId,
          passing: passing.map((r) => ({ ...r, rating: toFloat(r.rating) })),
          rushing: rushing.map((r) => ({
            ...r,
            ydsPerAtt: toFloat(r.ydsPerAtt),
          })),
          receiving: receiving.map((r) => ({
            ...r,
            ydsPerRec: toFloat(r.ydsPerRec),
          })),
          kicking: kicking.map((r) => ({
            ...r,
            fgPct: toFloat(r.fgPct),
          })),
          defense: defense.map((r) => ({
            ...r,
            sacks: toFloat(r.sacks),
          })),
          idp: idp.map((r) => ({ ...r, sacks: toFloat(r.sacks) })),
        };
      },
    }),
    careerStats: t.field({
      type: FootballCareerStatsRef,
      nullable: true,
      resolve: async (parent, _args, context) => {
        // Career stats are intentionally gated on authentication only — NOT on
        // a premium subscription tier (LS-6248). QA finding FPD-024 flagged the
        // absence of a premium entitlement check here as a potential leak; the
        // product decision is that career stats are an authenticated (logged-in)
        // feature available to all tiers, mirroring the public `seasonStats`
        // field. This is a deliberate choice, not an oversight: do NOT add a
        // `requirePremium`/`requireEntitlement` gate without an accompanying
        // product/entitlement change. The regression test in
        // `football.resolver.spec.ts` asserts this auth-only (non-premium)
        // contract so the decision is not silently changed.
        if (!context.user) {
          throw AuthenticationError(
            'Authentication required to query football career stats',
          );
        }
        const db = context.db;
        const playerId = parent.id;

        // Only read the career tables the ingestion path can populate for this
        // player's position — a QB never has IDP rows, a kicker never has
        // passing rows, etc. Skipping guaranteed-empty reads turns the fixed
        // six round trips per detail load into 1 (DST/IDP) or 4 (offensive)
        // (LS-6245).
        const categories = careerStatCategoriesForPlayer(parent);
        const skip = Promise.resolve([] as never[]);

        const [
          passingRows,
          rushingRows,
          receivingRows,
          kickingRows,
          defenseRows,
          idpRows,
        ] = await Promise.all([
          categories.has('passing')
            ? db
                .select()
                .from(PublicSchema.careerFootballPassing)
                .where(
                  eq(PublicSchema.careerFootballPassing.playerId, playerId),
                )
                .limit(1)
            : skip,
          categories.has('rushing')
            ? db
                .select()
                .from(PublicSchema.careerFootballRushing)
                .where(
                  eq(PublicSchema.careerFootballRushing.playerId, playerId),
                )
                .limit(1)
            : skip,
          categories.has('receiving')
            ? db
                .select()
                .from(PublicSchema.careerFootballReceiving)
                .where(
                  eq(PublicSchema.careerFootballReceiving.playerId, playerId),
                )
                .limit(1)
            : skip,
          categories.has('kicking')
            ? db
                .select()
                .from(PublicSchema.careerFootballKicking)
                .where(
                  eq(PublicSchema.careerFootballKicking.playerId, playerId),
                )
                .limit(1)
            : skip,
          categories.has('defense')
            ? db
                .select()
                .from(PublicSchema.careerFootballDefense)
                .where(
                  eq(PublicSchema.careerFootballDefense.playerId, playerId),
                )
                .limit(1)
            : skip,
          categories.has('idp')
            ? db
                .select()
                .from(PublicSchema.careerFootballDefenseIdp)
                .where(
                  eq(PublicSchema.careerFootballDefenseIdp.playerId, playerId),
                )
                .limit(1)
            : skip,
        ]);

        const p = passingRows[0] ?? null;
        const ru = rushingRows[0] ?? null;
        const re = receivingRows[0] ?? null;
        const k = kickingRows[0] ?? null;
        const d = defenseRows[0] ?? null;
        const idp = idpRows[0] ?? null;

        return {
          playerId,
          passing: p ? { ...p, rating: toFloat(p.rating) } : null,
          rushing: ru ?? null,
          receiving: re ?? null,
          kicking: k ?? null,
          defense: d
            ? {
                ...d,
                sacks: toFloat(d.sacks),
                ptsAllowedPerG: toFloat(d.ptsAllowedPerG),
                ydsAllowedPerG: toFloat(d.ydsAllowedPerG),
              }
            : null,
          idp: idp ? { ...idp, sacks: toFloat(idp.sacks) } : null,
        };
      },
    }),
    weeklyGameLogs: t.field({
      type: [FootballWeeklyGameLogRef],
      nullable: false,
      description:
        'Per-week game log for the given season (LS-6233). ' +
        'Bye weeks appear as explicit rows with isBye:true — never a gap.',
      args: {
        season: t.arg.int({ required: true }),
      },
      resolve: (_parent, _args, _context) => {
        // TODO (LS-6233): implement when weeklyStats data source exists.
        // Contract: inject an explicit { isBye: true } sentinel row for every
        // bye week — never omit weeks, as gaps silently shift week numbers in UI.
        return [];
      },
    }),
    gameLogs: t.field({
      type: [FootballPlayerGameLogRef],
      nullable: false,
      description:
        'Per-game stat log for a given season (LS-6456). ' +
        'Queries game_football_* tables and returns one row per game played, ' +
        'with only the stat categories that have data for that game.',
      args: {
        season: t.arg.int({ required: true }),
      },
      resolve: async (parent, args, context) => {
        if (!context.user) {
          throw AuthenticationError(
            'Authentication required to query football game logs',
          );
        }
        const db = context.db;
        const playerId = parent.id;
        const season = args.season;

        const [passing, rushing, receiving, kicking, defense, idp] =
          await Promise.all([
            db
              .select()
              .from(PublicSchema.gameFootballPassing)
              .where(
                and(
                  eq(PublicSchema.gameFootballPassing.playerId, playerId),
                  eq(PublicSchema.gameFootballPassing.season, season),
                ),
              )
              .orderBy(PublicSchema.gameFootballPassing.gameNum),
            db
              .select()
              .from(PublicSchema.gameFootballRushing)
              .where(
                and(
                  eq(PublicSchema.gameFootballRushing.playerId, playerId),
                  eq(PublicSchema.gameFootballRushing.season, season),
                ),
              )
              .orderBy(PublicSchema.gameFootballRushing.gameNum),
            db
              .select()
              .from(PublicSchema.gameFootballReceiving)
              .where(
                and(
                  eq(PublicSchema.gameFootballReceiving.playerId, playerId),
                  eq(PublicSchema.gameFootballReceiving.season, season),
                ),
              )
              .orderBy(PublicSchema.gameFootballReceiving.gameNum),
            db
              .select()
              .from(PublicSchema.gameFootballKicking)
              .where(
                and(
                  eq(PublicSchema.gameFootballKicking.playerId, playerId),
                  eq(PublicSchema.gameFootballKicking.season, season),
                ),
              )
              .orderBy(PublicSchema.gameFootballKicking.gameNum),
            db
              .select()
              .from(PublicSchema.gameFootballDefense)
              .where(
                and(
                  eq(PublicSchema.gameFootballDefense.playerId, playerId),
                  eq(PublicSchema.gameFootballDefense.season, season),
                ),
              )
              .orderBy(PublicSchema.gameFootballDefense.gameNum),
            db
              .select()
              .from(PublicSchema.gameFootballDefenseIdp)
              .where(
                and(
                  eq(PublicSchema.gameFootballDefenseIdp.playerId, playerId),
                  eq(PublicSchema.gameFootballDefenseIdp.season, season),
                ),
              )
              .orderBy(PublicSchema.gameFootballDefenseIdp.gameNum),
          ]);

        const byGame = new Map<number, FootballPlayerGameLogShape>();

        const ensure = (
          gameNum: number,
          gameIdentifier: string,
        ): FootballPlayerGameLogShape => {
          if (!byGame.has(gameNum)) {
            byGame.set(gameNum, {
              season,
              gameNum,
              gameIdentifier,
              passing: null,
              rushing: null,
              receiving: null,
              kicking: null,
              defense: null,
              idp: null,
            });
          }
          return byGame.get(gameNum)!;
        };

        for (const r of passing) {
          const row = ensure(r.gameNum, r.gameIdentifier);
          row.passing = {
            cmp: r.cmp,
            att: r.att,
            yds: r.yds,
            td: r.td,
            int: r.interceptions,
          };
        }
        for (const r of rushing) {
          const row = ensure(r.gameNum, r.gameIdentifier);
          row.rushing = { att: r.att, yds: r.yds, td: r.td };
        }
        for (const r of receiving) {
          const row = ensure(r.gameNum, r.gameIdentifier);
          row.receiving = { rec: r.rec, tgt: r.tgt, yds: r.yds, td: r.td };
        }
        for (const r of kicking) {
          const row = ensure(r.gameNum, r.gameIdentifier);
          row.kicking = { fgm: r.fgm, fga: r.fga, xpm: r.xpm, xpa: r.xpa };
        }
        for (const r of defense) {
          const row = ensure(r.gameNum, r.gameIdentifier);
          row.defense = {
            sacks: r.sacks,
            int: r.interceptions,
            fumRec: r.fumblesRec,
            defTd: r.defTd,
            safeties: r.safeties,
            ptsAllowed: r.ptsAllowed,
            ydsAllowed: r.ydsAllowed,
          };
        }
        for (const r of idp) {
          const row = ensure(r.gameNum, r.gameIdentifier);
          row.idp = {
            soloTkl: r.soloTkl,
            astTkl: r.astTkl,
            sacks: toFloat(r.sacks),
            int: r.interceptions,
            pd: r.pd,
            ff: r.ff,
            fr: r.fr,
            defTd: r.defTd,
            safeties: r.safeties,
          };
        }

        return Array.from(byGame.values()).sort(
          (a, b) => a.gameNum - b.gameNum,
        );
      },
    }),
  }),
});

// ── FootballPlayersConnection type ────────────────────────────────────────────

const FootballPlayersPageInfoRef = builder.objectRef<{
  hasNextPage: boolean;
  endCursor: string | null;
}>('FootballPlayersPageInfo');

FootballPlayersPageInfoRef.implement({
  fields: (t) => ({
    hasNextPage: t.exposeBoolean('hasNextPage', { nullable: false }),
    endCursor: t.exposeString('endCursor', { nullable: true }),
  }),
});

const FootballPlayersConnectionRef = builder.objectRef<{
  nodes: FootballPlayerShape[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}>('FootballPlayersConnection');

FootballPlayersConnectionRef.implement({
  description: 'Cursor-paginated list of football players (LS-255)',
  fields: (t) => ({
    nodes: t.field({
      type: [FootballPlayerRef],
      nullable: false,
      resolve: (parent) => parent.nodes,
    }),
    pageInfo: t.field({
      type: FootballPlayersPageInfoRef,
      nullable: false,
      resolve: (parent) => parent.pageInfo,
    }),
  }),
});

// ── Queries ───────────────────────────────────────────────────────────────────

const FOOTBALL_PLAYERS_PAGE_SIZE = 25;

const VALID_FOOTBALL_POSITIONS = [
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DL',
  'LB',
  'DB',
  'DST',
] as const;

type PlayerPosition = (typeof VALID_FOOTBALL_POSITIONS)[number];

function isValidPosition(p: string): p is PlayerPosition {
  return (VALID_FOOTBALL_POSITIONS as readonly string[]).includes(p);
}

// Pseudo-positions are not stored player positions — they expand to the
// concrete positions eligible for a roster slot (LS-6489). A request for any of
// these keys matches every constituent position.
const PSEUDO_POSITION_EXPANSIONS: Record<string, readonly PlayerPosition[]> = {
  FLEX: ['RB', 'WR', 'TE'],
  SUPERFLEX: ['QB', 'RB', 'WR', 'TE'],
  IDP: ['DL', 'LB', 'DB'],
};

const VALID_NFL_TEAMS = [
  'ARI',
  'ATL',
  'BAL',
  'BUF',
  'CAR',
  'CHI',
  'CIN',
  'CLE',
  'DAL',
  'DEN',
  'DET',
  'GB',
  'HOU',
  'IND',
  'JAX',
  'KC',
  'LAC',
  'LAR',
  'LV',
  'MIA',
  'MIN',
  'NE',
  'NO',
  'NYG',
  'NYJ',
  'PHI',
  'PIT',
  'SEA',
  'SF',
  'TB',
  'TEN',
  'WAS',
] as const;

type NflTeamAbbr = (typeof VALID_NFL_TEAMS)[number];

function isValidNflTeam(t: string): t is NflTeamAbbr {
  return (VALID_NFL_TEAMS as readonly string[]).includes(t);
}

const VALID_CONFERENCES = ['AFC', 'NFC'] as const;
type NflConference = (typeof VALID_CONFERENCES)[number];

function isValidConference(c: string): c is NflConference {
  return (VALID_CONFERENCES as readonly string[]).includes(c);
}

// Static conference-to-teams mapping derived from NFL_TEAMS in shared-components.
// Maintained here to avoid a cross-package import in the lambda schema layer.
const CONFERENCE_TEAMS: Record<NflConference, NflTeamAbbr[]> = {
  AFC: [
    'BUF',
    'MIA',
    'NE',
    'NYJ',
    'BAL',
    'CIN',
    'CLE',
    'PIT',
    'HOU',
    'IND',
    'JAX',
    'TEN',
    'DEN',
    'KC',
    'LV',
    'LAC',
  ],
  NFC: [
    'DAL',
    'NYG',
    'PHI',
    'WAS',
    'CHI',
    'DET',
    'GB',
    'MIN',
    'ATL',
    'CAR',
    'NO',
    'TB',
    'ARI',
    'LAR',
    'SEA',
    'SF',
  ],
};

// Sortable columns that live directly on the `players` table (LS-6473). Stat-
// based sorts (yards, TDs, fantasy points) would require joining the season-
// stats tables and are intentionally out of scope here.
const VALID_FOOTBALL_PLAYER_SORTS = ['name', 'position', 'team'] as const;

type FootballPlayerSort = (typeof VALID_FOOTBALL_PLAYER_SORTS)[number];

function isValidPlayerSort(s: string): s is FootballPlayerSort {
  return (VALID_FOOTBALL_PLAYER_SORTS as readonly string[]).includes(s);
}

builder.queryField('footballPlayers', (t) =>
  t.field({
    type: FootballPlayersConnectionRef,
    description:
      'Paginated list of football players, optionally filtered by position (LS-255)',
    args: {
      // `position` (single) is retained for backward compatibility with
      // existing clients (e.g. the shared-components draft preview). `positions`
      // (multi) supersedes it for the players-list filter so callers can view
      // several positions at once, e.g. QB + RB (LS-6464). When both are
      // supplied they are merged into one `inArray` filter (OR semantics).
      position: t.arg.string({ required: false }),
      positions: t.arg.stringList({ required: false }),
      nflTeam: t.arg.string({ required: false }),
      conference: t.arg.string({ required: false }),
      search: t.arg.string({ required: false }),
      after: t.arg.string({ required: false }),
      first: t.arg.int({ required: false }),
      // Premium-only advanced search filters (LS-6489 / FPL-008). Gated behind
      // the `advanced_search_filters` entitlement: a free-tier request that
      // supplies any of these is rejected with a PremiumRequiredError.
      injuryStatus: t.arg.string({ required: false }),
      minProjectedPoints: t.arg.float({ required: false }),
      maxAdpRank: t.arg.int({ required: false }),
      // Sort over columns on the players table only — 'name' (lastName,
      // firstName), 'position', or 'team' (nflTeam). Unset preserves the
      // historical default of ordering by id (LS-6473).
      sortBy: t.arg.string({ required: false }),
      sortDir: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to query football players',
        );
      }

      // Advanced filters are a premium capability. Only enforce the entitlement
      // when one is actually supplied so the basic list stays open to all tiers
      // and existing callers are unaffected.
      const usesAdvancedFilter =
        args.injuryStatus != null ||
        args.minProjectedPoints != null ||
        args.maxAdpRank != null;
      if (usesAdvancedFilter) {
        await requireEntitlement(context, ENTITLEMENTS.advanced_search_filters);
      }

      const db = context.db;
      const limit = Math.min(args.first ?? FOOTBALL_PLAYERS_PAGE_SIZE, 100);

      // Sorting by a non-id column means id is no longer monotonic with the
      // result order, so the previous keyset cursor (`id > after`) can't be
      // reused. Switch to an offset cursor: `after` is the count of rows
      // already consumed, and `endCursor` advances it by the page size. The
      // frontend treats the cursor as opaque, so this is transparent to it.
      const parsedOffset = args.after != null ? parseInt(args.after, 10) : null;
      const offset =
        parsedOffset != null && !isNaN(parsedOffset) && parsedOffset > 0
          ? parsedOffset
          : 0;

      if (args.sortBy != null && !isValidPlayerSort(args.sortBy)) {
        throw UserInputError(`Invalid sortBy: ${args.sortBy}`);
      }
      const sortDir = args.sortDir ?? 'asc';
      if (sortDir !== 'asc' && sortDir !== 'desc') {
        throw UserInputError(`Invalid sortDir: ${args.sortDir}`);
      }
      const dir = sortDir === 'desc' ? desc : asc;

      const conditions: SQL[] = [eq(PublicSchema.players.sport, 'football')];

      // Merge the single `position` and multi `positions` args into one deduped
      // filter, expanding the pseudo-positions (FLEX / SUPERFLEX / IDP) to their
      // constituent positions. A single concrete value collapses to `eq`
      // semantics inside `inArray`, so backward compatibility is preserved.
      // Pseudo-positions came from LS-6489; multi-select from LS-6464.
      const requestedPositions = [
        ...(args.positions ?? []),
        ...(args.position != null ? [args.position] : []),
      ];
      const positionFilter: PlayerPosition[] = [];
      for (const p of requestedPositions) {
        const expansion = PSEUDO_POSITION_EXPANSIONS[p];
        if (expansion) {
          positionFilter.push(...expansion);
          continue;
        }
        if (!isValidPosition(p)) {
          throw UserInputError(`Invalid position: ${p}`);
        }
        positionFilter.push(p);
      }
      if (positionFilter.length > 0) {
        conditions.push(
          inArray(PublicSchema.players.position, [...new Set(positionFilter)]),
        );
      }

      if (args.nflTeam) {
        if (!isValidNflTeam(args.nflTeam)) {
          throw UserInputError(`Invalid NFL team: ${args.nflTeam}`);
        }
        conditions.push(eq(PublicSchema.players.nflTeam, args.nflTeam));
      }

      if (args.conference) {
        if (!isValidConference(args.conference)) {
          throw UserInputError(`Invalid NFL conference: ${args.conference}`);
        }
        conditions.push(
          inArray(
            PublicSchema.players.nflTeam,
            CONFERENCE_TEAMS[args.conference],
          ),
        );
      }

      if (args.search) {
        const tokens = args.search.trim().split(/\s+/).filter(Boolean);
        const tokenConditions = tokens.map((token) => {
          const escaped = token.replace(/[\\%_]/g, '\\$&');
          const pattern = `%${escaped}%`;
          return or(
            sql<boolean>`${PublicSchema.players.firstName} ILIKE ${pattern} ESCAPE '\\'`,
            sql<boolean>`${PublicSchema.players.lastName} ILIKE ${pattern} ESCAPE '\\'`,
          )!;
        });
        conditions.push(
          tokenConditions.length === 1
            ? tokenConditions[0]
            : and(...tokenConditions)!,
        );
      }

      // Premium advanced filters. Each is an inclusive threshold/exact match;
      // players with a NULL projection/ADP are excluded by the numeric filters
      // (NULL comparisons are not true), which is the desired behavior — an
      // un-projected player should not surface in a "top projected" search.
      if (args.injuryStatus != null) {
        conditions.push(
          eq(PublicSchema.players.injuryStatus, args.injuryStatus),
        );
      }

      if (args.minProjectedPoints != null) {
        conditions.push(
          gte(
            PublicSchema.players.projectedFantasyPoints,
            args.minProjectedPoints,
          ),
        );
      }

      if (args.maxAdpRank != null) {
        conditions.push(lte(PublicSchema.players.adpRank, args.maxAdpRank));
      }

      // Append id as a stable tiebreaker so pages don't overlap or skip rows
      // when the sort column has duplicate values (e.g. many WRs, same team).
      const orderBy: SQL[] = [];
      switch (args.sortBy) {
        case 'name':
          orderBy.push(
            dir(PublicSchema.players.lastName),
            dir(PublicSchema.players.firstName),
            asc(PublicSchema.players.id),
          );
          break;
        case 'position':
          orderBy.push(
            dir(PublicSchema.players.position),
            asc(PublicSchema.players.id),
          );
          break;
        case 'team':
          orderBy.push(
            dir(PublicSchema.players.nflTeam),
            asc(PublicSchema.players.id),
          );
          break;
        default:
          orderBy.push(dir(PublicSchema.players.id));
          break;
      }

      const rows = await db
        .select({
          id: PublicSchema.players.id,
          firstName: PublicSchema.players.firstName,
          lastName: PublicSchema.players.lastName,
          pfrId: PublicSchema.players.pfrId,
          isDst: PublicSchema.players.isDst,
          nflTeam: PublicSchema.players.nflTeam,
          position: PublicSchema.players.position,
          jerseyNumber: PublicSchema.players.jerseyNumber,
          injuriesLastSyncedAt: PublicSchema.players.injuriesLastSyncedAt,
          injuryStatus: PublicSchema.players.injuryStatus,
          injuryDesignation: PublicSchema.players.injuryDesignation,
          news: PublicSchema.players.news,
          projectedFantasyPoints: PublicSchema.players.projectedFantasyPoints,
          adpRank: PublicSchema.players.adpRank,
        })
        .from(PublicSchema.players)
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(limit + 1)
        .offset(offset);

      const hasNextPage = rows.length > limit;
      const nodes = rows.slice(0, limit);
      const endCursor = nodes.length > 0 ? String(offset + nodes.length) : null;

      return {
        nodes,
        pageInfo: {
          hasNextPage,
          endCursor,
        },
      };
    },
  }),
);

builder.queryField('footballPlayer', (t) =>
  t.field({
    type: FootballPlayerRef,
    nullable: true,
    description: 'Fetch a single football player by ID (LS-255)',
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to query football players',
        );
      }

      const db = context.db;

      const rows = await db
        .select({
          id: PublicSchema.players.id,
          firstName: PublicSchema.players.firstName,
          lastName: PublicSchema.players.lastName,
          pfrId: PublicSchema.players.pfrId,
          isDst: PublicSchema.players.isDst,
          nflTeam: PublicSchema.players.nflTeam,
          position: PublicSchema.players.position,
          jerseyNumber: PublicSchema.players.jerseyNumber,
          injuriesLastSyncedAt: PublicSchema.players.injuriesLastSyncedAt,
          injuryStatus: PublicSchema.players.injuryStatus,
          injuryDesignation: PublicSchema.players.injuryDesignation,
          news: PublicSchema.players.news,
          projectedFantasyPoints: PublicSchema.players.projectedFantasyPoints,
          adpRank: PublicSchema.players.adpRank,
        })
        .from(PublicSchema.players)
        .where(
          and(
            eq(PublicSchema.players.id, args.id),
            eq(PublicSchema.players.sport, 'football'),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    },
  }),
);

// ── Game-level stat types (matchup player game display, LS-4765) ──────────────

export const FootballGamePassingStatsRef = builder.objectRef<{
  cmp: number | null;
  att: number | null;
  yds: number | null;
  td: number | null;
  int: number | null;
}>('FootballGamePassingStats');

FootballGamePassingStatsRef.implement({
  description: 'Per-game passing stats for a football matchup player',
  fields: (t) => ({
    cmp: t.exposeInt('cmp', { nullable: true }),
    att: t.exposeInt('att', { nullable: true }),
    yds: t.exposeInt('yds', { nullable: true }),
    td: t.exposeInt('td', { nullable: true }),
    int: t.exposeInt('int', { nullable: true }),
  }),
});

export const FootballGameRushingStatsRef = builder.objectRef<{
  att: number | null;
  yds: number | null;
  td: number | null;
}>('FootballGameRushingStats');

FootballGameRushingStatsRef.implement({
  description: 'Per-game rushing stats for a football matchup player',
  fields: (t) => ({
    att: t.exposeInt('att', { nullable: true }),
    yds: t.exposeInt('yds', { nullable: true }),
    td: t.exposeInt('td', { nullable: true }),
  }),
});

export const FootballGameReceivingStatsRef = builder.objectRef<{
  rec: number | null;
  tgt: number | null;
  yds: number | null;
  td: number | null;
}>('FootballGameReceivingStats');

FootballGameReceivingStatsRef.implement({
  description: 'Per-game receiving stats for a football matchup player',
  fields: (t) => ({
    rec: t.exposeInt('rec', { nullable: true }),
    tgt: t.exposeInt('tgt', { nullable: true }),
    yds: t.exposeInt('yds', { nullable: true }),
    td: t.exposeInt('td', { nullable: true }),
  }),
});

export const FootballGameKickingStatsRef = builder.objectRef<{
  fgm: number | null;
  fga: number | null;
  xpm: number | null;
  xpa: number | null;
}>('FootballGameKickingStats');

FootballGameKickingStatsRef.implement({
  description: 'Per-game kicking stats for a football matchup player',
  fields: (t) => ({
    fgm: t.exposeInt('fgm', { nullable: true }),
    fga: t.exposeInt('fga', { nullable: true }),
    xpm: t.exposeInt('xpm', { nullable: true }),
    xpa: t.exposeInt('xpa', { nullable: true }),
  }),
});

export const FootballGameDefenseStatsRef = builder.objectRef<{
  sacks: number | null;
  int: number | null;
  fumRec: number | null;
  defTd: number | null;
  safeties: number | null;
  ptsAllowed: number | null;
  ydsAllowed: number | null;
}>('FootballGameDefenseStats');

FootballGameDefenseStatsRef.implement({
  description:
    'Per-game DST (team defense) stats for a football matchup player',
  fields: (t) => ({
    sacks: t.exposeFloat('sacks', { nullable: true }),
    int: t.exposeInt('int', { nullable: true }),
    fumRec: t.exposeInt('fumRec', { nullable: true }),
    defTd: t.exposeInt('defTd', { nullable: true }),
    safeties: t.exposeInt('safeties', { nullable: true }),
    ptsAllowed: t.exposeInt('ptsAllowed', { nullable: true }),
    ydsAllowed: t.exposeInt('ydsAllowed', { nullable: true }),
  }),
});

export const FootballGameIDPStatsRef = builder.objectRef<{
  soloTkl: number | null;
  astTkl: number | null;
  sacks: number | null;
  int: number | null;
  pd: number | null;
  ff: number | null;
  fr: number | null;
  defTd: number | null;
  safeties: number | null;
}>('FootballGameIDPStats');

FootballGameIDPStatsRef.implement({
  description: 'Per-game IDP (individual defensive player) stats',
  fields: (t) => ({
    soloTkl: t.exposeInt('soloTkl', { nullable: true }),
    astTkl: t.exposeInt('astTkl', { nullable: true }),
    sacks: t.exposeFloat('sacks', { nullable: true }),
    int: t.exposeInt('int', { nullable: true }),
    pd: t.exposeInt('pd', { nullable: true }),
    ff: t.exposeInt('ff', { nullable: true }),
    fr: t.exposeInt('fr', { nullable: true }),
    defTd: t.exposeInt('defTd', { nullable: true }),
    safeties: t.exposeInt('safeties', { nullable: true }),
  }),
});

// ── Matchup player game type ──────────────────────────────────────────────────

export interface FootballMatchupPlayerGameShape {
  gameNum: number;
  gameIdentifier: string;
  opponent: string | null;
  gameDate: string | null;
  passing: {
    cmp: number | null;
    att: number | null;
    yds: number | null;
    td: number | null;
    int: number | null;
  } | null;
  rushing: { att: number | null; yds: number | null; td: number | null } | null;
  receiving: {
    rec: number | null;
    tgt: number | null;
    yds: number | null;
    td: number | null;
  } | null;
  kicking: {
    fgm: number | null;
    fga: number | null;
    xpm: number | null;
    xpa: number | null;
  } | null;
  defense: {
    sacks: number | null;
    int: number | null;
    fumRec: number | null;
    defTd: number | null;
    safeties: number | null;
    ptsAllowed: number | null;
    ydsAllowed: number | null;
  } | null;
  idp: {
    soloTkl: number | null;
    astTkl: number | null;
    sacks: number | null;
    int: number | null;
    pd: number | null;
    ff: number | null;
    fr: number | null;
    defTd: number | null;
    safeties: number | null;
  } | null;
  fantasyPoints: number;
}

export const FootballMatchupPlayerGameRef =
  builder.objectRef<FootballMatchupPlayerGameShape>(
    'FootballMatchupPlayerGame',
  );

FootballMatchupPlayerGameRef.implement({
  description: 'A single NFL game played by a football matchup player',
  fields: (t) => ({
    gameNum: t.exposeInt('gameNum', { nullable: false }),
    gameIdentifier: t.exposeString('gameIdentifier', { nullable: false }),
    opponent: t.exposeString('opponent', { nullable: true }),
    gameDate: t.exposeString('gameDate', { nullable: true }),
    passing: t.field({
      type: FootballGamePassingStatsRef,
      nullable: true,
      resolve: (parent) => parent.passing ?? null,
    }),
    rushing: t.field({
      type: FootballGameRushingStatsRef,
      nullable: true,
      resolve: (parent) => parent.rushing ?? null,
    }),
    receiving: t.field({
      type: FootballGameReceivingStatsRef,
      nullable: true,
      resolve: (parent) => parent.receiving ?? null,
    }),
    kicking: t.field({
      type: FootballGameKickingStatsRef,
      nullable: true,
      resolve: (parent) => parent.kicking ?? null,
    }),
    defense: t.field({
      type: FootballGameDefenseStatsRef,
      nullable: true,
      resolve: (parent) => parent.defense ?? null,
    }),
    idp: t.field({
      type: FootballGameIDPStatsRef,
      nullable: true,
      resolve: (parent) => parent.idp ?? null,
    }),
    fantasyPoints: t.exposeFloat('fantasyPoints', { nullable: false }),
  }),
});

// ── Matchup player type ───────────────────────────────────────────────────────

export interface FootballMatchupPlayerShape {
  playerId: number;
  playerName: string;
  position: string;
  nflTeam: string | null;
  isDst: boolean;
  games: FootballMatchupPlayerGameShape[];
  totalPoints: number;
}

export const FootballMatchupPlayerRef =
  builder.objectRef<FootballMatchupPlayerShape>('FootballMatchupPlayer');

FootballMatchupPlayerRef.implement({
  description: 'A player on a football fantasy team in a matchup',
  fields: (t) => ({
    playerId: t.exposeInt('playerId', { nullable: false }),
    playerName: t.exposeString('playerName', { nullable: false }),
    position: t.exposeString('position', { nullable: false }),
    nflTeam: t.exposeString('nflTeam', { nullable: true }),
    isDst: t.exposeBoolean('isDst', { nullable: false }),
    games: t.field({
      type: [FootballMatchupPlayerGameRef],
      nullable: false,
      resolve: (parent) => parent.games,
    }),
    totalPoints: t.exposeFloat('totalPoints', { nullable: false }),
  }),
});

// ── Matchup stats type ────────────────────────────────────────────────────────

export interface FootballMatchupStatsShape {
  teamId: number;
  teamName: string;
  totalPoints: number;
  players: FootballMatchupPlayerShape[];
}

export const FootballMatchupStatsRef =
  builder.objectRef<FootballMatchupStatsShape>('FootballMatchupStats');

FootballMatchupStatsRef.implement({
  description: 'Stats for one team in a football matchup',
  fields: (t) => ({
    teamId: t.exposeInt('teamId', { nullable: false }),
    teamName: t.exposeString('teamName', { nullable: false }),
    totalPoints: t.exposeFloat('totalPoints', { nullable: false }),
    players: t.field({
      type: [FootballMatchupPlayerRef],
      nullable: false,
      resolve: (parent) => parent.players,
    }),
  }),
});
