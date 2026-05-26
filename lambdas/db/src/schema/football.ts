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
import { and, eq, gt, ilike, or, SQL } from 'drizzle-orm';
import { builder } from './builder';
import { AuthenticationError, UserInputError } from './graphql-errors';

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
    isDst: t.exposeBoolean('isDst', { nullable: false }),
    nflTeam: t.exposeString('nflTeam', { nullable: true }),
    position: t.exposeString('position', { nullable: true }),
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
        if (!context.user) {
          throw AuthenticationError(
            'Authentication required to query football career stats',
          );
        }
        const db = context.db;
        const playerId = parent.id;

        const [
          passingRows,
          rushingRows,
          receivingRows,
          kickingRows,
          defenseRows,
          idpRows,
        ] = await Promise.all([
          db
            .select()
            .from(PublicSchema.careerFootballPassing)
            .where(eq(PublicSchema.careerFootballPassing.playerId, playerId))
            .limit(1),
          db
            .select()
            .from(PublicSchema.careerFootballRushing)
            .where(eq(PublicSchema.careerFootballRushing.playerId, playerId))
            .limit(1),
          db
            .select()
            .from(PublicSchema.careerFootballReceiving)
            .where(eq(PublicSchema.careerFootballReceiving.playerId, playerId))
            .limit(1),
          db
            .select()
            .from(PublicSchema.careerFootballKicking)
            .where(eq(PublicSchema.careerFootballKicking.playerId, playerId))
            .limit(1),
          db
            .select()
            .from(PublicSchema.careerFootballDefense)
            .where(eq(PublicSchema.careerFootballDefense.playerId, playerId))
            .limit(1),
          db
            .select()
            .from(PublicSchema.careerFootballDefenseIdp)
            .where(eq(PublicSchema.careerFootballDefenseIdp.playerId, playerId))
            .limit(1),
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

builder.queryField('footballPlayers', (t) =>
  t.field({
    type: FootballPlayersConnectionRef,
    description:
      'Paginated list of football players, optionally filtered by position (LS-255)',
    args: {
      position: t.arg.string({ required: false }),
      nflTeam: t.arg.string({ required: false }),
      search: t.arg.string({ required: false }),
      after: t.arg.string({ required: false }),
      first: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to query football players',
        );
      }

      const db = context.db;
      const limit = Math.min(args.first ?? FOOTBALL_PLAYERS_PAGE_SIZE, 100);
      const afterId = args.after != null ? parseInt(args.after, 10) : null;

      const conditions: SQL[] = [eq(PublicSchema.players.sport, 'football')];

      if (args.position) {
        if (!isValidPosition(args.position)) {
          throw UserInputError(`Invalid position: ${args.position}`);
        }
        conditions.push(eq(PublicSchema.players.position, args.position));
      }

      if (args.nflTeam) {
        if (!isValidNflTeam(args.nflTeam)) {
          throw UserInputError(`Invalid NFL team: ${args.nflTeam}`);
        }
        conditions.push(eq(PublicSchema.players.nflTeam, args.nflTeam));
      }

      if (afterId != null && !isNaN(afterId)) {
        conditions.push(gt(PublicSchema.players.id, afterId));
      }

      if (args.search) {
        const term = `%${args.search}%`;
        conditions.push(
          or(
            ilike(PublicSchema.players.firstName, term),
            ilike(PublicSchema.players.lastName, term),
          )!,
        );
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
        })
        .from(PublicSchema.players)
        .where(and(...conditions))
        .orderBy(PublicSchema.players.id)
        .limit(limit + 1);

      const hasNextPage = rows.length > limit;
      const nodes = rows.slice(0, limit);
      const endCursor =
        nodes.length > 0 ? String(nodes[nodes.length - 1].id) : null;

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
    gameNum: t.exposeInt('gameNum'),
    gameIdentifier: t.exposeString('gameIdentifier'),
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
    fantasyPoints: t.exposeFloat('fantasyPoints'),
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
    playerId: t.exposeInt('playerId'),
    playerName: t.exposeString('playerName'),
    position: t.exposeString('position'),
    nflTeam: t.exposeString('nflTeam', { nullable: true }),
    isDst: t.exposeBoolean('isDst'),
    games: t.field({
      type: [FootballMatchupPlayerGameRef],
      resolve: (parent) => parent.games,
    }),
    totalPoints: t.exposeFloat('totalPoints'),
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
    teamId: t.exposeInt('teamId'),
    teamName: t.exposeString('teamName'),
    totalPoints: t.exposeFloat('totalPoints'),
    players: t.field({
      type: [FootballMatchupPlayerRef],
      resolve: (parent) => parent.players,
    }),
  }),
});
