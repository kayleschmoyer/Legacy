/**
 * Native hermetic backend wiring (ADR-0017 / ADR-0016 backend seam, third
 * implementation — LS-8448).
 *
 * Ties the generic {@link GraphQLMockServer} (transport) to the E2E fixtures:
 *
 *   • {@link NativeMockTestData} — the `TestData` seam for native, the exact
 *     counterpart of `MockTestData`. Where the web version installs
 *     `page.route()` overrides, this registers in-process handlers on the
 *     per-worker server (`server.override`). It reuses the SAME payload
 *     factories (`src/mocks/graphql/`) — no forked fixtures (AC2).
 *   • {@link createNativeMockServer} — builds a server seeded with the shared
 *     `BASELINE_GRAPHQL_RESPONSES` baseline, so ambient operations resolve
 *     identically to the web hermetic run.
 *   • {@link reverseForwardToDevice} — points the emulator app at the worker's
 *     server via `adb reverse`, so the APK's baked
 *     `EXPO_PUBLIC_GRAPHQL_HOST=http://localhost:<port>/graphql` reaches it.
 *   • {@link realtimeUnavailable} — the AC4 capability gate: WebSocket-driven
 *     flows are live-only on native until the server speaks WS.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { BASELINE_GRAPHQL_RESPONSES } from './shared-mocks';
import type { BackendMode, PlatformMode } from './dual';
import type {
  InviteJoinResult,
  SeededDiscoverySearch,
  SeededFootballLineup,
  SeededFootballLineupByeWeek,
  SeededFootballLineupLocked,
  SeededFootballTeamDetailVisitor,
  SeededLeague,
  SeededLeagueInvite,
  SeededLeagueWithMember,
  SeededPlayerPool,
  SeededScheduledMatchupRoster,
  SeededScoringProfile,
  SeededSeasonActiveMatchup,
  SeededSeasonRenewal,
  SeededWaiverQueue,
  TestData,
} from './test-data';
import { createLeagueFixture } from '../mocks/graphql/league-fixture.mocks';
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
import {
  createFootballLineupFixture,
  createFootballTeamDetailVisitorScenario,
  type FootballLineupFixture,
  mockRosterPlayer,
  mockTeamMember,
  VISITOR_STARTER,
  VISITOR_VIEWER_TEAM_ID,
} from '../mocks/graphql/roster.mocks';
import { createWaiverQueueFixture } from '../mocks/graphql/waiver-queue.mocks';
import { createMatchupFixture } from '../mocks/graphql/matchup-fixture.mocks';
import { GraphQLMockServer } from '../mocks/graphql/server/native-mock-server';

const execFileAsync = promisify(execFile);

/**
 * The **device-side** port the bypass APK is built to talk to
 * (`EXPO_PUBLIC_GRAPHQL_HOST=http://localhost:<port>/graphql`). `adb reverse`
 * maps it to the worker's dynamically-chosen host port, so the baked APK never
 * needs to know the host port. Overridable to keep the APK build and the runner
 * in sync from one env var.
 */
export const NATIVE_GRAPHQL_DEVICE_PORT = Number(
  process.env['E2E_NATIVE_GRAPHQL_PORT'] ?? 8083,
);

/** Build a per-worker mock server seeded with the shared hermetic baseline. */
export function createNativeMockServer(): GraphQLMockServer {
  return new GraphQLMockServer({ baseline: BASELINE_GRAPHQL_RESPONSES });
}

/**
 * `adb reverse tcp:<devicePort> tcp:<hostPort>` — route the emulator's
 * `localhost:<devicePort>` to the worker's mock server on the host. Best-effort
 * teardown mirror is {@link clearReverseForward}. Throws if `adb` fails so a
 * mis-provisioned emulator surfaces loudly rather than as a mystery timeout.
 */
