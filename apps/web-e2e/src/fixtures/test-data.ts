import type { Browser, Page } from '@playwright/test';

import {
  extractOperationName,
  extractOperationVariables,
  unmockedGraphQLFallback,
} from './shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';
import {
  leagueByIdResponse,
  leaguePositionsResponse,
  leagueTeamsResponse,
  mockLeague,
  mockTeam,
  publicLeaguesEmptyResponse,
  publicLeaguesResponse,
  userLeaguesResponse,
  userTeamIdResponse,
} from '../mocks/graphql/league.mocks';
import {
  createLeagueFixture,
  type LeagueFixture,
} from '../mocks/graphql/league-fixture.mocks';
import {
  careerBattingConnectionResponse,
  careerPitchingLeadersCountResponse,
  careerPitchingLeadersResponse,
  comparablePlayersResponse,
} from '../mocks/graphql/player.mocks';
import {
  createFootballLineupFixture,
  createFootballTeamDetailVisitorScenario,
  type FootballLineupFixture,
  mockRosterPlayer,
  mockTeamMember,
  VISITOR_STARTER,
  VISITOR_VIEWER_TEAM_ID,
} from '../mocks/graphql/roster.mocks';
import {
  createWaiverQueueFixture,
  type WaiverQueueFixture,
} from '../mocks/graphql/waiver-queue.mocks';
import {
  createMatchupFixture,
  type MatchupFixture,
} from '../mocks/graphql/matchup-fixture.mocks';
import {
  LEAGUE_ID as SEASON_RENEWAL_LEAGUE_ID,
  LEAGUE_NAME as SEASON_RENEWAL_LEAGUE_NAME,
  setupSeasonRenewalGraphQL,
} from '../mocks/graphql/season-renewal';
import { gqlFetch } from '../integration/helpers/gql-fetch';
import { createLeagueViaUI } from '../integration/helpers/create-league';
import { joinLeagueAsManager } from '../integration/helpers/wait-for-join-page';
import {
  provisionActiveMatchup,
  type ProvisionedActiveMatchup,
} from '../integration/helpers/provision-active-matchup';
import {
  buildIntegrationStorageState,
  getAuthJwt,
  WEB_BASE,
} from '../integration/fixtures/ui';
import { loginAs } from '../utils/test-user-auth';

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

/** A player handle for the lock-window/bye-week scenarios below (LS-6441). */
export interface SeededFootballLineupPlayer {
  /** Full display name rendered on the slot/bench row. */
  fullName: string;
  /** NFL position code the player is eligible for / rostered at, e.g. `QB`. */
  positionType: string;
}

export interface SeededFootballLineupLocked {
  /** League to navigate to (`/football/league/:leagueId/roster`). */
  leagueId: number;
  /** The viewer's team in that league. */
  teamId: number;
  /**
   * A starter whose game has started — `isLocked: true` — matching what
   * `checkPlayersNotLocked` (`lambdas/db/src/schema/authorization.ts`) sets
   * once their team's matchup leaves `'scheduled'` (LS-6428).
   */
  lockedStarter: SeededFootballLineupPlayer;
  /** A locked bench player, eligible for {@link openSlotPositionType}. */
  lockedBenchPlayer: SeededFootballLineupPlayer;
  /** The open (unoccupied, unlocked) slot's position type, e.g. `WR`. */
  openSlotPositionType: string;
}

/**
 * A football Team Detail page (`/football/teams/:teamId`) the viewer does NOT
 * own — the read-only precondition for LS-9657. Team Detail is addressed by
 * team rather than by league, so unlike the League Roster tab it can render
 * somebody else's team; this is the scenario that proves it renders read-only
 * when it does.
 */
export interface SeededFootballTeamDetailVisitor {
  /** League the team belongs to. */
  leagueId: number;
  /** The team being VIEWED — navigate to `/football/teams/:teamId`. */
  teamId: number;
  /** The viewer's own (different) team in the same league. */
  viewerTeamId: number;
  /** A player already starting on the viewed team's lineup. */
  starter: SeededFootballLineupPlayer;
}

export interface SeededFootballLineupByeWeek {
  /** League to navigate to (`/football/league/:leagueId/roster`). */
  leagueId: number;
  /** The viewer's team in that league. */
  teamId: number;
  /** A starter whose NFL team is on a bye during the league's active week. */
  byeStarter: SeededFootballLineupPlayer;
}

/**
 * A league whose commissioner-facing invite surface (Invite Friends card:
 * URL, code, QR toggle) is ready to assert against — the precondition for the
 * league QR-invite flow (LS-9737, converted from
 * league-qr-invite-ui.integration.spec.ts).
 */
export interface SeededLeagueInvite {
  leagueId: number;
  leagueName: string;
  /** 8-character alphanumeric invite code. */
  inviteCode: string;
  /** Full join URL for the invite code (`/baseball/league/join/<code>`). */
  inviteUrl: string;
}

/** Result of {@link TestData.inviteJoin} — the postcondition to assert on. */
export interface InviteJoinResult {
  /** Total league members after the join (commissioner + newly-joined manager). */
  memberCount: number;
}

/**
 * A league whose commissioner Scoring Rules editor is ready to assert
 * against — the precondition for the league scoring-editor flow (LS-9737,
 * converted from league-scoring-editor-ui.integration.spec.ts).
 */
export interface SeededScoringProfile {
  leagueId: number;
  /** Display name of the stat the spec edits (`Home Runs` — matches both fixtures). */
  statDisplayName: string;
  /** The stat's multiplier before the spec edits it. */
  originalMultiplier: number;
}

/**
 * A league in the "season complete" state, ready for the commissioner's
 * renewal dialog (Phase 6 slice only — LS-9737, converted from
 * season-renewal-migration-ui.integration.spec.ts). Reaching this state on a
 * real backend requires a full multi-manager season-completion run (create →
 * join → draft → auto-advance); see {@link SEASON_RENEWAL_LIVE_UNSUPPORTED_REASON}.
 */
export interface SeededSeasonRenewal {
  leagueId: number;
  leagueName: string;
}

/**
 * A league the viewer (commissioner) owns — the base rung of the seeded-league
 * verb ladder (LS-9736). No members beyond the commissioner, no draft.
 */
export interface SeededLeague {
  /** League to navigate to (`/baseball/league/:leagueId`). */
  leagueId: number;
  /** Invite code a second identity can join with. */
  inviteCode: string;
  /** The commissioner's own team in the league. */
  commissionerTeamId: number;
}

/**
 * A {@link SeededLeague} with a second identity already joined — the
 * precondition a multi-actor spec (commissioner + one manager, no draft)
 * builds on. Deeper ladder rungs (`draftedLeague()`, `seasonActiveMatchup()`,
 * etc.) are explicitly out of scope for this ticket; each future
 * spec-migration ticket adds what it specifically needs on top of this base.
 */
