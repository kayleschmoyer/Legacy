/**
 * Unit tests for the draft-slot-trading auction validation (LS-8675).
 *
 * `allowDraftSlotTrading: true` is rejected for auction leagues — auction
 * drafts assign players by bidding, so there are no draft slots to trade.
 * Null/undefined/false values and non-auction selection methods must pass
 * through silently.
 */

import { GraphQLError } from 'graphql';
import { validateAllowDraftSlotTrading } from './mutations';

describe('validateAllowDraftSlotTrading (LS-8675)', () => {
  it('passes for null (DB default applies)', () => {
    expect(() => validateAllowDraftSlotTrading(null, 'standard')).not.toThrow();
  });

  it('passes for undefined (DB default applies)', () => {
    expect(() =>
      validateAllowDraftSlotTrading(undefined, 'standard'),
    ).not.toThrow();
  });

  it('passes when enabled for a standard draft', () => {
    expect(() => validateAllowDraftSlotTrading(true, 'standard')).not.toThrow();
  });

  it('passes when enabled for a random draft', () => {
    expect(() => validateAllowDraftSlotTrading(true, 'random')).not.toThrow();
  });

  it('passes when explicitly disabled for an auction league', () => {
    expect(() => validateAllowDraftSlotTrading(false, 'auction')).not.toThrow();
  });

  it('passes when omitted for an auction league', () => {
    expect(() =>
      validateAllowDraftSlotTrading(undefined, 'auction'),
    ).not.toThrow();
    expect(() => validateAllowDraftSlotTrading(null, 'auction')).not.toThrow();
  });

  it('throws when enabled for an auction league', () => {
    expect(() => validateAllowDraftSlotTrading(true, 'auction')).toThrow(
      GraphQLError,
    );
    expect(() => validateAllowDraftSlotTrading(true, 'auction')).toThrow(
      'Draft slot trading is not available for auction leagues',
    );
  });
});