export async function reverseForwardToDevice(
  hostPort: number,
  devicePort: number = NATIVE_GRAPHQL_DEVICE_PORT,
): Promise<void> {
  await execFileAsync('adb', [
    'reverse',
    `tcp:${devicePort}`,
    `tcp:${hostPort}`,
  ]);
}

/** Remove the `adb reverse` mapping (best-effort; ignores errors on teardown). */
export async function clearReverseForward(
  devicePort: number = NATIVE_GRAPHQL_DEVICE_PORT,
): Promise<void> {
  try {
    await execFileAsync('adb', ['reverse', '--remove', `tcp:${devicePort}`]);
  } catch {
    // Teardown is best-effort — the emulator is torn down after the run anyway.
  }
}

/**
 * The reason a WebSocket-driven flow is skipped on the native mock backend —
 * used as the explicit `test.skip` message so the skip is never silent (AC4).
 */
export const REALTIME_LIVE_ONLY_REASON =
  'live draft is WebSocket-driven; the native mock server is HTTP-only. This ' +
  'flow is live-only on native until the server speaks the WS protocol ' +
  '(AC4, LS-8448).';

/**
 * True when realtime/WebSocket flows are unavailable for this project — i.e. the
 * native platform running against the HTTP-only mock server. A WS-dependent
 * shared spec gates on this explicitly:
 *
 * ```ts
 * test.skip(realtimeUnavailable({ platform, backend }), REALTIME_LIVE_ONLY_REASON);
 * ```
 *
 * so the flow runs live on native and mocked/live on web, but never silently
 * no-ops. The server's loud subscription rejection is the backstop.
 */
export function realtimeUnavailable(opts: {
  platform: PlatformMode;
  backend: BackendMode;
}): boolean {
  return opts.platform === 'native' && opts.backend === 'mock';
}

/**
 * Native hermetic `TestData` — the counterpart of `MockTestData`, registering
 * per-test operation handlers on the per-worker {@link GraphQLMockServer}
 * instead of `page.route()`. Method bodies mirror `MockTestData` verb-for-verb
 * and reuse the SAME factories, so the shared spec body and its returned handles
 * are identical across web-mock, live, and native-mock (ADR-0016 §backend seam).
 */
export class NativeMockTestData implements TestData {
  readonly mode = 'mock' as const;
  readonly #server: GraphQLMockServer;

  constructor(server: GraphQLMockServer) {
    this.#server = server;
  }

  playerPool(): Promise<SeededPlayerPool> {
    const payload = careerBattingConnectionResponse();
    // The stats grid fires three ops that all consume the connection payload.
    for (const op of [
      'getcareerbattingstats',
      'getallplayers',
      'getplayerswithstats',
    ]) {
      this.#server.override(op, () => payload);
    }
    return Promise.resolve({ fullName: 'Mike Trout', searchTerm: 'Trout' });
  }

