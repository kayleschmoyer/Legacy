import { renderHook } from '@testing-library/react';
import { useStripePrices } from './useStripePrices';

jest.mock('../api/db/graphql.generated', () => ({
  useGetStripePricesQuery: jest.fn(),
}));

jest.mock('@legacy-sports/rollbar/web', () => ({
  captureWarning: jest.fn(),
}));

const { useGetStripePricesQuery } = jest.requireMock(
  '../api/db/graphql.generated',
) as unknown as { useGetStripePricesQuery: jest.Mock };

const { captureWarning } = jest.requireMock(
  '@legacy-sports/rollbar/web',
) as unknown as { captureWarning: jest.Mock };

describe('useStripePrices', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns live Stripe prices when query succeeds', () => {
    useGetStripePricesQuery.mockReturnValue({
      data: {
        stripePrices: {
          monthlyPriceCents: 599,
          annualTotalCents: 4999,
          monthlyPriceId: 'price_monthly123',
          annualPriceId: 'price_annual456',
        },
      },
      loading: false,
      error: undefined,
    });

    const { result } = renderHook(() => useStripePrices());

    expect(result.current.monthlyPrice).toBe(5.99);
    expect(result.current.annualTotal).toBe(49.99);
    expect(result.current.monthlyPriceDisplay).toBe('$5.99');
    expect(result.current.annualPriceDisplay).toBe('$49.99');
    expect(result.current.loading).toBe(false);
    expect(result.current.pricesFailed).toBe(false);
    expect(result.current.monthlyPriceId).toBe('price_monthly123');
    expect(result.current.annualPriceId).toBe('price_annual456');
  });

  it('returns hardcoded fallbacks when query returns null', () => {
    useGetStripePricesQuery.mockReturnValue({
      data: { stripePrices: null },
      loading: false,
      error: undefined,
    });

    const { result } = renderHook(() => useStripePrices());

    expect(result.current.monthlyPrice).toBe(4.99);
    expect(result.current.annualTotal).toBe(39.99);
    expect(result.current.monthlyPriceDisplay).toBe('$4.99');
    expect(result.current.annualPriceDisplay).toBe('$39.99');
    expect(result.current.annualSavingsPct).toBe('33%');
    expect(result.current.pricesFailed).toBe(true);
    expect(result.current.monthlyPriceId).toBeNull();
    expect(result.current.annualPriceId).toBeNull();
  });

  it('returns hardcoded fallbacks while loading', () => {
    useGetStripePricesQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    });

    const { result } = renderHook(() => useStripePrices());

    expect(result.current.monthlyPrice).toBe(4.99);
    expect(result.current.annualTotal).toBe(39.99);
    expect(result.current.loading).toBe(true);
    expect(result.current.pricesFailed).toBe(false);
  });

  it('returns fallbacks and warns on error', () => {
    const gqlError = { message: 'Network error' };
    useGetStripePricesQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: gqlError,
    });

    const { result } = renderHook(() => useStripePrices());

    expect(result.current.monthlyPrice).toBe(4.99);
    expect(result.current.annualTotal).toBe(39.99);
    expect(result.current.pricesFailed).toBe(true);
    expect(captureWarning).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'useStripePrices' }),
    );
  });

  it('warns when query completes but returns null prices', () => {
    useGetStripePricesQuery.mockReturnValue({
      data: { stripePrices: null },
      loading: false,
      error: undefined,
    });

    renderHook(() => useStripePrices());

    expect(captureWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('returned null'),
      }),
      expect.objectContaining({ context: 'useStripePrices' }),
    );
  });

  it('computes annualMonthlyEquivalent correctly from live prices', () => {
    useGetStripePricesQuery.mockReturnValue({
      data: {
        stripePrices: {
          monthlyPriceCents: 999,
          annualTotalCents: 8388,
          monthlyPriceId: 'price_monthly789',
          annualPriceId: 'price_annual012',
        },
      },
      loading: false,
      error: undefined,
    });

    const { result } = renderHook(() => useStripePrices());

    // 8388 / 12 / 100 = 6.99
    expect(result.current.annualMonthlyPrice).toBe(8388 / 12 / 100);
    expect(result.current.annualMonthlyEquivalent).toBe('$6.99');
  });
});
