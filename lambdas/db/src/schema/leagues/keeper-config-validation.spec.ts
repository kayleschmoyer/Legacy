/**
 * Unit tests for roster-continuity / keeper-settings validation (LS-8671).
 *
 * Covers the validation matrix for `rosterContinuity` + `keeperSettings` on
 * the `createLeagueAndTeams` mutation resolver:
 * - keeperSettings rejected unless rosterContinuity = 'keeper'
 * - keeperSettings required when rosterContinuity = 'keeper'
 * - keeperCount bounded to 1–10
 * - 'auction-budget' cost model requires selectionMethod 'auction'
 * - 'round-penalty' cost model requires selectionMethod 'standard'
 * - maxConsecutiveKeeps must be >= 1 when set (null/omitted = unlimited)
 */

import { GraphQLError } from 'graphql';
import {
  type KeeperSettingsInputShape,
  validateKeeperConfig,
} from './mutations';

const validRoundPenalty: KeeperSettingsInputShape = {
  keeperCount: 3,
  costModel: 'round-penalty',
  maxConsecutiveKeeps: null,
  rookieExempt: false,
};

const validAuctionBudget: KeeperSettingsInputShape = {
  keeperCount: 3,
  costModel: 'auction-budget',
  maxConsecutiveKeeps: null,
  rookieExempt: false,
};