export interface SeededLeagueWithMember extends SeededLeague {
  /** The joined member's team in the league. */
  memberTeamId: number;
}

/**
 * A free-agent-claim queue precondition (LS-9738, seam-extension-list rank
 * #4). `teamId` is the CALLER's own team — the first `TestData` in a test to
 * call {@link TestData.waiverQueue} gets the commissioner's team (no claim
 * submitted yet); a second, distinct caller (`counterpartyTestData`, see
 * `fixtures/dual.ts`) gets the joined member's team, whose competing claim
 * for {@link freeAgent} is submitted immediately as a side effect of the
 * call — mirroring the mutation a spec would otherwise have to drive twice
 * through the UI for a flow the matrix explicitly scopes to
 * "claim submitted / claim resolved" state transitions, not real priority
 * resolution (that stays live-only).
 */
export interface SeededWaiverQueue {
  /** League to navigate to (`/baseball/league/:leagueId/...`). */
  leagueId: number;
  /** The caller's own team. */
  teamId: number;
  /** The free agent both teams compete for. */
  freeAgent: { playerId: number; fullName: string };
}

/**
 * A season-active, week-1 matchup between the league's commissioner and its
 * joined member — draft complete, matchup created, win-probability payload
 * available (LS-9738, matrix row #2 / seam-extension rank #2's deeper rung).
 * Like {@link SeededWaiverQueue}, the first caller becomes the commissioner
 * (and does the (live: slow) league/draft/matchup setup); a second, distinct
 * caller (`counterpartyTestData`) resolves to the ALREADY-joined member's own
 * team, for the cross-user view a spec drives via the multi-actor fixture.
 */
export interface SeededSeasonActiveMatchup {
  /** League to navigate to. */
  leagueId: number;
  /** The matchup to navigate to (`/baseball/league/:leagueId/matchups/:matchupId`). */
  matchupId: number;
  /** The caller's own team. */
  teamId: number;
  /** The opposing team in the same matchup. */
  opponentTeamId: number;
}

/**
 * A {@link SeededSeasonActiveMatchup} with the caller's own team carrying one
 * empty starting slot and an eligible bench player — the precondition
 * `matchup-roster-editor.dual.spec.ts` needs before it can bench/assign/swap
 * anybody (LS-9738, matrix row #3 / seam-extension rank #6). A direct sibling
 * of {@link SeededFootballLineup} — same "one open slot, one eligible bench
 * player" shape, baseball-flavored. Single-caller only (no multi-actor
 * fixture involved — the matrix does not gap this row on `multiActorPage`).
 */
export interface SeededScheduledMatchupRoster extends SeededSeasonActiveMatchup {
  /** The configured starting slot, empty until the spec fills it. */
  openSlot: { positionId: number; positionType: string };
  /** A rostered player on the bench, eligible for {@link openSlot}. */
  benchPlayer: { matchupPlayerId: string; fullName: string };
  /** A currently-starting player on the caller's own team, free to bench. */
  starterToBench: { matchupPlayerId: string; fullName: string };
  /** Two starters on the caller's own team mutually eligible for each other's slot. */
  swapPair: [
    { matchupPlayerId: string; fullName: string },
    { matchupPlayerId: string; fullName: string },
  ];
}

/**
 * Cross-page shared mock state for dual-mode multi-actor specs (LS-9736).
 *
 * `MockTestData` normally owns no state beyond the `page.route()` closures it
 * installs — each instance is scoped to one `Page`. Stateful preconditions
 * that TWO pages must observe *consistently* (e.g. `league()` /
 * `leagueWithMember()`, used by both the primary `testData` and the
 * `counterpartyPage`/`counterpartyTestData` multi-actor fixtures — see
 * `fixtures/dual.ts`) need a fixture object that outlives any single page's
 * route closures. This container holds that object: both `MockTestData`
 * instances are constructed with the SAME `DualMockState` (one per test, via
 * `fixtures/dual.ts`), so a write made through one page's handlers is visible
 * to the other's reads — the same shared-handler-map shape
 * `native-mock.ts`'s `GraphQLMockServer` uses for the native lane, applied
 * here to two `page.route()` consumers instead of one out-of-process server.
 */
export class DualMockState {
  #league?: LeagueFixture;
  #waiverQueue?: WaiverQueueFixture;
  #matchup?: MatchupFixture;

  /** The test's shared league fixture, created on first call. */
  league(): LeagueFixture {
    this.#league ??= createLeagueFixture();
    return this.#league;
  }

  /** The test's shared waiver-claim-queue fixture (LS-9738), layered on {@link league}. */
  waiverQueue(): WaiverQueueFixture {
    this.#waiverQueue ??= createWaiverQueueFixture(this.league());
    return this.#waiverQueue;
  }

  /** The test's shared season-active-matchup fixture (LS-9738), layered on {@link league}. */
  matchup(): MatchupFixture {
    this.#matchup ??= createMatchupFixture(this.league());
    return this.#matchup;
  }
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

  /**
   * Ensure a football roster (LS-6441 lock-window scenario) has one starter
   * whose game has started (`isLocked: true` — see {@link SeededFootballLineupLocked})
   * plus one locked bench player eligible for a separate, open, unlocked
   * slot. Mock: extends the football-lineup fixture's `members` with two
   * locked team members. Live: **throws**, same reasoning as
   * {@link footballLineup} — see {@link FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON}.
   */
  footballLineupLocked(): Promise<SeededFootballLineupLocked>;

  /**
   * Ensure a football roster (LS-6441 bye-week scenario) has one starter
   * whose NFL team is on a bye during the league's active week — the
   * precondition `RosterBoard`'s `onBye` flag (LS-6430) reads via
   * `byeWeeksByTeam`/`currentWeek`. Mock: extends the football-lineup fixture
   * with a `GetNflTeamSeasonMetadata` bye entry matching the starter's
   * `nflTeam` and the league's current week. Live: **throws**, same
   * reasoning as {@link footballLineup}.
   */
  footballLineupByeWeek(): Promise<SeededFootballLineupByeWeek>;

  /**
   * Ensure a football league has a team the viewer does NOT own, with one
   * player already in a starting slot — the Team Detail read-only precondition
   * (LS-9657). Mock: the same football-lineup fixture with its `viewerTeamId`
   * pointed at a different team, which is what both platforms' edit gates
   * compare against. Live: **throws**, same reasoning as
   * {@link footballLineup} — see {@link FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON}.
   */
  footballTeamDetailVisitor(): Promise<SeededFootballTeamDetailVisitor>;

  /**
   * Ensure a league exists whose commissioner-facing overview shows the
   * Invite Friends card (invite URL, invite code, QR toggle). Mock: installs
   * a league/team/positions fixture the commissioner owns. Live: creates a
   * real league via `createLeagueAndTeams` (LS-9737) — nightly-run orphans
   * are reaped by the existing global-setup/teardown league sweep (Layers 1
   * &amp; 3, `cleanupLeague.ts`), the same safety net serial integration specs
   * rely on for their own per-run leagues.
   */
  leagueInvite(): Promise<SeededLeagueInvite>;

