/**
 * Football-specific scheduled (system) mutations triggered by EventBridge.
 *
 * Two jobs:
 *  - refreshFootballWeeklySeasonStats: fires Tuesdays year-round; no-ops outside the
 *    NFL season window (Sept 1 – Feb 15). Intended to pull the latest PFR
 *    season-totals for players on active football leagues.
 *  - refreshFootballCareerStats: fires once on March 1 (naturally post-Super Bowl).
 *    Refreshes PFR career stats for all football players after the season ends.
 *
 * Both mutations are system-only (require x-system-api-key or admin access).
 * The underlying stats-lambda football handlers are implemented in LS-253;
 * until that ticket ships these mutations return triggered:false with a clear
 * log line so off-season invocations are still observable in CloudWatch.
 */

import { LOGGER } from '@legacy-sports/logging';
import { isNflSeason } from '@legacy-sports/utils';

import { assertAuthorized } from './system-auth';
import { type Context } from '../builder';
import { builder } from '../builder';

// ── Shared result type ────────────────────────────────────────────────────────

export interface FootballStatsRefreshResultShape {
  triggered: boolean;
  reason: string;
  errors: string[];
}

const FootballStatsRefreshResult =
  builder.objectRef<FootballStatsRefreshResultShape>(
    'FootballStatsRefreshResult',
  );

builder.objectType(FootballStatsRefreshResult, {
  description:
    'Result of a football stats refresh job triggered by EventBridge',
  fields: (t) => ({
    triggered: t.exposeBoolean('triggered', {
      description:
        'Whether the stats refresh was actually triggered (false when out of season or handler not yet available)',
    }),
    reason: t.exposeString('reason', {
      description: 'Human-readable explanation of the outcome',
    }),
    errors: t.exposeStringList('errors'),
  }),
});

// ── Resolver: refreshFootballWeeklySeasonStats ────────────────────────────────

export async function resolveRefreshFootballWeeklySeasonStats(
  context: Context,
): Promise<FootballStatsRefreshResultShape> {
  await assertAuthorized(context, null);

  if (!isNflSeason()) {
    LOGGER.info(
      '[refreshFootballWeeklySeasonStats] Outside NFL season window — skipping (no-op)',
    );
    return {
      triggered: false,
      reason: 'Outside NFL season window (Sept 1 – Feb 15)',
      errors: [],
    };
  }

  LOGGER.info(
    '[refreshFootballWeeklySeasonStats] NFL season active — stats refresh pending LS-253 implementation',
  );

  // TODO(LS-253): enqueue PFR season-totals refresh via SQS to stats-lambda
  // when the football handler is implemented.
  return {
    triggered: false,
    reason: 'Football stats handler not yet implemented (LS-253)',
    errors: [],
  };
}

// ── Resolver: refreshFootballCareerStats ─────────────────────────────────────

export async function resolveRefreshFootballCareerStats(
  context: Context,
): Promise<FootballStatsRefreshResultShape> {
  await assertAuthorized(context, null);

  LOGGER.info(
    '[refreshFootballCareerStats] Post-season career stats refresh triggered — pending LS-253 implementation',
  );

  // TODO(LS-253): enqueue PFR career stats refresh via SQS to stats-lambda
  // when the football handler is implemented.
  return {
    triggered: false,
    reason: 'Football career stats handler not yet implemented (LS-253)',
    errors: [],
  };
}

// ── Mutation: refreshFootballWeeklySeasonStats ────────────────────────────────
// Triggered every Tuesday at 2am EST (07:00 UTC) by EventBridge.
// No-ops cleanly outside the NFL season window so the rule can stay enabled
// year-round without wasting invocations.

builder.mutationField('refreshFootballWeeklySeasonStats', (t) =>
  t.field({
    type: FootballStatsRefreshResult,
    description:
      'Refresh PFR season-totals for players on active football leagues. ' +
      'No-ops outside the NFL season window (Sept 1 – Feb 15). ' +
      'Triggered weekly by EventBridge; system-only.',
    resolve: (_parent, _args, context) =>
      resolveRefreshFootballWeeklySeasonStats(context),
  }),
);

// ── Mutation: refreshFootballCareerStats ─────────────────────────────────────
// Triggered once per year on March 1 at 06:00 UTC by EventBridge.
// March 1 is always post-Super Bowl, so no season-window check is needed.

builder.mutationField('refreshFootballCareerStats', (t) =>
  t.field({
    type: FootballStatsRefreshResult,
    description:
      'Refresh PFR career stats for all football players after the NFL season ends. ' +
      'Triggered once per year on March 1 by EventBridge; system-only.',
    resolve: (_parent, _args, context) =>
      resolveRefreshFootballCareerStats(context),
  }),
);
