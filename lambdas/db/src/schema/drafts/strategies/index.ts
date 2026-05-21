/**
 * Sport-scoped auto-pick strategy factory (LS-4665 / ADR 0011 §5).
 *
 * Callers ask for `selectStrategy(league.sport)` and dispatch to the matching
 * strategy. Default callers (pre-sport_kind-enum) pass `'baseball'` so behavior
 * stays bit-identical to the pre-LS-4665 path.
 */

import { baseballStrategy } from './baseball';
import { footballStrategy } from './football';
import type { AutoPickStrategy, SportKind } from './types';

export function selectStrategy(sport: SportKind): AutoPickStrategy {
  switch (sport) {
    case 'football':
      return footballStrategy;
    case 'baseball':
      return baseballStrategy;
  }
}

export { baseballStrategy } from './baseball';
export { footballStrategy } from './football';
export type { AutoPickScore, AutoPickStrategy, SportKind } from './types';