  /**
   * Join the league from {@link leagueInvite} as a SECOND identity and return
   * the resulting member count. Deliberately backend-only (no UI driving): the
   * dual fixture's single `page`/`driver` is already authenticated as the
   * league's commissioner, so a second browser context isn't available to
   * drive the join form the way `league-qr-invite-ui.integration.spec.ts`
   * Phase 7 does — the join happens directly against the backend in both
   * modes instead (mock: an in-memory counter; live: a real
   * `joinLeagueByCode` mutation as a distinct premium identity), and the spec
   * asserts the same `memberCount` postcondition either way.
   */
  inviteJoin(
    invite: SeededLeagueInvite,
    teamName: string,
  ): Promise<InviteJoinResult>;

  /**
   * Ensure a league exists whose commissioner Scoring Rules editor is ready:
   * all three stat groups render, and a known stat (Home Runs) carries a
   * known multiplier the spec can edit and save. Mock: installs a stateful
   * `UpdateLeagueScoringProfile` handler (edits round-trip). Live: creates a
   * real league via `createLeagueAndTeams` — a freshly created league carries
   * the default scoring profile server-side, so no further seeding mutation
   * is needed before editing it.
   */
  scoringProfile(): Promise<SeededScoringProfile>;

  /**
   * Ensure a league is in the "season complete" state so the commissioner's
   * renewal dialog (Phase 6 of the source integration spec) can be opened.
   * Mock: installs the shared `setupSeasonRenewalGraphQL` fixture (already
   * used by `season-renewal.spec.ts`), whose baseline league is
   * draft-completed with no active matchup. Live: **throws** — reaching this
   * state on a real backend means running the full create → 3-manager-join →
   * automated-draft → auto-advance-to-completion sequence that Phases 1-5 of
   * `season-renewal-migration-ui.integration.spec.ts` perform, which no
   * existing live TestData verb seeds (out of scope for LS-9737's Phase-6
   * slice — see {@link SEASON_RENEWAL_LIVE_UNSUPPORTED_REASON}).
   */
  seasonRenewalDialog(): Promise<SeededSeasonRenewal>;

  /**
   * Ensure a league exists that the viewer (commissioner) owns, with no
   * other members and no draft — the base rung of the seeded-league verb
   * ladder (LS-9736). Mock: installs a stateful league fixture shared with
   * any other `TestData` pointed at the same `DualMockState` (see
   * {@link DualMockState}). Live: creates the league via the real UI
   * (`integration/helpers/create-league.ts`), same identity path as the
   * `shared-live` project's commissioner.
   */
  league(): Promise<SeededLeague>;

  /**
   * Ensure a {@link league} exists with a second identity already joined —
   * the precondition nearly every multi-actor integration spec starts from.
   * Mock: reuses the same stateful league fixture, pre-seeding one joined
   * member. Live: creates the league, then joins a distinct manager identity
   * via `integration/helpers/wait-for-join-page.ts`'s
   * `joinLeagueAsManager` (slow — minutes — acceptable for nightly cadence,
   * the same tradeoff `footballLineup()`'s sibling verbs already make).
   */
  leagueWithMember(): Promise<SeededLeagueWithMember>;

  /**
   * Ensure a free-agent-claim queue exists (LS-9738). Mock: installs a
   * stateful queue fixture shared with any other `TestData` pointed at the
   * same `DualMockState`, layered on the same {@link league}. Live: creates
   * the league via the real UI (first caller) or joins it via the real API
   * as a distinct identity (second caller) — see {@link SeededWaiverQueue}.
   */
  waiverQueue(): Promise<SeededWaiverQueue>;

  /**
   * Ensure a season-active, week-1 matchup exists between the league's
   * commissioner and its joined member, with a win-probability payload
   * available (LS-9738). Mock: installs a stateful matchup fixture. Live:
   * runs a real (API-driven) draft — slow, acceptable for nightly cadence,
   * the same tradeoff `leagueWithMember()` makes. See
   * {@link SeededSeasonActiveMatchup}.
   */
  seasonActiveMatchup(): Promise<SeededSeasonActiveMatchup>;

  /**
   * Ensure a {@link seasonActiveMatchup} exists where the caller's own team
   * has one empty starting slot and an eligible bench player (LS-9738). See
   * {@link SeededScheduledMatchupRoster}.
   */
  scheduledMatchupRoster(): Promise<SeededScheduledMatchupRoster>;
}

/** Hermetic implementation — preconditions become `route.fulfill()` mocks. */
export class MockTestData implements TestData {
  readonly mode = 'mock' as const;
  readonly #page: Page;
  readonly #shared: DualMockState;

  /**
   * `shared` defaults to a fresh, single-page-only `DualMockState` so every
   * existing call site (`new MockTestData(page)`) keeps working unchanged.
   * Pass the SAME instance across two `MockTestData`s (one per `Page`) to
   * make `league()`/`leagueWithMember()` observe consistent state — see
   * {@link DualMockState} and `fixtures/dual.ts`.
   */
  constructor(page: Page, shared: DualMockState = new DualMockState()) {
    this.#page = page;
    this.#shared = shared;
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

  /**
   * Register a {@link FootballLineupFixture}'s handler map as `page.route()`
   * transport — shared by {@link footballLineup}, {@link footballLineupLocked}
   * and {@link footballLineupByeWeek}. Every payload — and the stateful
   * assignment logic behind the lineup mutations — comes from the fixture, so
   * this is pure transport: look the operation up, serialise whatever it
   * returns. The native implementation drives the SAME map through
   * `server.override` (ADR-0017 AC2), which is what keeps the round-trip
   * identical.
   */
  async #installFootballLineupRoutes(
    fixture: FootballLineupFixture,
  ): Promise<void> {
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
  }

  async footballLineup(): Promise<SeededFootballLineup> {
    const fixture = createFootballLineupFixture();
    await this.#installFootballLineupRoutes(fixture);

    return {
      leagueId: fixture.leagueId,
      teamId: fixture.teamId,
      openSlot: fixture.openSlot,
      benchPlayer: fixture.benchPlayer,
    };
  }