describe('validateKeeperConfig (LS-8671)', () => {
  describe('non-keeper continuity', () => {
    it('passes for redraft with no keeper settings', () => {
      expect(() =>
        validateKeeperConfig('redraft', null, 'standard'),
      ).not.toThrow();
    });

    it('passes for dynasty with no keeper settings', () => {
      expect(() =>
        validateKeeperConfig('dynasty', undefined, 'standard'),
      ).not.toThrow();
    });

    it('passes for omitted continuity (defaults to redraft) with no keeper settings', () => {
      expect(() =>
        validateKeeperConfig(undefined, null, 'auction'),
      ).not.toThrow();
    });

    it('rejects keeper settings when continuity is redraft', () => {
      expect(() =>
        validateKeeperConfig('redraft', validRoundPenalty, 'standard'),
      ).toThrow(GraphQLError);
      expect(() =>
        validateKeeperConfig('redraft', validRoundPenalty, 'standard'),
      ).toThrow(
        "Keeper settings are only allowed when rosterContinuity is 'keeper' (got 'redraft')",
      );
    });

    it('rejects keeper settings when continuity is dynasty', () => {
      expect(() =>
        validateKeeperConfig('dynasty', validRoundPenalty, 'standard'),
      ).toThrow(
        "Keeper settings are only allowed when rosterContinuity is 'keeper' (got 'dynasty')",
      );
    });

    it('rejects keeper settings when continuity is omitted (defaults to redraft)', () => {
      expect(() =>
        validateKeeperConfig(undefined, validRoundPenalty, 'standard'),
      ).toThrow(
        "Keeper settings are only allowed when rosterContinuity is 'keeper' (got 'redraft')",
      );
    });
  });

  describe('keeper continuity — presence', () => {
    it('rejects keeper continuity without keeper settings', () => {
      expect(() => validateKeeperConfig('keeper', null, 'standard')).toThrow(
        "Keeper settings are required when rosterContinuity is 'keeper'",
      );
      expect(() =>
        validateKeeperConfig('keeper', undefined, 'standard'),
      ).toThrow(GraphQLError);
    });

    it('passes for a valid round-penalty config on a standard draft', () => {
      expect(() =>
        validateKeeperConfig('keeper', validRoundPenalty, 'standard'),
      ).not.toThrow();
    });

    it('passes for a valid auction-budget config on an auction draft', () => {
      expect(() =>
        validateKeeperConfig('keeper', validAuctionBudget, 'auction'),
      ).not.toThrow();
    });
  });

  describe('keeperCount bounds', () => {
    it.each([1, 5, 10])('passes for keeperCount %i', (keeperCount) => {
      expect(() =>
        validateKeeperConfig(
          'keeper',
          { ...validRoundPenalty, keeperCount },
          'standard',
        ),
      ).not.toThrow();
    });

    it.each([0, -1, 11, 100])('rejects keeperCount %i', (keeperCount) => {
      expect(() =>
        validateKeeperConfig(
          'keeper',
          { ...validRoundPenalty, keeperCount },
          'standard',
        ),
      ).toThrow('Keeper count must be between 1 and 10');
    });
  });

  describe('costModel value validation', () => {
    it.each(['keep-forever', 'ROUND-PENALTY', ''])(
      'rejects unknown costModel "%s"',
      (costModel) => {
        expect(() =>
          validateKeeperConfig(
            'keeper',
            { ...validRoundPenalty, costModel },
            'standard',
          ),
        ).toThrow(
          `Invalid keeper costModel: "${costModel}". Allowed values: round-penalty, auction-budget.`,
        );
      },
    );

    it('returns the validated cost model for keeper leagues', () => {
      expect(
        validateKeeperConfig('keeper', validRoundPenalty, 'standard'),
      ).toBe('round-penalty');
      expect(
        validateKeeperConfig('keeper', validAuctionBudget, 'auction'),
      ).toBe('auction-budget');
    });

    it('returns null for non-keeper leagues', () => {
      expect(validateKeeperConfig('redraft', null, 'standard')).toBeNull();
      expect(validateKeeperConfig(undefined, undefined, 'auction')).toBeNull();
    });
  });

  describe('costModel × selectionMethod combos', () => {
    it("rejects 'auction-budget' on a standard draft", () => {
      expect(() =>
        validateKeeperConfig('keeper', validAuctionBudget, 'standard'),
      ).toThrow(
        "The 'auction-budget' keeper cost model requires selectionMethod 'auction'",
      );
    });

    it("rejects 'auction-budget' on a random draft", () => {
      expect(() =>
        validateKeeperConfig('keeper', validAuctionBudget, 'random'),
      ).toThrow(GraphQLError);
    });

    it("rejects 'round-penalty' on an auction draft", () => {
      expect(() =>
        validateKeeperConfig('keeper', validRoundPenalty, 'auction'),
      ).toThrow(
        "The 'round-penalty' keeper cost model requires selectionMethod 'standard'",
      );
    });

    it("rejects 'round-penalty' on a random draft", () => {
      expect(() =>
        validateKeeperConfig('keeper', validRoundPenalty, 'random'),
      ).toThrow(GraphQLError);
    });
  });

  describe('maxConsecutiveKeeps', () => {
    it('passes when null (unlimited)', () => {
      expect(() =>
        validateKeeperConfig(
          'keeper',
          { ...validRoundPenalty, maxConsecutiveKeeps: null },
          'standard',
        ),
      ).not.toThrow();
    });

    it('passes when omitted (unlimited)', () => {
      const { maxConsecutiveKeeps: _omitted, ...withoutMax } =
        validRoundPenalty;
      expect(() =>
        validateKeeperConfig('keeper', withoutMax, 'standard'),
      ).not.toThrow();
    });

    it('passes for the minimum valid value (1)', () => {
      expect(() =>
        validateKeeperConfig(
          'keeper',
          { ...validRoundPenalty, maxConsecutiveKeeps: 1 },
          'standard',
        ),
      ).not.toThrow();
    });

    it.each([0, -1])('rejects %i', (maxConsecutiveKeeps) => {
      expect(() =>
        validateKeeperConfig(
          'keeper',
          { ...validRoundPenalty, maxConsecutiveKeeps },
          'standard',
        ),
      ).toThrow(
        'Max consecutive keeps must be at least 1 when set (omit or null for unlimited)',
      );
    });
  });

  describe('rookieExempt', () => {
    it.each([true, false])(
      'has no validation impact (rookieExempt: %s)',
      (rookieExempt) => {
        expect(() =>
          validateKeeperConfig(
            'keeper',
            { ...validRoundPenalty, rookieExempt },
            'standard',
          ),
        ).not.toThrow();
      },
    );
  });
});
