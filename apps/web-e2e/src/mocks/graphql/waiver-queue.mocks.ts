/**
 * Waiver-claim-queue GraphQL mock data factory (LS-9738, seam-extension-list
 * rank #4: `docs/dev-process/e2e-dual-mode-migration-matrix.md` row #1).
 *
 * {@link createWaiverQueueFixture} is a sibling of {@link
 * import('./league-fixture.mocks').createLeagueFixture} — it layers a mutable
 * free-agent-claim queue on TOP of an existing {@link LeagueFixture} so two
 * pages sharing that league fixture (via `DualMockState`, see
 * `fixtures/test-data.ts`) can submit COMPETING claims for the same free
 * agent and observe each other's pending state.
 *
 * Deliberately does NOT reimplement the real priority-resolution algorithm
 * (`processWaiverClaims` on the live backend) — the migration matrix
 * explicitly flags that as a correctness-drift risk. `process()` below
 * resolves claims deterministically (earliest submission wins), which is
 * enough to exercise the pending-visible → processed → pending-absent UI
 * round trip; the real priority math stays live-only (residual
 * `waiver-processing-ui.integration.spec.ts` phases).
 *
 * This module is payload-only: it never imports from `fixtures/`, matching
 * the layering `roster.mocks.ts` and `league-fixture.mocks.ts` document.
 */
import type { MockOperationResponder } from './roster.mocks';
import { userTeamIdResponse } from './league.mocks';
import type { LeagueFixture } from './league-fixture.mocks';
import {
  comparablePlayersResponse,
  mockComparablePlayer,
} from './player.mocks';

export interface WaiverQueueFreeAgent {
  playerId: number;
  fullName: string;
}

export interface WaiverClaimRecord {
  id: number;
  teamId: number;
  playerId: number;
  status: 'pending' | 'completed' | 'failed';
}

export interface WaiverQueueRole {
  teamId: number;
  isCommissioner: boolean;
}

export interface ProcessWaiverClaimsResult {
  processed: number;
  succeeded: number;
  failed: number;
}

export interface WaiverQueueFixture {
  readonly freeAgent: WaiverQueueFreeAgent;
  /**
   * Assign the calling `MockTestData` instance a team in the queue. The
   * FIRST distinct caller becomes the commissioner's own team (no claim
   * submitted); the SECOND becomes the joined member's team and immediately
   * gets a pending claim for {@link freeAgent} pre-seeded — the "competing"
   * team — mirroring what `LiveTestData.waiverQueue()`'s second call does
   * via a real mutation. Stable per caller (repeat calls return the same
   * role).
   */
  roleFor(caller: object): WaiverQueueRole;
  /** Resolve every pending claim for {@link freeAgent} deterministically. */
  process(): ProcessWaiverClaimsResult;
  /** Lowercased GraphQL operation name → response-body builder, scoped to `teamId`'s perspective. */
  handlersFor(teamId: number): Readonly<Record<string, MockOperationResponder>>;
}

const DEFAULT_FREE_AGENT: WaiverQueueFreeAgent = {
  playerId: 7001,
  fullName: 'Wade Boggs',
};

export function createWaiverQueueFixture(
  league: LeagueFixture,
  freeAgent: WaiverQueueFreeAgent = DEFAULT_FREE_AGENT,
): WaiverQueueFixture {
  let claims: WaiverClaimRecord[] = [];
  let nextClaimId = 1;
  const roles = new WeakMap<object, WaiverQueueRole>();
  let callCount = 0;

  function submitClaim(teamId: number): WaiverClaimRecord {
    const existing = claims.find(
      (c) =>
        c.teamId === teamId &&
        c.playerId === freeAgent.playerId &&
        c.status === 'pending',
    );
    if (existing) return existing;
    const claim: WaiverClaimRecord = {
      id: nextClaimId++,
      teamId,
      playerId: freeAgent.playerId,
      status: 'pending',
    };
    claims = [...claims, claim];
    return claim;
  }

  function roleFor(caller: object): WaiverQueueRole {
    const existing = roles.get(caller);
    if (existing) return existing;
    const isFirst = callCount === 0;
    callCount += 1;
    let role: WaiverQueueRole;
    if (isFirst) {
      role = { teamId: league.commissioner.teamId, isCommissioner: true };
    } else {
      const member =
        league.members().find((m) => m.userId !== league.commissioner.userId) ??
        league.addMember();
      submitClaim(member.teamId);
      role = { teamId: member.teamId, isCommissioner: false };
    }
    roles.set(caller, role);
    return role;
  }

  function process(): ProcessWaiverClaimsResult {
    const targets = claims.filter(
      (c) => c.status === 'pending' && c.playerId === freeAgent.playerId,
    );
    claims = claims.map((c) => {
      const index = targets.indexOf(c);
      if (index === -1) return c;
      return { ...c, status: index === 0 ? 'completed' : 'failed' };
    });
    return {
      processed: targets.length,
      succeeded: targets.length > 0 ? 1 : 0,
      failed: Math.max(targets.length - 1, 0),
    };
  }

  function handlersFor(teamId: number): Record<string, MockOperationResponder> {
    return {
      getuserteamid: () => userTeamIdResponse(teamId),
      getplayerswithstats: () =>
        comparablePlayersResponse([
          mockComparablePlayer({
            id: freeAgent.playerId,
            firstName: freeAgent.fullName.split(' ')[0] ?? freeAgent.fullName,
            lastName: freeAgent.fullName.split(' ').slice(1).join(' '),
            eligiblePositions: ['1B'],
          }),
        ]),
      getteammembers: () => ({ data: { teamMembers: [] } }),
      claimfreeagent: () => {
        const claim = submitClaim(teamId);
        return {
          data: {
            claimFreeAgent: {
              __typename: 'WaiverClaim',
              id: claim.id,
              leagueId: league.leagueId,
              teamId,
              playerId: claim.playerId,
              dropPlayerId: null,
              faabBid: null,
              status: claim.status,
              errorMessage: null,
              createdAt: new Date().toISOString(),
            },
          },
        };
      },
      getteamwaiverclaims: (variables) => ({
        data: {
          teamWaiverClaims: claims
            .filter((c) => c.teamId === teamId)
            .filter((c) =>
              variables['status'] == null
                ? true
                : c.status === variables['status'],
            )
            .map((c) => ({
              __typename: 'WaiverClaim',
              id: c.id,
              leagueId: league.leagueId,
              teamId: c.teamId,
              playerId: c.playerId,
              dropPlayerId: null,
              faabBid: null,
              status: c.status,
              errorMessage: null,
              playerName: freeAgent.fullName,
              dropPlayerName: null,
              processedAt:
                c.status === 'pending' ? null : new Date().toISOString(),
              createdAt: new Date().toISOString(),
            })),
        },
      }),
      processwaiverclaims: () => ({ data: { processWaiverClaims: process() } }),
    };
  }

  return { freeAgent, roleFor, process, handlersFor };
}