  async footballLineupLocked(): Promise<SeededFootballLineupLocked> {
    // Two starting slots: QB (occupied by a locked starter — "can an already
    // -placed player be moved") and WR (open, so a locked BENCH player has
    // somewhere it would go if the lock didn't block the tap). Both LOCKED_*
    // players carry `isLocked: true`, matching what the server's
    // `checkPlayersNotLocked` sets once a team's matchup leaves 'scheduled'
    // (LS-6428) — RosterBoard's lock UI is driven entirely by that flag
    // client-side, so no mutation ever needs to actually round-trip here.
    const lockedStarter = mockTeamMember({
      id: 301,
      positionId: 1,
      isLocked: true,
      player: mockRosterPlayer({
        id: 910,
        firstName: 'Patrick',
        lastName: 'Mahomes',
        eligiblePositions: ['QB'],
        nflTeam: 'KC',
      }),
    });
    const lockedBenchPlayer = mockTeamMember({
      id: 302,
      positionId: null,
      isLocked: true,
      player: mockRosterPlayer({
        id: 911,
        firstName: 'Justin',
        lastName: 'Jefferson',
        eligiblePositions: ['WR'],
        nflTeam: 'MIN',
      }),
    });
    const fixture = createFootballLineupFixture({
      positionTypes: ['QB', 'WR'],
      members: [lockedStarter, lockedBenchPlayer],
    });
    await this.#installFootballLineupRoutes(fixture);

    return {
      leagueId: fixture.leagueId,
      teamId: fixture.teamId,
      lockedStarter: { fullName: 'Patrick Mahomes', positionType: 'QB' },
      lockedBenchPlayer: { fullName: 'Justin Jefferson', positionType: 'WR' },
      openSlotPositionType: 'WR',
    };
  }

  async footballLineupByeWeek(): Promise<SeededFootballLineupByeWeek> {
    // A single starter, already assigned to the QB slot, whose NFL team
    // (BUF) is flagged on bye for the league's (default) current week — only
    // a STARTER's bye status renders (LS-6430's `onBye` computation reads the
    // slot occupant, not the bench), so the scenario seeds no bench player.
    const byeStarter = mockTeamMember({
      id: 401,
      positionId: 1,
      player: mockRosterPlayer({
        id: 920,
        firstName: 'Josh',
        lastName: 'Allen',
        eligiblePositions: ['QB'],
        nflTeam: 'BUF',
      }),
    });
    const fixture = createFootballLineupFixture({
      positionTypes: ['QB'],
      members: [byeStarter],
      // mockLeague defaults currentWeekNumber to null, which the Roster tab
      // treats as week 1 (`league.currentWeekNumber ?? 1`) — pin it
      // explicitly so the bye week below stays correct even if that default
      // ever changes.
      currentWeekNumber: 1,
      byeWeeksByTeam: { BUF: 1 },
    });
    await this.#installFootballLineupRoutes(fixture);

    return {
      leagueId: fixture.leagueId,
      teamId: fixture.teamId,
      byeStarter: { fullName: 'Josh Allen', positionType: 'QB' },
    };
  }

  async footballTeamDetailVisitor(): Promise<SeededFootballTeamDetailVisitor> {
    const fixture = createFootballTeamDetailVisitorScenario();
    await this.#installFootballLineupRoutes(fixture);

    return {
      leagueId: fixture.leagueId,
      teamId: fixture.teamId,
      viewerTeamId: VISITOR_VIEWER_TEAM_ID,
      starter: { ...VISITOR_STARTER },
    };
  }

  /** In-memory member count for {@link leagueInvite} / {@link inviteJoin}. */
  #inviteMemberCount = 1;