  discoverySearch(): Promise<SeededDiscoverySearch> {
    const unmatchedTerm = 'zz-no-such-league-zz';
    // Server-side search: answer the searched query itself — two leagues for
    // unsearched loads, empty once the unmatched term is submitted.
    this.#server.override('getpublicleagues', (request) => {
      const search = (request.variables as { search?: unknown }).search;
      return search === unmatchedTerm
        ? publicLeaguesEmptyResponse()
        : publicLeaguesResponse([
            { id: 1, name: 'Sunday Sluggers' },
            { id: 2, name: 'Midnight Marlins' },
          ]);
    });
    return Promise.resolve({ unmatchedTerm });
  }

  pitchingLeaders(): Promise<void> {
    const stats = careerPitchingLeadersResponse();
    const count = careerPitchingLeadersCountResponse(1);
    this.#server.override('getcareerpitchingstats', () => stats);
    this.#server.override('getcareerpitchingstatscount', () => count);
    return Promise.resolve();
  }

  comparablePlayer(): Promise<SeededPlayerPool> {
    const payload = comparablePlayersResponse();
    this.#server.override('getplayerswithstats', () => payload);
    return Promise.resolve({ fullName: 'Mike Trout', searchTerm: 'Trout' });
  }

  /**
   * Register a {@link FootballLineupFixture}'s handler map on the per-worker
   * mock server — shared by {@link footballLineup}, {@link footballLineupLocked}
   * and {@link footballLineupByeWeek}. Same fixture, same handler map, same
   * mutable roster as the web verb — only the registration differs
   * (`server.override` here, `page.route()` there). No forked payloads
   * (ADR-0017 AC2).
   */
  #installFootballLineupRoutes(fixture: FootballLineupFixture): void {
    for (const [op, handler] of Object.entries(fixture.handlers)) {
      this.#server.override(op, (request) => handler(request.variables));
    }
  }

  footballLineup(): Promise<SeededFootballLineup> {
    const fixture = createFootballLineupFixture();
    this.#installFootballLineupRoutes(fixture);
    return Promise.resolve({
      leagueId: fixture.leagueId,
      teamId: fixture.teamId,
      openSlot: fixture.openSlot,
      benchPlayer: fixture.benchPlayer,
    });
  }

  footballLineupLocked(): Promise<SeededFootballLineupLocked> {
    // Same scenario construction as MockTestData.footballLineupLocked() —
    // kept in sync deliberately (ADR-0017 AC2): one locked starter (QB), one
    // locked bench player eligible for the open WR slot.
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
    this.#installFootballLineupRoutes(fixture);
    return Promise.resolve({
      leagueId: fixture.leagueId,
      teamId: fixture.teamId,
      lockedStarter: { fullName: 'Patrick Mahomes', positionType: 'QB' },
      lockedBenchPlayer: { fullName: 'Justin Jefferson', positionType: 'WR' },
      openSlotPositionType: 'WR',
    });
  }

  footballLineupByeWeek(): Promise<SeededFootballLineupByeWeek> {
    // Same scenario construction as MockTestData.footballLineupByeWeek().
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
      currentWeekNumber: 1,
      byeWeeksByTeam: { BUF: 1 },
    });
    this.#installFootballLineupRoutes(fixture);
    return Promise.resolve({
      leagueId: fixture.leagueId,
      teamId: fixture.teamId,
      byeStarter: { fullName: 'Josh Allen', positionType: 'QB' },
    });
  }

  footballTeamDetailVisitor(): Promise<SeededFootballTeamDetailVisitor> {
    const fixture = createFootballTeamDetailVisitorScenario();
    this.#installFootballLineupRoutes(fixture);
    return Promise.resolve({
      leagueId: fixture.leagueId,
      teamId: fixture.teamId,
      viewerTeamId: VISITOR_VIEWER_TEAM_ID,
      starter: { ...VISITOR_STARTER },
    });
  }

  // ── LS-9737 verbs: no native page objects exist yet for these web-only
  // flows (league invite card, scoring editor, season-renewal dialog, the
  // player-comparison premium banner) — deliberately unimplemented rather
  // than a silent no-op, matching the interface contract. Implement
  // alongside the first native dual spec that needs one of these surfaces.

  leagueInvite(): Promise<SeededLeagueInvite> {
    throw new Error(
      'NativeMockTestData.leagueInvite() is not implemented — no native ' +
        'page object covers the league invite card yet (LS-9737 is web-only).',
    );
  }

  inviteJoin(): Promise<InviteJoinResult> {
    throw new Error(
      'NativeMockTestData.inviteJoin() is not implemented — no native page ' +
        'object covers the league invite card yet (LS-9737 is web-only).',
    );
  }

  scoringProfile(): Promise<SeededScoringProfile> {
    throw new Error(
      'NativeMockTestData.scoringProfile() is not implemented — no native ' +
        'page object covers the scoring editor yet (LS-9737 is web-only).',
    );
  }

  seasonRenewalDialog(): Promise<SeededSeasonRenewal> {
    throw new Error(
      'NativeMockTestData.seasonRenewalDialog() is not implemented — no ' +
        'native page object covers the renewal dialog yet (LS-9737 is web-only).',
    );
  }

  /**
   * Native-mock analogue of `MockTestData.league()`. Out of scope for this
   * ticket's multi-actor fixture (LS-9736 covers the web dual lane only —
   * there is no second native worker/server to share state with), but the
   * `TestData` interface is implemented uniformly, so this seeds a
   * single-worker league fixture the same way `footballLineup()` does above.
   */
  league(): Promise<SeededLeague> {
    const fixture = createLeagueFixture();
    for (const [op, handler] of Object.entries(fixture.handlers)) {
      this.#server.override(op, (request) => handler(request.variables));
    }
    return Promise.resolve({
      leagueId: fixture.leagueId,
      inviteCode: fixture.inviteCode,
      commissionerTeamId: fixture.commissioner.teamId,
    });
  }

  leagueWithMember(): Promise<SeededLeagueWithMember> {
    const fixture = createLeagueFixture();
    for (const [op, handler] of Object.entries(fixture.handlers)) {
      this.#server.override(op, (request) => handler(request.variables));
    }
    const member = fixture.addMember();
    return Promise.resolve({
      leagueId: fixture.leagueId,
      inviteCode: fixture.inviteCode,
      commissionerTeamId: fixture.commissioner.teamId,
      memberTeamId: member.teamId,
    });
  }

  /**
   * Native-mock analogue of `MockTestData.waiverQueue()` (LS-9738). Same
   * out-of-scope note as `league()` above — single-worker only, no second
   * native worker to share state with, so there is only ever a "first
   * caller" (the commissioner, no competing claim pre-seeded).
   */
  waiverQueue(): Promise<SeededWaiverQueue> {
    const league = createLeagueFixture();
    const queue = createWaiverQueueFixture(league);
    const role = queue.roleFor(this);
    for (const [op, handler] of Object.entries(league.handlers)) {
      this.#server.override(op, (request) => handler(request.variables));
    }
    for (const [op, handler] of Object.entries(
      queue.handlersFor(role.teamId),
    )) {
      this.#server.override(op, (request) => handler(request.variables));
    }
    return Promise.resolve({
      leagueId: league.leagueId,
      teamId: role.teamId,
      freeAgent: queue.freeAgent,
    });
  }

  /** Native-mock analogue of `MockTestData.seasonActiveMatchup()` (LS-9738). */
  seasonActiveMatchup(): Promise<SeededSeasonActiveMatchup> {
    const league = createLeagueFixture();
    const matchup = createMatchupFixture(league);
    for (const [op, handler] of Object.entries(league.handlers)) {
      this.#server.override(op, (request) => handler(request.variables));
    }
    for (const [op, handler] of Object.entries(matchup.handlers)) {
      this.#server.override(op, (request) => handler(request.variables));
    }
    return Promise.resolve({
      leagueId: league.leagueId,
      matchupId: matchup.matchupId,
      teamId: matchup.team1Id,
      opponentTeamId: matchup.team2Id,
    });
  }

  /** Native-mock analogue of `MockTestData.scheduledMatchupRoster()` (LS-9738). */
  scheduledMatchupRoster(): Promise<SeededScheduledMatchupRoster> {
    const league = createLeagueFixture();
    const matchup = createMatchupFixture(league);
    for (const [op, handler] of Object.entries(league.handlers)) {
      this.#server.override(op, (request) => handler(request.variables));
    }
    for (const [op, handler] of Object.entries(matchup.handlers)) {
      this.#server.override(op, (request) => handler(request.variables));
    }
    return Promise.resolve({
      leagueId: league.leagueId,
      matchupId: matchup.matchupId,
      teamId: matchup.team1Id,
      opponentTeamId: matchup.team2Id,
      openSlot: matchup.openSlot,
      benchPlayer: matchup.benchPlayer,
      starterToBench: matchup.starterToBench,
      swapPair: matchup.swapPair,
    });
  }
}
