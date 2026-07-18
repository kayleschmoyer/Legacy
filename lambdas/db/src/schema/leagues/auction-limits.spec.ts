/**
 * Unit tests for auction budget / minimum bid upper-bound validation (LS-6074 / CLB-027).
 *
 * Covers the boundary conditions for `auctionBudget` and `auctionMinBid` on the
 * league mutation resolvers: values below 1 or above 10000 must be rejected;
 * null/undefined and valid values must pass through silently.
 */

import { GraphQLError } from 'graphql';
import { validateAuctionBudget, validateAuctionMinBid } from './mutations';

describe('validateAuctionBudget (LS-6074)', () => {
  it('passes for null (DB default applies)', () => {
    expect(() => validateAuctionBudget(null)).not.toThrow();
  });

  it('passes for undefined (DB default applies)', () => {
    expect(() => validateAuctionBudget(undefined)).not.toThrow();
  });

  it('passes for the minimum valid value (1)', () => {
    expect(() => validateAuctionBudget(1)).not.toThrow();
  });

  it('passes for the default value (260)', () => {
    expect(() => validateAuctionBudget(260)).not.toThrow();
  });

  it('passes for the maximum valid value (10000)', () => {
    expect(() => validateAuctionBudget(10000)).not.toThrow();
  });

  it('throws for zero', () => {
    expect(() => validateAuctionBudget(0)).toThrow(GraphQLError);
  });

  it('throws for a value above the maximum (10001)', () => {
    expect(() => validateAuctionBudget(10001)).toThrow(GraphQLError);
    expect(() => validateAuctionBudget(10001)).toThrow(
      'Auction budget must be between 1 and 10000',
    );
  });

  it('throws for the reported overflow value (99999999999)', () => {
    expect(() => validateAuctionBudget(99999999999)).toThrow(GraphQLError);
  });
});

describe('validateAuctionMinBid (LS-6074)', () => {
  it('passes for null (DB default applies)', () => {
    expect(() => validateAuctionMinBid(null)).not.toThrow();
  });

  it('passes for undefined (DB default applies)', () => {
    expect(() => validateAuctionMinBid(undefined)).not.toThrow();
  });

  it('passes for the minimum valid value (1)', () => {
    expect(() => validateAuctionMinBid(1)).not.toThrow();
  });

  it('passes for the maximum valid value (10000)', () => {
    expect(() => validateAuctionMinBid(10000)).not.toThrow();
  });

  it('throws for zero', () => {
    expect(() => validateAuctionMinBid(0)).toThrow(GraphQLError);
  });

  it('throws for a value above the maximum (10001)', () => {
    expect(() => validateAuctionMinBid(10001)).toThrow(GraphQLError);
    expect(() => validateAuctionMinBid(10001)).toThrow(
      'Minimum bid must be between 1 and 10000',
    );
  });

  it('throws for the reported overflow value (99999999999)', () => {
    expect(() => validateAuctionMinBid(99999999999)).toThrow(GraphQLError);
  });
});