  async leagueInvite(): Promise<SeededLeagueInvite> {
    const leagueId = 1;
    const leagueName = 'Dual Mode Invite League';
    const inviteCode = 'DUALINV1';
    this.#inviteMemberCount = 1;
    const league = mockLeague({
      id: leagueId,
      name: leagueName,
      owner: 1,
      inviteCode,
    });
    await this.#page.route(isGraphQLEndpoint, async (route) => {
      const op = extractOperationName(route).toLowerCase();
      if (op === 'getleaguebyid' || op === 'getleague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(leagueByIdResponse(league)),
        });
      } else if (op === 'getleagueteams') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            leagueTeamsResponse([
              mockTeam({ id: 1, name: 'Commish', owner: 1 }),
            ]),
          ),
        });
      } else if (op === 'getpositionsforleague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(leaguePositionsResponse()),
        });
      } else if (op === 'getuserteamid') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(userTeamIdResponse(1)),
        });
      } else if (op === 'getuserleagues') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(userLeaguesResponse([league])),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    return {
      leagueId,
      leagueName,
      inviteCode,
      inviteUrl: `/baseball/league/join/${inviteCode}`,
    };
  }

  inviteJoin(): Promise<InviteJoinResult> {
    // Purely in-memory — no route mocking needed since the spec asserts on
    // the returned count directly rather than re-fetching the roster (see
    // TestData.inviteJoin doc comment).
    this.#inviteMemberCount += 1;
    return Promise.resolve({ memberCount: this.#inviteMemberCount });
  }

  /** Stateful "current multiplier" for {@link scoringProfile}'s save round trip. */
  #scoringMultiplier = 1;

  async scoringProfile(): Promise<SeededScoringProfile> {
    const leagueId = 1;
    const statDisplayName = 'Home Runs';
    this.#scoringMultiplier = 1;
    const league = mockLeague({
      id: leagueId,
      name: 'Dual Mode Scoring League',
      owner: 1,
      draftStatus: 'not-started',
    });

    const makeStat = () => ({
      __typename: 'ScoringRule',
      multiplier: this.#scoringMultiplier,
      defaultMultiplier: 1,
      isOverride: this.#scoringMultiplier !== 1,
      isEnabled: true,
      definition: {
        __typename: 'ScoringStatDefinition',
        id: 1,
        statKey: 'hr',
        statGroup: 'batting',
        displayName: statDisplayName,
        description: 'Home run bonus',
        sourceColumn: 'homeRuns',
        defaultMultiplier: 1,
        minMultiplier: 0,
        maxMultiplier: 10,
        stepSize: 0.5,
        isRequired: false,
        enforcePositive: false,
        enforceNegative: false,
      },
    });
    // The editor only renders a group's section (and its "Batting"/"Pitching"
    // heading) when that group has at least one stat — a lone batting stat
    // would leave "Pitching" permanently absent. Include one pitching stat so
    // both group headings render, matching what the real backend returns.
    const makePitchingStat = () => ({
      __typename: 'ScoringRule',
      multiplier: 1,
      defaultMultiplier: 1,
      isOverride: false,
      isEnabled: true,
      definition: {
        __typename: 'ScoringStatDefinition',
        id: 2,
        statKey: 'so',
        statGroup: 'pitching',
        displayName: 'Strikeouts',
        description: 'Strikeout bonus',
        sourceColumn: 'strikeouts',
        defaultMultiplier: 1,
        minMultiplier: 0,
        maxMultiplier: 10,
        stepSize: 0.5,
        isRequired: false,
        enforcePositive: false,
        enforceNegative: false,
      },
    });
    const makeProfile = () => ({
      __typename: 'ScoringConfig',
      profileId: 1,
      profileName: 'Standard',
      stats: [makeStat(), makePitchingStat()],
      multiplierGroups: [],
    });

    await this.#page.route(isGraphQLEndpoint, async (route) => {
      const op = extractOperationName(route).toLowerCase();
      if (op === 'getleaguebyid' || op === 'getleague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(leagueByIdResponse(league)),
        });
      } else if (op === 'getleagueteams') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            leagueTeamsResponse([
              mockTeam({ id: 1, name: 'Commish', owner: 1 }),
            ]),
          ),
        });
      } else if (op === 'getpositionsforleague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(leaguePositionsResponse([])),
        });
      } else if (op === 'getuserteamid') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(userTeamIdResponse(1)),
        });
      } else if (op === 'getuserleagues') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(userLeaguesResponse([league])),
        });
      } else if (op === 'getleaguescoringprofile') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { leagueScoringProfile: makeProfile() },
          }),
        });
      } else if (op === 'updateleaguescoringprofile') {
        const { updates } = extractOperationVariables(route);
        const update = Array.isArray(updates)
          ? (
              updates as Array<{
                statDefinitionId: number;
                multiplier: number;
              }>
            ).find((u) => u.statDefinitionId === 1)
          : undefined;
        if (update) this.#scoringMultiplier = update.multiplier;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { updateLeagueScoringProfile: makeProfile() },
          }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    return { leagueId, statDisplayName, originalMultiplier: 1 };
  }

  async seasonRenewalDialog(): Promise<SeededSeasonRenewal> {
    await setupSeasonRenewalGraphQL(this.#page);
    return {
      leagueId: SEASON_RENEWAL_LEAGUE_ID,
      leagueName: SEASON_RENEWAL_LEAGUE_NAME,
    };
  }

  async league(): Promise<SeededLeague> {
    const fixture = this.#shared.league();
    await this.#installLeagueRoutes(fixture);
    return {
      leagueId: fixture.leagueId,
      inviteCode: fixture.inviteCode,
      commissionerTeamId: fixture.commissioner.teamId,
    };
  }

  async leagueWithMember(): Promise<SeededLeagueWithMember> {
    const fixture = this.#shared.league();
    await this.#installLeagueRoutes(fixture);
    const member =
      fixture.members().find((m) => m.userId !== fixture.commissioner.userId) ??
      fixture.addMember();
    return {
      leagueId: fixture.leagueId,
      inviteCode: fixture.inviteCode,
      commissionerTeamId: fixture.commissioner.teamId,
      memberTeamId: member.teamId,
    };
  }

  async waiverQueue(): Promise<SeededWaiverQueue> {
    const league = this.#shared.league();
    const queue = this.#shared.waiverQueue();
    const role = queue.roleFor(this);
    await this.#installLeagueRoutes(league);
    await this.#page.route(isGraphQLEndpoint, async (route) => {
      const handler = queue.handlersFor(role.teamId)[
        extractOperationName(route).toLowerCase()
      ];
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
      leagueId: league.leagueId,
      teamId: role.teamId,
      freeAgent: queue.freeAgent,
    };
  }

  async seasonActiveMatchup(): Promise<SeededSeasonActiveMatchup> {
    const league = this.#shared.league();
    const matchup = this.#shared.matchup();
    await this.#installLeagueRoutes(league);
    await this.#installMatchupRoutes(matchup);
    return {
      leagueId: league.leagueId,
      matchupId: matchup.matchupId,
      teamId: matchup.team1Id,
      opponentTeamId: matchup.team2Id,
    };
  }

  async scheduledMatchupRoster(): Promise<SeededScheduledMatchupRoster> {
    const base = await this.seasonActiveMatchup();
    const matchup = this.#shared.matchup();
    return {
      ...base,
      openSlot: matchup.openSlot,
      benchPlayer: matchup.benchPlayer,
      starterToBench: matchup.starterToBench,
      swapPair: matchup.swapPair,
    };
  }

  /**
   * Point this page's `page.route()` at the shared fixture's handler map —
   * pure transport, same shape as `footballLineup()` above. Idempotent to
   * call more than once per page (Playwright routes match LIFO; the last
   * registration wins), so `league()` and `leagueWithMember()` can both call
   * it freely.
   */
  async #installLeagueRoutes(fixture: LeagueFixture): Promise<void> {
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
  }

  /** Same shape as {@link #installLeagueRoutes}, for the matchup fixture (LS-9738). */
  async #installMatchupRoutes(fixture: MatchupFixture): Promise<void> {
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
 * Why {@link LiveTestData.seasonRenewalDialog} throws — surfaced verbatim so a
 * spec that reaches for the verb in live mode fails loudly with the reason,
 * rather than passing against a precondition that was never established.
 */
export const SEASON_RENEWAL_LIVE_UNSUPPORTED_REASON =
  'TestData.seasonRenewalDialog() has no live implementation: reaching the ' +
  '"season complete" precondition on a real backend requires the full ' +
  'create-league → 3-manager-join → automated-draft → auto-advance-to-' +
  'completion sequence (Phases 1-5 of ' +
  'season-renewal-migration-ui.integration.spec.ts), which no existing live ' +
  'TestData verb seeds. LS-9737 ports only the Phase-6 dialog-interaction ' +
  'slice; this precondition is mock-only — run the spec on a mock backend, ' +
  'or file a follow-up ticket to build the live seeding sequence.';

/**
 * Live implementation — preconditions are satisfied against the real backend.
 * Read-only preconditions (like the MLB history player pool) need no setup;
 * verbs that must create state should issue real GraphQL mutations here (see
 * `integration/helpers/create-league.ts` for the established pattern).
 */
/**
 * Surfaced verbatim when `league()`/`leagueWithMember()` are called on a
 * `LiveTestData` built without the arguments they need — the live analogue of
 * {@link FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON}, except these verbs ARE
 * live-capable; the constructor arguments are just missing.
 */
export const LEAGUE_LIVE_REQUIRES_PAGE_REASON =
  'TestData.league() needs a real browser page to drive league creation ' +
  '(integration/helpers/create-league.ts) — this LiveTestData was ' +
  'constructed without one.';

/**
 * Premium seat for `LiveTestData.leagueWithMember()`'s internal member
 * identity. Seat 2 is the commissioner (`integration/fixtures/ui.ts`'s
 * `getAuthJwt`); seat 1 is `managerJwt1` there. Seat 3 keeps this verb's
 * temporary identity distinct from `fixtures/dual.ts`'s `counterpartyPage`
 * (seat 4), so a test using both concurrently never collides.
 */
const LEAGUE_WITH_MEMBER_LIVE_SEAT = 3;

export const LEAGUE_WITH_MEMBER_LIVE_REQUIRES_BROWSER_REASON =
  "TestData.leagueWithMember() needs a Browser to open a second identity's " +
  'context for the join (integration/helpers/wait-for-join-page.ts) — this ' +
  'LiveTestData was constructed without one.';

