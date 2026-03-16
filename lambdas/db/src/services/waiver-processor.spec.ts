/**
 * Unit tests for waiver claim priority resolution.
 *
 * Exercises the exported sortClaimsByPriority helper directly to validate
 * that the correct team wins based on waiver order, FAAB bid, and
 * deterministic tiebreakers.
 */

import { sortClaimsByPriority } from './waiver-processor';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal PendingClaim-shaped object for sort testing. */
function makeClaim(overrides: {
  id: number;
  teamId: number;
  playerId: number;
  faabBid?: number | null;
  createdAt?: Date;
}) {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: overrides.id,
    leagueId: 1,
    teamId: overrides.teamId,
    userId: overrides.teamId * 10,
    playerId: overrides.playerId,
    dropPlayerId: null,
    faabBid: overrides.faabBid ?? null,
    status: 'pending' as const,
    errorMessage: null,
    processedAt: null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: now,
  };
}

type TeamSettings = {
  id: number;
  waiverOrder: number | null;
  faabBudget: number | null;
};

/** Thin wrapper around the exported sort helper for test convenience. */
function sortClaims(
  claims: ReturnType<typeof makeClaim>[],
  waiverType: string,
  teamSettings: TeamSettings[],
): ReturnType<typeof makeClaim>[] {
  const teamMap = new Map(teamSettings.map((t) => [t.id, t]));
  sortClaimsByPriority(claims, waiverType, teamMap);
  return claims;
}

// ── Standard waiver tests ──────────────────────────────────────────────────

