import type { Page } from '@playwright/test';

import {
  extractOperationName,
  extractOperationVariables,
  unmockedGraphQLFallback,
} from './shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import {
  publicLeaguesEmptyResponse,
  publicLeaguesResponse,
} from '../mocks/graphql/league.mocks';
import {
  careerBattingConnectionResponse,
  careerPitchingLeadersCountResponse,
  careerPitchingLeadersResponse,
  comparablePlayersResponse,
} from '../mocks/graphql/player.mocks';
import { createFootballLineupFixture } from '../mocks/graphql/roster.mocks';

/**
 * TestData — the backend-agnostic data-precondition seam (ADR-0016).
 *
 * A dual-mode spec never seeds data itself; it asks this interface to
 * *ensure a precondition holds* and gets back the handles it needs to assert.
 * Each backend satisfies the precondition its own way:
 *
 *   • {@link MockTestData} installs `route.fulfill()` handlers over the
 *     hermetic baseline (layer-3 overrides, LIFO ahead of api-isolation).
 *   • {@link LiveTestData} relies on (or creates via real GraphQL) state on
 *     the live backend, and returns handles that are stable there.
 *
 * Methods return the SAME shape in both modes so the spec body is identical;
 * only the returned values differ (mock fixtures vs. live data). Grow this
 * interface verb-by-verb as dual-mode specs need new preconditions — a verb
 * without a live implementation should throw, not silently no-op.
 */

/** A player guaranteed to be findable on the `/players/stats` grid. */
export interface SeededPlayerPool {
  /** Full display name rendered in the grid rows. */
  fullName: string;
  /** What to type into the stats search to find them (min 2 chars). */
  searchTerm: string;
}

/** A league-discovery search precondition. */
export interface SeededDiscoverySearch {
  /** A term guaranteed to match no public league on this backend. */
  unmatchedTerm: string;
}

/**
 * A football league the viewer owns a team in, with one configured starting
 * slot standing empty and one eligible player sitting on the bench — the
 * precondition a lineup-editing spec needs before it can move anybody.
 */
export interface SeededFootballLineup {
  /** League to navigate to (`/football/league/:leagueId/roster`). */
  leagueId: number;
  /** The viewer's team in that league. */
  teamId: number;
  /** The configured starting slot, empty until the spec fills it. */
  openSlot: {
    /** `LeaguePosition.id` the assignment mutation is fired with. */
    positionId: number;
    /** NFL position code rendered in the slot label, e.g. `QB`. */
    positionType: string;
  };
  /** A rostered player on the bench, eligible for {@link openSlot}. */
  benchPlayer: {
    teamMemberId: number;
    playerId: number;
    /** Full display name rendered on the bench row. */
    fullName: string;
  };
}

export interface TestData {
  readonly mode: 'mock' | 'live';

  /**
   * Ensure the players-stats grid has data and return a player known to be in
   * it. Mock: installs the batting-connection payload (Trout/Ohtani). Live:
   * the MLB history dataset is always present — returns an all-time great.
   */
  playerPool(): Promise<SeededPlayerPool>;

  /**
   * Ensure the discovery page behaves deterministically for a no-match
   * search. Mock: serves a two-league list for unsearched loads and an empty
   * list for the unmatched term (the search is server-side — the component
   * passes `search` as a query variable). Live: returns a term no real
   * public league can plausibly carry.
   */
  discoverySearch(): Promise<SeededDiscoverySearch>;

  /**
   * Ensure the pitching view of the stats grid has data. Mock: installs the
   * career-pitching array + count payloads (Clemens). Live: the MLB history
   * dataset always has pitching leaders — nothing to seed.
   */
  pitchingLeaders(): Promise<void>;

  /**
   * Ensure the premium comparison search returns a player. Mock: answers
   * GetPlayersWithStats (the rich compare shape) with the default pool
   * player. Live: the all-time greats are always searchable (premium
   * identity required server-side — the dual fixtures' commissioner is
   * premium).
   */
  comparablePlayer(): Promise<SeededPlayerPool>;

  /**
   * Ensure a football league exists with a team the viewer owns, one
   * configured starting slot, and an eligible bench player. Mock: installs the
   * shared football-lineup fixture, whose handler map keeps the roster mutable
   * so an assignment round-trips through a refetch. Live: **throws** — seeding
   * this precondition means creating a league, taking team ownership, seeding a
   * roster and cleaning all of it up again, which no existing live verb does
   * (see LS-9655 "Out of Scope").
   */
  footballLineup(): Promise<SeededFootballLineup>;
}