/**
 * Cross-instance shared LIVE state (LS-9738) — the live-backend analogue of
 * {@link DualMockState}. Unlike mock mode there is no shared in-process
 * fixture object on the live backend, so this is just a mutable box: the
 * FIRST `LiveTestData` in a test to call a verb that needs a second,
 * distinct identity (`waiverQueue()`, `seasonActiveMatchup()`) stores what it
 * created here; the SECOND, distinct caller (`counterpartyTestData`, bound to
 * `fixtures/dual.ts`'s `counterpartyPage`) reads it back to join the SAME
 * league/matchup rather than creating its own. One instance per test, handed
 * to both `testData` and `counterpartyTestData`'s `LiveTestData` — mirrors
 * how `_dualMockState` is threaded through for mock mode.
 */
export class DualLiveState {
  /**
   * The test's shared seeded league (LS-10218). Stored by the FIRST
   * `league()`/`leagueWithMember()` caller so a second, distinct caller
   * (`counterpartyTestData`) resolves to the SAME league — the live analogue
   * of `DualMockState.league()`. Without it the counterparty drove its own
   * create-league UI as its own identity (seat 4) and then resolved
   * `userTeamId` with the commissioner's JWT, which is never a member of that
   * second league, so the lookup returned null on every run.
   */
  league?: SeededLeague;
  waiverQueue?: {
    leagueId: number;
    inviteCode: string;
    commissionerTeamId: number;
    freeAgentPlayerId: number;
    freeAgentPlayerName: string;
  };
  seasonActiveMatchup?: ProvisionedActiveMatchup;
}

/**
 * Premium seat for the SECOND, distinct identity `waiverQueue()` and
 * `seasonActiveMatchup()` join in on live mode — deliberately the SAME seat
 * `fixtures/dual.ts`'s `counterpartyPage` authenticates (`COUNTERPARTY_LIVE_SEAT
 * = 4`), so that when a spec later navigates `counterpartyPage` to view its
 * own team's state, it is genuinely the identity that joined/claimed it —
 * not a third, unrelated identity. Not imported directly from `dual.ts` to
 * avoid a circular import; kept in sync by convention, the same way
 * `LEAGUE_WITH_MEMBER_LIVE_SEAT` (3) above coexists with `dual.ts`'s seat 4
 * without importing it.
 */
const DUAL_LIVE_COUNTERPARTY_SEAT = 4;

export const WAIVER_QUEUE_LIVE_REQUIRES_SHARED_STATE_REASON =
  'TestData.waiverQueue() needs a DualLiveState to coordinate the ' +
  "commissioner's and the joined member's calls — this LiveTestData was " +
  'constructed without one.';

export const SEASON_ACTIVE_MATCHUP_LIVE_REQUIRES_SHARED_STATE_REASON =
  'TestData.seasonActiveMatchup() needs a DualLiveState to coordinate the ' +
  "commissioner's and the joined member's calls — this LiveTestData was " +
  'constructed without one.';

export class LiveTestData implements TestData {
  readonly mode = 'live' as const;
  readonly #page?: Page;
  readonly #browser?: Browser;
  readonly #liveState?: DualLiveState;

  /**
   * `page`/`browser` are optional because most existing verbs (the read-only
   * MLB-history ones) need neither. `league()` needs `page` (to drive the
   * real create-league UI as the identity already authenticated on it);
   * `leagueWithMember()` additionally needs `browser` (to open a second,
   * distinct identity's context for the join). `liveState` is needed only by
   * `waiverQueue()`/`seasonActiveMatchup()` (LS-9738) — see
   * `fixtures/dual.ts` for how all three are wired in.
   */
  constructor(page?: Page, browser?: Browser, liveState?: DualLiveState) {
    this.#page = page;
    this.#browser = browser;
    this.#liveState = liveState;
  }