describe('WaiverClaimProcessor — sortByPriority', () => {
  describe('standard waivers', () => {
    it('lower waiverOrder wins (higher priority)', () => {
      const claims = [
        makeClaim({ id: 2, teamId: 20, playerId: 100 }),
        makeClaim({ id: 1, teamId: 10, playerId: 100 }),
      ];
      const teams: TeamSettings[] = [
        { id: 10, waiverOrder: 1, faabBudget: null },
        { id: 20, waiverOrder: 3, faabBudget: null },
      ];

      sortClaims(claims, 'standard', teams);

      expect(claims[0].teamId).toBe(10);
      expect(claims[1].teamId).toBe(20);
    });

    it('equal waiverOrder falls back to earlier createdAt', () => {
      const earlier = new Date('2026-01-01T00:00:00Z');
      const later = new Date('2026-01-01T01:00:00Z');

      const claims = [
        makeClaim({ id: 2, teamId: 20, playerId: 100, createdAt: later }),
        makeClaim({ id: 1, teamId: 10, playerId: 100, createdAt: earlier }),
      ];
      const teams: TeamSettings[] = [
        { id: 10, waiverOrder: 2, faabBudget: null },
        { id: 20, waiverOrder: 2, faabBudget: null },
      ];

      sortClaims(claims, 'standard', teams);

      expect(claims[0].teamId).toBe(10);
      expect(claims[1].teamId).toBe(20);
    });

    it('equal waiverOrder and equal createdAt falls back to lower claim ID', () => {
      const same = new Date('2026-01-01T00:00:00Z');

      const claims = [
        makeClaim({ id: 5, teamId: 20, playerId: 100, createdAt: same }),
        makeClaim({ id: 3, teamId: 10, playerId: 100, createdAt: same }),
      ];
      const teams: TeamSettings[] = [
        { id: 10, waiverOrder: 2, faabBudget: null },
        { id: 20, waiverOrder: 2, faabBudget: null },
      ];

      sortClaims(claims, 'standard', teams);

      expect(claims[0].teamId).toBe(10);
      expect(claims[1].teamId).toBe(20);
    });

    it('null waiverOrder treated as worst priority (999)', () => {
      const claims = [
        makeClaim({ id: 1, teamId: 10, playerId: 100 }),
        makeClaim({ id: 2, teamId: 20, playerId: 100 }),
      ];
      const teams: TeamSettings[] = [
        { id: 10, waiverOrder: null, faabBudget: null },
        { id: 20, waiverOrder: 3, faabBudget: null },
      ];

      sortClaims(claims, 'standard', teams);

      expect(claims[0].teamId).toBe(20);
      expect(claims[1].teamId).toBe(10);
    });

    it('both null waiverOrders falls back to createdAt then claim ID', () => {
      const earlier = new Date('2026-01-01T00:00:00Z');
      const later = new Date('2026-01-01T01:00:00Z');

      const claims = [
        makeClaim({ id: 2, teamId: 20, playerId: 100, createdAt: later }),
        makeClaim({ id: 1, teamId: 10, playerId: 100, createdAt: earlier }),
      ];
      const teams: TeamSettings[] = [
        { id: 10, waiverOrder: null, faabBudget: null },
        { id: 20, waiverOrder: null, faabBudget: null },
      ];

      sortClaims(claims, 'standard', teams);

      expect(claims[0].teamId).toBe(10);
      expect(claims[1].teamId).toBe(20);
    });

    it('sorts multiple claims correctly across four teams', () => {
      const base = new Date('2026-01-01T00:00:00Z');
      const claims = [
        makeClaim({ id: 4, teamId: 40, playerId: 100, createdAt: base }),
        makeClaim({ id: 2, teamId: 20, playerId: 100, createdAt: base }),
        makeClaim({ id: 3, teamId: 30, playerId: 100, createdAt: base }),
        makeClaim({ id: 1, teamId: 10, playerId: 100, createdAt: base }),
      ];
      const teams: TeamSettings[] = [
        { id: 10, waiverOrder: 1, faabBudget: null },
        { id: 20, waiverOrder: 2, faabBudget: null },
        { id: 30, waiverOrder: 3, faabBudget: null },
        { id: 40, waiverOrder: 4, faabBudget: null },
      ];

      sortClaims(claims, 'standard', teams);

      expect(claims.map((c) => c.teamId)).toEqual([10, 20, 30, 40]);
    });
  });

  // ── FAAB waiver tests ─────────────────────────────────────────────────────

  describe('FAAB waivers', () => {
    it('higher FAAB bid wins', () => {
      const claims = [
        makeClaim({ id: 1, teamId: 10, playerId: 100, faabBid: 5 }),
        makeClaim({ id: 2, teamId: 20, playerId: 100, faabBid: 15 }),
      ];
      const teams: TeamSettings[] = [
        { id: 10, waiverOrder: 1, faabBudget: 100 },
        { id: 20, waiverOrder: 2, faabBudget: 100 },
      ];

      sortClaims(claims, 'faab', teams);

      expect(claims[0].teamId).toBe(20);
      expect(claims[1].teamId).toBe(10);
    });

    it('equal FAAB bid falls back to lower waiverOrder', () => {
      const claims = [
        makeClaim({ id: 1, teamId: 10, playerId: 100, faabBid: 10 }),
        makeClaim({ id: 2, teamId: 20, playerId: 100, faabBid: 10 }),
      ];
      const teams: TeamSettings[] = [
        { id: 10, waiverOrder: 3, faabBudget: 100 },
        { id: 20, waiverOrder: 1, faabBudget: 100 },
      ];

      sortClaims(claims, 'faab', teams);

      expect(claims[0].teamId).toBe(20);
      expect(claims[1].teamId).toBe(10);
    });

    it('equal FAAB bid and equal waiverOrder falls back to claim ID', () => {
      const claims = [
        makeClaim({ id: 5, teamId: 20, playerId: 100, faabBid: 10 }),
        makeClaim({ id: 3, teamId: 10, playerId: 100, faabBid: 10 }),
      ];
      const teams: TeamSettings[] = [
        { id: 10, waiverOrder: 2, faabBudget: 100 },
        { id: 20, waiverOrder: 2, faabBudget: 100 },
      ];

      sortClaims(claims, 'faab', teams);

      expect(claims[0].teamId).toBe(10);
      expect(claims[1].teamId).toBe(20);
    });

    it('null FAAB bid treated as $0', () => {
      const claims = [
        makeClaim({ id: 1, teamId: 10, playerId: 100, faabBid: null }),
        makeClaim({ id: 2, teamId: 20, playerId: 100, faabBid: 5 }),
      ];
      const teams: TeamSettings[] = [
        { id: 10, waiverOrder: 1, faabBudget: 100 },
        { id: 20, waiverOrder: 2, faabBudget: 100 },
      ];

      sortClaims(claims, 'faab', teams);

      expect(claims[0].teamId).toBe(20);
      expect(claims[1].teamId).toBe(10);
    });
  });
});