/** Hermetic implementation — preconditions become `route.fulfill()` mocks. */
export class MockTestData implements TestData {
  readonly mode = 'mock' as const;
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async playerPool(): Promise<SeededPlayerPool> {
    // The stats grid fires three operations that all consume the same
    // connection payload (mirrors player-stats.spec.ts). Match on the exact
    // operation name — lowercased, following the BASELINE_GRAPHQL_RESPONSES
    // key convention — so similarly-named operations can never collide with
    // the mock. Everything else cascades to the baseline via the LIFO
    // fallback.
    const MOCKED_OPS = [
      'getcareerbattingstats',
      'getallplayers',
      'getplayerswithstats',
    ];
    const payload = JSON.stringify(careerBattingConnectionResponse());
    await this.#page.route(isGraphQLEndpoint, async (route) => {
      const opName = extractOperationName(route).toLowerCase();
      if (MOCKED_OPS.includes(opName)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: payload,
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    return { fullName: 'Mike Trout', searchTerm: 'Trout' };
  }

  async discoverySearch(): Promise<SeededDiscoverySearch> {
    const unmatchedTerm = 'zz-no-such-league-zz';
    // The discovery search is SERVER-side (LeagueDiscoveryPage passes the
    // debounced term as the `search` query variable), so the mock must answer
    // the searched query itself: two leagues for unsearched loads, an empty
    // list once the unmatched term is submitted.
    await this.#page.route(isGraphQLEndpoint, async (route) => {
      if (extractOperationName(route).toLowerCase() !== 'getpublicleagues') {
        await unmockedGraphQLFallback(route);
        return;
      }
      let search: unknown;
      try {
        const body = JSON.parse(route.request().postData() ?? '{}') as {
          variables?: { search?: unknown };
        };
        search = body.variables?.search;
      } catch {
        search = undefined;
      }
      const payload =
        search === unmatchedTerm
          ? publicLeaguesEmptyResponse()
          : publicLeaguesResponse([
              { id: 1, name: 'Sunday Sluggers' },
              { id: 2, name: 'Midnight Marlins' },
            ]);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    });

    return { unmatchedTerm };
  }

  async pitchingLeaders(): Promise<void> {
    const stats = JSON.stringify(careerPitchingLeadersResponse());
    const count = JSON.stringify(careerPitchingLeadersCountResponse(1));
    await this.#page.route(isGraphQLEndpoint, async (route) => {
      const opName = extractOperationName(route).toLowerCase();
      if (opName === 'getcareerpitchingstats') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: stats,
        });
      } else if (opName === 'getcareerpitchingstatscount') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: count,
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });
  }

  async comparablePlayer(): Promise<SeededPlayerPool> {
    // The comparison surface's search consumes GetPlayersWithStats (the rich
    // compare shape), NOT SearchPlayers — mirrors player-comparison.spec.ts.
    const payload = JSON.stringify(comparablePlayersResponse());
    await this.#page.route(isGraphQLEndpoint, async (route) => {
      if (extractOperationName(route).toLowerCase() === 'getplayerswithstats') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: payload,
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });
    return { fullName: 'Mike Trout', searchTerm: 'Trout' };
  }

  async footballLineup(): Promise<SeededFootballLineup> {
    // Every payload — and the stateful assignment logic behind the lineup
    // mutations — comes from the shared fixture, so this handler is pure
    // transport: look the operation up, serialise whatever it returns. The
    // native implementation drives the SAME map through `server.override`
    // (ADR-0017 AC2), which is what keeps the round-trip identical.
    const fixture = createFootballLineupFixture();
    await this.#page.route(isGraphQLEndpoint, async (route) => {
      const handler =
        fixture.handlers[extractOperationName(route).toLowerCase()];
      if (!handler) {
        await unmockedGraphQLFallback(route);
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(handler(extractOperationVariables(route))),
      });
    });

    return {
      leagueId: fixture.leagueId,
      teamId: fixture.teamId,
      openSlot: fixture.openSlot,
      benchPlayer: fixture.benchPlayer,
    };
  }
}

/**
 * Why {@link LiveTestData.footballLineup} throws — surfaced verbatim so a spec
 * that reaches for the verb in live mode fails loudly with the reason, rather
 * than passing against a precondition that was never established.
 */
export const FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON =
  'TestData.footballLineup() has no live implementation: seeding a football ' +
  'league with an owned team and a configured lineup requires real league ' +
  'creation, team ownership, roster seeding and cleanup — no existing live ' +
  'verb issues mutations. This precondition is mock-only (web-mock and ' +
  'native-mock); run the spec on a mock backend, or see LS-9655 "Out of ' +
  'Scope" for the follow-up that would make it live-capable.';

/**
 * Live implementation — preconditions are satisfied against the real backend.
 * Read-only preconditions (like the MLB history player pool) need no setup;
 * verbs that must create state should issue real GraphQL mutations here (see
 * `integration/helpers/create-league.ts` for the established pattern).
 */
export class LiveTestData implements TestData {
  readonly mode = 'live' as const;

  playerPool(): Promise<SeededPlayerPool> {
    // The live MLB history dataset always contains the all-time greats; Barry
    // Bonds is the precedent search target (player-search-stats-ui, LS-754).
    return Promise.resolve({ fullName: 'Barry Bonds', searchTerm: 'Bonds' });
  }

  discoverySearch(): Promise<SeededDiscoverySearch> {
    // No seeding needed: the term just has to miss every real public league.
    // Same shape the cleanup helpers treat as test-owned noise — no plausible
    // real league name collides with it.
    return Promise.resolve({ unmatchedTerm: 'zz-no-such-league-zz' });
  }

  pitchingLeaders(): Promise<void> {
    // The live MLB history dataset always has pitching leaders.
    return Promise.resolve();
  }

  comparablePlayer(): Promise<SeededPlayerPool> {
    // Precedent live search target (player-compare-search.dual.spec.ts, LS-754).
    return Promise.resolve({ fullName: 'Barry Bonds', searchTerm: 'Bonds' });
  }

  footballLineup(): Promise<SeededFootballLineup> {
    // Deliberately unimplemented, not a silent no-op (the interface contract
    // above sanctions this). Every other live verb resolves because the MLB
    // history dataset already satisfies its precondition; this one does not
    // exist on the live backend, and conjuring it would make this the first
    // TestData verb to issue real mutations — league creation, team ownership,
    // roster seeding and teardown. That is its own ticket and its own design
    // review (LS-9655 "Out of Scope").
    throw new Error(FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON);
  }
}