  /**
   * Create a real league via `createLeagueAndTeams` as the premium
   * commissioner, mirroring `integration/helpers/create-league.ts`'s
   * `createLeagueViaUI` but as a direct mutation (LiveTestData verbs carry no
   * `page`). Orphaned leagues from nightly runs are reaped by the existing
   * global-setup/teardown sweep (`cleanupLeague.ts` Layers 1 &amp; 3) — the
   * same safety net the serial integration specs rely on for their own
   * per-run leagues.
   */
  async #createLiveLeague(
    leagueName: string,
    numberOfTeams = 4,
  ): Promise<{ jwt: string; leagueId: number; inviteCode: string }> {
    const jwt = await getAuthJwt();
    const data = await gqlFetch<{
      createLeagueAndTeams: {
        league: { id: number; inviteCode: string | null };
      };
    }>(
      jwt,
      `mutation DualModeCreateLeague($input: CreateLeagueAndTeamsInput!) {
         createLeagueAndTeams(input: $input) {
           league { id inviteCode }
         }
       }`,
      {
        input: {
          leagueName,
          numberOfTeams,
          playerPool: 'all',
          sport: 'baseball',
        },
      },
    );
    const { league } = data.createLeagueAndTeams;
    if (!league.inviteCode) {
      throw new Error(
        `createLeagueAndTeams returned no inviteCode for league ${league.id}`,
      );
    }
    return { jwt, leagueId: league.id, inviteCode: league.inviteCode };
  }

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

  footballLineupLocked(): Promise<SeededFootballLineupLocked> {
    // Same reasoning as `footballLineup` above — a locked-player precondition
    // needs the same real league/team/roster seeding, plus waiting for (or
    // faking) a real NFL game start, which no live verb does.
    throw new Error(FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON);
  }

  footballTeamDetailVisitor(): Promise<SeededFootballTeamDetailVisitor> {
    // Same reasoning as `footballLineup` above, plus this precondition needs a
    // SECOND real team in the league whose roster the test identity does not
    // own — further still from anything an existing live verb seeds.
    throw new Error(FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON);
  }

  footballLineupByeWeek(): Promise<SeededFootballLineupByeWeek> {
    // Same reasoning as `footballLineup` above, plus this precondition would
    // also need a real NFL bye week to be active for the seeded team.
    throw new Error(FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON);
  }

  async leagueInvite(): Promise<SeededLeagueInvite> {
    const leagueName = `Dual QR Invite ${Date.now()}`;
    const { leagueId, inviteCode } = await this.#createLiveLeague(leagueName);
    return {
      leagueId,
      leagueName,
      inviteCode,
      inviteUrl: `${WEB_BASE}/baseball/league/join/${inviteCode}`,
    };
  }

  async inviteJoin(
    invite: SeededLeagueInvite,
    teamName: string,
  ): Promise<InviteJoinResult> {
    // A second, distinct premium identity joins directly against the backend
    // (see the TestData.inviteJoin doc comment for why this isn't UI-driven).
    const managerJwt = await loginAs('premium', 1);
    await gqlFetch<{ joinLeagueByCode: { id: number } | null }>(
      managerJwt,
      `mutation DualModeJoinLeague($inviteCode: String!, $teamName: String!) {
         joinLeagueByCode(inviteCode: $inviteCode, teamName: $teamName) { id }
       }`,
      { inviteCode: invite.inviteCode, teamName },
    );

    const commissionerJwt = await getAuthJwt();
    const data = await gqlFetch<{ leagueTeams: Array<{ id: number }> }>(
      commissionerJwt,
      `query DualModeLeagueTeams($leagueId: Int!) {
         leagueTeams(leagueId: $leagueId) { id }
       }`,
      { leagueId: invite.leagueId },
    );
    return { memberCount: data.leagueTeams.length };
  }

  async scoringProfile(): Promise<SeededScoringProfile> {
    const leagueName = `Dual Scoring Editor ${Date.now()}`;
    const { jwt, leagueId } = await this.#createLiveLeague(leagueName);
    const statDisplayName = 'Home Runs';

    const data = await gqlFetch<{
      leagueScoringProfile: {
        stats: Array<{
          multiplier: number;
          definition: { displayName: string };
        }>;
      };
    }>(
      jwt,
      `query DualModeScoringProfile($leagueId: Int!) {
         leagueScoringProfile(leagueId: $leagueId) {
           stats { multiplier definition { displayName } }
         }
       }`,
      { leagueId },
    );
    const hrStat = data.leagueScoringProfile.stats.find(
      (s) => s.definition.displayName === statDisplayName,
    );
    if (!hrStat) {
      throw new Error(
        `leagueScoringProfile for league ${leagueId} has no "${statDisplayName}" stat`,
      );
    }

    return { leagueId, statDisplayName, originalMultiplier: hrStat.multiplier };
  }

  seasonRenewalDialog(): Promise<SeededSeasonRenewal> {
    // Deliberately unimplemented — see SEASON_RENEWAL_LIVE_UNSUPPORTED_REASON.
    throw new Error(SEASON_RENEWAL_LIVE_UNSUPPORTED_REASON);
  }

  async league(): Promise<SeededLeague> {
    // Second, distinct caller (`counterpartyTestData`): the SAME league the
    // first caller seeded — see `DualLiveState.league`.
    if (this.#liveState?.league) {
      return this.#liveState.league;
    }
    if (!this.#page) {
      throw new Error(LEAGUE_LIVE_REQUIRES_PAGE_REASON);
    }
    const leagueName = `E2E Dual League ${Date.now()}`;
    const { leagueId, inviteCode } = await createLeagueViaUI(this.#page, {
      leagueName,
    });
    const commissionerJwt = await getAuthJwt();
    const commissionerTeamId = await fetchUserTeamId(commissionerJwt, leagueId);
    const league = { leagueId, inviteCode, commissionerTeamId };
    if (this.#liveState) {
      this.#liveState.league = league;
    }
    return league;
  }

  async leagueWithMember(): Promise<SeededLeagueWithMember> {
    if (!this.#browser) {
      throw new Error(LEAGUE_WITH_MEMBER_LIVE_REQUIRES_BROWSER_REASON);
    }
    const league = await this.league();

    // A distinct premium identity, the same "one dedicated page per
    // identity" pattern `integration/fixtures/ui.ts`'s `managerPage1`
    // establishes — but scoped to this verb's own lifetime rather than the
    // whole test, since the seam only needs this identity long enough to
    // join and be read back.
    const memberJwt = await loginAs('premium', LEAGUE_WITH_MEMBER_LIVE_SEAT);
    const memberContext = await this.#browser.newContext({
      baseURL: WEB_BASE,
      storageState: buildIntegrationStorageState(memberJwt),
    });
    try {
      const memberPage = await memberContext.newPage();
      await joinLeagueAsManager(memberPage, {
        jwt: memberJwt,
        inviteCode: league.inviteCode,
        teamName: `E2E Dual Member ${Date.now()}`,
      });
      const memberTeamId = await fetchUserTeamId(memberJwt, league.leagueId);
      return { ...league, memberTeamId };
    } finally {
      await memberContext.close();
    }
  }

  async waiverQueue(): Promise<SeededWaiverQueue> {
    if (!this.#liveState) {
      throw new Error(WAIVER_QUEUE_LIVE_REQUIRES_SHARED_STATE_REASON);
    }
    if (!this.#liveState.waiverQueue) {
      // First caller (commissioner): create the league and pick the free
      // agent both teams will compete for.
      const league = await this.league();
      const commissionerJwt = await getAuthJwt();
      const { freeAgents } = await gqlFetch<{
        freeAgents: Array<{ id: number; firstName: string; lastName: string }>;
      }>(
        commissionerJwt,
        `query GetFreeAgentPlayersForWaiverQueue($leagueId: Int!) {
           freeAgents(leagueId: $leagueId) { id firstName lastName }
         }`,
        { leagueId: league.leagueId },
      );
      const picked = freeAgents[0];
      if (!picked) {
        throw new Error(
          `TestData.waiverQueue(): league ${league.leagueId} has no free ` +
            'agents to seed the precondition.',
        );
      }
      const freeAgentPlayerName =
        `${picked.firstName} ${picked.lastName}`.trim();
      this.#liveState.waiverQueue = {
        leagueId: league.leagueId,
        inviteCode: league.inviteCode,
        commissionerTeamId: league.commissionerTeamId,
        freeAgentPlayerId: picked.id,
        freeAgentPlayerName,
      };
      return {
        leagueId: league.leagueId,
        teamId: league.commissionerTeamId,
        freeAgent: { playerId: picked.id, fullName: freeAgentPlayerName },
      };
    }

    // Second, distinct caller (the joined member, bound to `dual.ts`'s
    // `counterpartyPage`): join the SAME league as that real identity and
    // submit ITS competing claim via the API — not a second UI drive of the
    // same free-agents flow the spec already exercises for the commissioner.
    const shared = this.#liveState.waiverQueue;
    const memberJwt = await loginAs('premium', DUAL_LIVE_COUNTERPARTY_SEAT);
    const { joinLeagueByCode } = await gqlFetch<{
      joinLeagueByCode: { id: number };
    }>(
      memberJwt,
      `mutation JoinLeagueByCodeForWaiverQueue($inviteCode: String!, $teamName: String!) {
         joinLeagueByCode(inviteCode: $inviteCode, teamName: $teamName) { id }
       }`,
      {
        inviteCode: shared.inviteCode,
        teamName: `E2E Waiver Queue ${Date.now()}`,
      },
    );
    const teamId = Number(joinLeagueByCode.id);
    await gqlFetch(
      memberJwt,
      `mutation ClaimFreeAgentForWaiverQueue($leagueId: Int!, $playerId: Int!) {
         claimFreeAgent(leagueId: $leagueId, playerId: $playerId) { id status }
       }`,
      { leagueId: shared.leagueId, playerId: shared.freeAgentPlayerId },
    );
    return {
      leagueId: shared.leagueId,
      teamId,
      freeAgent: {
        playerId: shared.freeAgentPlayerId,
        fullName: shared.freeAgentPlayerName,
      },
    };
  }

  async seasonActiveMatchup(): Promise<SeededSeasonActiveMatchup> {
    if (!this.#liveState) {
      throw new Error(SEASON_ACTIVE_MATCHUP_LIVE_REQUIRES_SHARED_STATE_REASON);
    }
    if (!this.#liveState.seasonActiveMatchup) {
      const commissionerJwt = await getAuthJwt();
      const memberJwt = await loginAs('premium', DUAL_LIVE_COUNTERPARTY_SEAT);
      const provisioned = await provisionActiveMatchup({
        commissionerJwt,
        memberJwt,
        leagueName: `E2E Season Active Matchup ${Date.now()}`,
      });
      this.#liveState.seasonActiveMatchup = provisioned;
      return {
        leagueId: provisioned.leagueId,
        matchupId: provisioned.matchupId,
        teamId: provisioned.commissionerTeamId,
        opponentTeamId: provisioned.memberTeamId,
      };
    }

    // Second, distinct caller — the member joined during the first call
    // already; resolve the SAME identity's own team.
    const shared = this.#liveState.seasonActiveMatchup;
    return {
      leagueId: shared.leagueId,
      matchupId: shared.matchupId,
      teamId: shared.memberTeamId,
      opponentTeamId: shared.commissionerTeamId,
    };
  }

  async scheduledMatchupRoster(): Promise<SeededScheduledMatchupRoster> {
    const base = await this.seasonActiveMatchup();
    const commissionerJwt = await getAuthJwt();

    const { getMatchupPlayers } = await gqlFetch<{
      getMatchupPlayers: Array<{
        id: string;
        teamId: number;
        positionId: number | null;
        player: {
          firstName: string;
          lastName: string;
          eligiblePositions: string[] | null;
        };
      }>;
    }>(
      commissionerJwt,
      `query GetMatchupPlayersForRosterVerb($matchupId: Int!) {
         getMatchupPlayers(matchupId: $matchupId) {
           id
           teamId
           positionId
           player { firstName lastName eligiblePositions }
         }
       }`,
      { matchupId: base.matchupId },
    );
    const starters = getMatchupPlayers.filter(
      (p) => p.teamId === base.teamId && p.positionId !== null,
    );
    const starter = starters[0];
    if (!starter || starter.positionId == null) {
      throw new Error(
        `TestData.scheduledMatchupRoster(): team ${base.teamId} has no ` +
          `assigned starter to free a slot from (matchup ${base.matchupId}).`,
      );
    }
    const starterToBench = starters[1];
    if (!starterToBench) {
      throw new Error(
        `TestData.scheduledMatchupRoster(): team ${base.teamId} needs at ` +
          `least 2 starters (1 to free for the open slot, 1 more to bench ` +
          `during the test) in matchup ${base.matchupId}.`,
      );
    }

    const { leaguePositions } = await gqlFetch<{
      leaguePositions: Array<{ id: number; positionType: string }>;
    }>(
      commissionerJwt,
      `query LeaguePositionsForRosterVerb($leagueId: Int!) {
         leaguePositions(leagueId: $leagueId) { id positionType }
       }`,
      { leagueId: base.leagueId },
    );
    const positionTypeById = new Map(
      leaguePositions.map((p) => [p.id, p.positionType]),
    );
    const slotTypeOf = (positionId: number | null): string | null =>
      positionId != null ? (positionTypeById.get(positionId) ?? null) : null;
    const eligibleForSlot = (
      eligible: string[] | null,
      slotType: string | null,
    ): boolean => {
      if (!slotType) return true;
      if (!eligible || eligible.length === 0) return false;
      return eligible.some((p) => p.toUpperCase() === slotType.toUpperCase());
    };

    // Find two starters (excluding `starter`/`starterToBench`, which the
    // spec's assign/bench steps mutate) mutually eligible for each other's
    // slot — mirrors the live integration spec's Phase 8 pairing search.
    const swapCandidates = starters.filter(
      (p) => p.id !== starter.id && p.id !== starterToBench.id,
    );
    let swapPair:
      | [(typeof swapCandidates)[number], (typeof swapCandidates)[number]]
      | null = null;
    for (let i = 0; i < swapCandidates.length && !swapPair; i++) {
      for (let j = i + 1; j < swapCandidates.length && !swapPair; j++) {
        const a = swapCandidates[i];
        const b = swapCandidates[j];
        const aForB = eligibleForSlot(
          a.player.eligiblePositions,
          slotTypeOf(b.positionId),
        );
        const bForA = eligibleForSlot(
          b.player.eligiblePositions,
          slotTypeOf(a.positionId),
        );
        if (aForB && bForA) swapPair = [a, b];
      }
    }
    if (!swapPair) {
      throw new Error(
        `TestData.scheduledMatchupRoster(): team ${base.teamId} has no ` +
          `two starters mutually eligible for each other's slot in matchup ` +
          `${base.matchupId} (required for the swap step).`,
      );
    }

    const positionType = slotTypeOf(starter.positionId) ?? 'UNKNOWN';

    // Bench `starter` to manufacture the "one open slot, one eligible bench
    // player" precondition — mirrors `footballLineup()`'s scenario, which
    // the mock verb pre-bakes; the live backend has no equivalent curated
    // fixture, so free a real slot instead.
    await gqlFetch(
      commissionerJwt,
      `mutation FreeMatchupSlotForRosterVerb($matchupPlayerId: Int!) {
         updateMatchupPlayerPosition(matchupPlayerId: $matchupPlayerId, positionId: null) {
           id
           positionId
         }
       }`,
      { matchupPlayerId: Number(starter.id) },
    );

    const fullNameOf = (p: (typeof starters)[number]) =>
      `${p.player.firstName} ${p.player.lastName}`.trim();

    return {
      ...base,
      openSlot: { positionId: starter.positionId, positionType },
      benchPlayer: {
        matchupPlayerId: starter.id,
        fullName: fullNameOf(starter),
      },
      starterToBench: {
        matchupPlayerId: starterToBench.id,
        fullName: fullNameOf(starterToBench),
      },
      swapPair: [
        {
          matchupPlayerId: swapPair[0].id,
          fullName: fullNameOf(swapPair[0]),
        },
        {
          matchupPlayerId: swapPair[1].id,
          fullName: fullNameOf(swapPair[1]),
        },
      ],
    };
  }
}

/** Resolve the calling identity's team in `leagueId` after creating/joining it. */
async function fetchUserTeamId(jwt: string, leagueId: number): Promise<number> {
  const { userTeamId } = await gqlFetch<{ userTeamId: number | null }>(
    jwt,
    `query GetUserTeamIdForSeededLeague($leagueId: Int!) { userTeamId(leagueId: $leagueId) }`,
    { leagueId },
  );
  if (userTeamId == null) {
    throw new Error(
      `userTeamId(leagueId: ${leagueId}) returned null for the seeded-league ` +
        'fixture — the JWT identity has no team in that league. The ' +
        'create/join write is visible to this read immediately (LS-4379), so ' +
        'this is an identity mismatch, not propagation lag (LS-10218).',
    );
  }
  return userTeamId;
}
