/**
 * Shared mock fixtures and GraphQL router for the season-renewal flow.
 *
 * Extracted from `season-renewal-core.spec.ts` and
 * `season-renewal-teams-errors.spec.ts`, which previously copy-pasted the
 * same ~460 lines of setup. Spec files now import the fixtures and the
 * `setupSeasonRenewalGraphQL` helper and only define spec-specific
 * overrides (e.g. `onRenewLeague`, alternate `renewedTeams`, etc.).
 */

import type { Page } from '@playwright/test';

import { isGraphQLEndpoint } from './router';
import { unmockedGraphQLFallback } from '../../fixtures/shared-mocks';

// ── Constants ─────────────────────────────────────────────────────────

export const LEAGUE_ID = 500;
export const LEAGUE_NAME = 'Dynasty Legends';
export const NEW_LEAGUE_ID = 501;
export const NEW_LEAGUE_NAME = 'Dynasty Legends';

// ── Mock Data Factories ───────────────────────────────────────────────

export function makeLeague(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'League',
    id: LEAGUE_ID,
    name: LEAGUE_NAME,
    description: 'Season renewal flow test league',
    owner: 1,
    maxRosterSize: 25,
    draftStatus: 'completed',
    currentMatchup: null,
    numberOfTeams: 4,
    playerPool: 'all',
    draftMode: 'automated',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    isPublic: false,
    maxBatters: 14,
    maxPitchers: 9,
    tradingEnabled: true,
    waiverEnabled: true,
    startDate: null,
    logoUrl: null,
    bannerUrl: null,
    primaryColor: null,
    secondaryColor: null,
    inviteCode: 'RENEW5678',
    userMembership: { teamId: 10 },
    minCareerGames: 50,
    minCareerSeasons: 3,
    waiverType: 'standard',
    gamesPerMatchup: 5,
    spStartsPerMatchup: 1,
    totalMatchups: 10,
    playoffEnabled: true,
    playoffFormat: '4-team',
    playoffMultiWeek: false,
    frozenAt: null,
    lmNote: null,
    seasonNumber: 1,
    previousLeagueId: null,
    ...overrides,
  };
}

/** Renewed league inherits settings from the original. */
export function makeRenewedLeague(overrides: Record<string, unknown> = {}) {
  return {
    ...makeLeague({
      id: NEW_LEAGUE_ID,
      name: NEW_LEAGUE_NAME,
      draftStatus: 'not-started',
      currentMatchup: null,
      frozenAt: null,
      seasonNumber: 2,
      previousLeagueId: LEAGUE_ID,
      inviteCode: 'RENEW9999',
      userMembership: { teamId: 20 },
    }),
    ...overrides,
  };
}

export const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 10,
    name: 'Dynasty Kings',
    owner: 1,
    leagueId: LEAGUE_ID,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 11,
    name: 'The Sluggers',
    owner: 2,
    leagueId: LEAGUE_ID,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 12,
    name: 'Ace Armada',
    owner: 3,
    leagueId: LEAGUE_ID,
    waiverOrder: 3,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 13,
    name: 'Power Hitters',
    owner: 4,
    leagueId: LEAGUE_ID,
    waiverOrder: 4,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

/** Teams migrated to the new league — same names, new IDs. */
export const MIGRATED_TEAMS = MOCK_TEAMS.map((team, i) => ({
  ...team,
  id: 20 + i,
  leagueId: NEW_LEAGUE_ID,
}));

export const MOCK_POSITIONS = [
  { __typename: 'LeaguePosition', id: 1, name: 'Catcher', abbrev: 'C' },
  { __typename: 'LeaguePosition', id: 2, name: 'First Base', abbrev: '1B' },
  { __typename: 'LeaguePosition', id: 3, name: 'Shortstop', abbrev: 'SS' },
  {
    __typename: 'LeaguePosition',
    id: 4,
    name: 'Starting Pitcher',
    abbrev: 'SP',
  },
];

/** All 10 weeks completed — season is done. */
export function makeCompletedMatchups() {
  return Array.from({ length: 10 }, (_, i) => ({
    __typename: 'Matchup',
    id: i + 1,
    leagueId: LEAGUE_ID,
    weekNumber: i + 1,
    team1Id: 10,
    team2Id: 11,
    status: 'completed',
    selectedGamesCount: 5,
    gamesPerMatchup: 5,
    statsLoadingStatus: 'not_started',
  }));
}

// ── GraphQL Route Setup ───────────────────────────────────────────────

export interface SeasonRenewalMockOptions {
  league?: ReturnType<typeof makeLeague>;
  teams?: typeof MOCK_TEAMS;
  matchups?: Array<Record<string, unknown>>;
  renewedLeague?: ReturnType<typeof makeRenewedLeague>;
  renewedTeams?: typeof MIGRATED_TEAMS;
  onRenewLeague?: (variables: {
    keepRosters: boolean;
  }) =>
    | Record<string, unknown>
    | null
    | Promise<Record<string, unknown> | null>;
}

