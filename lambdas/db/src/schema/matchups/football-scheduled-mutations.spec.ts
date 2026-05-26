/**
 * Tests for football scheduled (system) mutations:
 *   - refreshFootballWeeklySeasonStats
 *   - refreshFootballCareerStats
 *
 * Covers:
 *   - UNAUTHENTICATED guard: unauthenticated requests are rejected
 *   - System / admin requests are allowed
 *   - Season-window no-op guard for refreshFootballWeeklySeasonStats
 *   - Stub return values pending LS-253
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/rollbar', () => ({
  getRollbarConfigFromEnv: jest.fn(),
  initRollbar: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
  withRollbar: jest.fn((fn) => fn),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  createNotificationService: jest.fn(),
}));

jest.mock('@legacy-sports/utils', () => ({
  ...jest.requireActual('@legacy-sports/utils'),
  isNflSeason: jest.fn(),
}));

jest.mock('@legacy-sports/db-client', () => ({
  createDatabaseService: jest.fn(),
  PublicSchema: {
    leagueMembers: {
      leagueId: 'league_members.league_id',
      userId: 'league_members.user_id',
      permissionLevel: 'league_members.permission_level',
    },
  },
}));

import { isNflSeason } from '@legacy-sports/utils';

import {
  resolveRefreshFootballCareerStats,
  resolveRefreshFootballWeeklySeasonStats,
} from './football-scheduled-mutations';
import { type Context } from '../builder';

const mockIsNflSeason = isNflSeason as jest.MockedFunction<typeof isNflSeason>;

function makeContext(
  partial: Pick<Context, 'isSystemRequest' | 'user'>,
): Context {
  return partial as unknown as Context;
}

describe('Football Scheduled Mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Authorization guard ──────────────────────────────────────────────────
  // Both mutations call assertAuthorized(context, null). The tests below
  // verify unauthenticated callers receive UNAUTHENTICATED, while system
  // requests and admin users pass through.

  describe('authorization (shared by both mutations)', () => {
    it('rejects unauthenticated requests with UNAUTHENTICATED error', async () => {
      const context = makeContext({ isSystemRequest: false, user: null });

      await expect(
        resolveRefreshFootballWeeklySeasonStats(context),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });

      await expect(
        resolveRefreshFootballCareerStats(context),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('rejects non-admin authenticated user with no leagueId (all-league scope)', async () => {
      const context = makeContext({
        isSystemRequest: false,
        user: { id: 5, isAdmin: false },
      });

      await expect(
        resolveRefreshFootballWeeklySeasonStats(context),
      ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });

      await expect(
        resolveRefreshFootballCareerStats(context),
      ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
    });
  });

  // ── Season-window guard (refreshFootballWeeklySeasonStats) ───────────────
  // The weekly mutation is a no-op outside Sept 1 – Feb 15 to avoid wasting
  // PFR requests during the off-season. The guard uses isNflSeason() from
  // @legacy-sports/utils.

  describe('resolveRefreshFootballWeeklySeasonStats', () => {
    const systemContext = makeContext({ isSystemRequest: true, user: null });

    it('returns triggered:false with season-window reason when outside the NFL season', async () => {
      mockIsNflSeason.mockReturnValue(false);

      const result =
        await resolveRefreshFootballWeeklySeasonStats(systemContext);

      expect(result.triggered).toBe(false);
      expect(result.reason).toBe('Outside NFL season window (Sept 1 – Feb 15)');
      expect(result.errors).toHaveLength(0);
    });

    it('returns triggered:false with LS-253 reason when inside the NFL season', async () => {
      mockIsNflSeason.mockReturnValue(true);

      const result =
        await resolveRefreshFootballWeeklySeasonStats(systemContext);

      expect(result.triggered).toBe(false);
      expect(result.reason).toBe(
        'Football stats handler not yet implemented (LS-253)',
      );
      expect(result.errors).toHaveLength(0);
    });

    it('allows admin users through the auth gate', async () => {
      mockIsNflSeason.mockReturnValue(true);
      const adminContext = makeContext({
        isSystemRequest: false,
        user: { id: 1, isAdmin: true },
      });

      const result =
        await resolveRefreshFootballWeeklySeasonStats(adminContext);

      expect(result.triggered).toBe(false);
    });
  });

  // ── refreshFootballCareerStats (no season guard) ─────────────────────────
  // March 1 is definitionally post-Super Bowl, so no lambda-side season check
  // is needed. The mutation is always a stub pending LS-253.

  describe('resolveRefreshFootballCareerStats', () => {
    const systemContext = makeContext({ isSystemRequest: true, user: null });

    it('returns triggered:false with LS-253 reason pending implementation', async () => {
      const result = await resolveRefreshFootballCareerStats(systemContext);

      expect(result.triggered).toBe(false);
      expect(result.reason).toBe(
        'Football career stats handler not yet implemented (LS-253)',
      );
      expect(result.errors).toHaveLength(0);
    });

    it('allows admin users through the auth gate', async () => {
      const adminContext = makeContext({
        isSystemRequest: false,
        user: { id: 1, isAdmin: true },
      });

      const result = await resolveRefreshFootballCareerStats(adminContext);

      expect(result.triggered).toBe(false);
    });
  });
});
