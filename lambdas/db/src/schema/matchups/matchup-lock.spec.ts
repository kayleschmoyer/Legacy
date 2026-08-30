/**
 * isMatchupLocked — LS-6370
 *
 * The roster-lock check on updateMatchupPlayerPosition and
 * swapMatchupPlayerPositions previously gated only on `matchup.status !==
 * 'scheduled'`. Status is flipped by a nightly cron and can lag behind the
 * matchup's actual configured lock instant, leaving a window where a
 * matchup that has already effectively locked is still editable.
 *
 * isMatchupLocked also locks the moment the league-configured lock instant
 * (via `computeRosterLockTime` — `matchup.startTime` adjusted by the
 * league's `rosterLockTiming`/roster-lock rules, LS-6368) has passed,
 * independent of status. That branch requires a database lookup (the
 * league's `rosterLockTiming` and any custom lock rules) and is covered by
 * the integration specs in swap-matchup-player-positions.db.spec.ts and
 * update-matchup-player-position.db.spec.ts instead — here we only cover
 * the pure, DB-independent status short-circuit.
 */
import { isMatchupLocked } from './mutations';

describe('isMatchupLocked (LS-6370)', () => {
  it('is locked once status has moved off scheduled, regardless of startTime — no DB lookup needed', async () => {
    // `db` is never touched on this branch: isMatchupLocked returns before
    // reaching any query once status !== 'scheduled'.
    const db = undefined as never;
    await expect(
      isMatchupLocked(db, {
        status: 'in_progress',
        startTime: null,
        leagueId: 1,
      }),
    ).resolves.toBe(true);
    await expect(
      isMatchupLocked(db, {
        status: 'completed',
        startTime: null,
        leagueId: 1,
      }),
    ).resolves.toBe(true);
  });
});