/**
 * Register the shared GraphQL routes used by season-renewal specs.
 * Specs supply override callbacks (e.g. `onRenewLeague`) and alternate
 * team/league fixtures via `opts`.
 */
export async function setupSeasonRenewalGraphQL(
  page: Page,
  opts: SeasonRenewalMockOptions = {},
) {
  const {
    league = makeLeague(),
    teams = MOCK_TEAMS,
    matchups = makeCompletedMatchups(),
    renewedLeague = makeRenewedLeague(),
    renewedTeams = MIGRATED_TEAMS,
    onRenewLeague,
  } = opts;

  /** Track which league we're currently viewing — changes after renewal. */
  let activeLeagueId = league.id;

  await page.route(isGraphQLEndpoint, async (route) => {
    const postData = route.request().postData() ?? '';
    let parsed: { operationName?: string; variables?: Record<string, unknown> };
    try {
      parsed = JSON.parse(postData) as typeof parsed;
    } catch {
      parsed = {};
    }
    const op = (parsed.operationName ?? '').toLowerCase();

    // ── League queries ────────────────────────────────────────────
    if (op === 'getleaguebyid' || op === 'getleague') {
      const requestedId =
        (parsed.variables?.['id'] as number) ??
        (parsed.variables?.['leagueId'] as number) ??
        activeLeagueId;
      const isNewLeague = requestedId === NEW_LEAGUE_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { league: isNewLeague ? renewedLeague : league },
        }),
      });
      return;
    }

    if (op === 'getleagueteams') {
      const requestedId =
        (parsed.variables?.['leagueId'] as number) ?? activeLeagueId;
      const isNewLeague = requestedId === NEW_LEAGUE_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { leagueTeams: isNewLeague ? renewedTeams : teams },
        }),
      });
      return;
    }

    if (op === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: MOCK_POSITIONS } }),
      });
      return;
    }

    if (op === 'getuserteamid') {
      const requestedId =
        (parsed.variables?.['leagueId'] as number) ?? activeLeagueId;
      const isNewLeague = requestedId === NEW_LEAGUE_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { userTeamId: isNewLeague ? 20 : 10 },
        }),
      });
      return;
    }

    if (op === 'getmatchupsforleague') {
      const requestedId =
        (parsed.variables?.['leagueId'] as number) ?? activeLeagueId;
      const isNewLeague = requestedId === NEW_LEAGUE_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getMatchupsForLeague: isNewLeague ? [] : matchups,
          },
        }),
      });
      return;
    }

    if (op === 'getcurrentweekforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { getCurrentWeekForLeague: null },
        }),
      });
      return;
    }

    if (op === 'getleaguedraft' || op === 'getleaguedraftquery') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            getLeagueDraft: {
              __typename: 'Draft',
              draftMode: 'automated',
            },
          },
        }),
      });
      return;
    }

    if (op === 'getuserleagues' || op === 'getusers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [league] } }),
      });
      return;
    }

    if (op === 'getdraftteamorder') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getDraftTeamOrder: [] } }),
      });
      return;
    }

    // ── Activity / chat / announcements ───────────────────────────
    if (
      op === 'getleagueactivity' ||
      op === 'leagueactivity' ||
      op === 'getleaguechatmessages' ||
      op === 'getleaguemessages' ||
      op === 'getleagueannouncements'
    ) {
      const key =
        op.includes('chat') || op.includes('messages')
          ? 'getLeagueMessages'
          : op.includes('announcement')
            ? 'getLeagueAnnouncements'
            : 'leagueActivity';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [key]: [] } }),
      });
      return;
    }

    // ── Standings / scoring / trades / waivers ────────────────────
    if (op === 'getleaguestandings' || op === 'leaguestandings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
      return;
    }

    if (op === 'getleaguescoring' || op === 'leaguescoringprofile') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
      return;
    }

    if (op === 'getpendingtradeoffers' || op === 'pendingtradeoffers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { pendingTradeOffers: [] } }),
      });
      return;
    }

    if (op === 'getteamwaiverclaims' || op === 'teamwaiverclaims') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamWaiverClaims: [] } }),
      });
      return;
    }

    if (op === 'getteammembers' || op === 'teammembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
      });
      return;
    }

    if (op === 'getmatchupbyid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupById: null } }),
      });
      return;
    }

    if (op === 'getmatchupplayers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getMatchupPlayers: [] } }),
      });
      return;
    }

    // ── RenewLeague mutation ──────────────────────────────────────
    if (op === 'renewleague') {
      if (onRenewLeague) {
        const result = await onRenewLeague({
          keepRosters: parsed.variables?.['keepRosters'] as boolean,
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { renewLeague: result ?? renewedLeague },
          }),
        });
      } else {
        // After renewal succeeds, switch to showing the new league
        activeLeagueId = NEW_LEAGUE_ID;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { renewLeague: renewedLeague } }),
        });
      }
      return;
    }

    // ── Fallback — surface any unmocked operation as a diagnostic error ──
    await unmockedGraphQLFallback(route);
  });
}
