import { renderHook, waitFor } from '@testing-library/react-native';

// ── Module under test ─────────────────────────────────────────────────────────

import { useStripePrices } from './useStripePrices';

// ── Mocks (hoisted before imports) ───────────────────────────────────────────

const mockCaptureWarning = jest.fn();
jest.mock('@legacy-sports/rollbar/native', () => ({
  captureWarning: (...args: unknown[]): unknown => mockCaptureWarning(...args),
}));

const mockUseGetStripePricesQuery = jest.fn();
jest.mock('../../api/db/graphql.generated', () => ({
  useGetStripePricesQuery: (...args: unknown[]): unknown =>
    mockUseGetStripePricesQuery(...args),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useStripePrices', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('success — live prices returned', () => {
    beforeEach(() => {
      mockUseGetStripePricesQuery.mockReturnValue({
        data: {
          stripePrices: {
            monthlyPriceCents: 999,
            annualTotalCents: 7999,
            monthlyPriceId: 'price_monthly_live',
            annualPriceId: 'price_annual_live',
          },
        },
        loading: false,
        error: undefined,
      });
    });

    it('returns derived display prices', () => {
      const { result } = renderHook(() => useStripePrices());
      expect(result.current.monthlyPriceDisplay).toBe('$9.99');
      expect(result.current.annualPriceDisplay).toBe('$79.99');
    });

    it('returns price IDs from the query response', () => {
      const { result } = renderHook(() => useStripePrices());
      expect(result.current.monthlyPriceId).toBe('price_monthly_live');
      expect(result.current.annualPriceId).toBe('price_annual_live');
    });

    it('returns loading: false', () => {
      const { result } = renderHook(() => useStripePrices());
      expect(result.current.loading).toBe(false);
    });

    it('does not call captureWarning', async () => {
      renderHook(() => useStripePrices());
      // Allow effects to flush
      await waitFor(() => expect(mockCaptureWarning).not.toHaveBeenCalled());
    });
  });

  describe('loading — query in flight', () => {
    beforeEach(() => {
      mockUseGetStripePricesQuery.mockReturnValue({
        data: undefined,
        loading: true,
        error: undefined,
      });
    });

    it('returns hardcoded fallback display prices', () => {
      const { result } = renderHook(() => useStripePrices());
      expect(result.current.monthlyPriceDisplay).toBe('$4.99');
      expect(result.current.annualPriceDisplay).toBe('$39.99');
    });

    it('returns null price IDs (checkout disabled until live data arrives)', () => {
      const { result } = renderHook(() => useStripePrices());
      expect(result.current.monthlyPriceId).toBeNull();
      expect(result.current.annualPriceId).toBeNull();
    });

    it('returns loading: true', () => {
      const { result } = renderHook(() => useStripePrices());
      expect(result.current.loading).toBe(true);
    });
  });

  describe('error — query failed', () => {
    beforeEach(() => {
      mockUseGetStripePricesQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: { message: 'Network error' },
      });
    });

    it('returns hardcoded fallback display prices', () => {
      const { result } = renderHook(() => useStripePrices());
      expect(result.current.monthlyPriceDisplay).toBe('$4.99');
      expect(result.current.annualPriceDisplay).toBe('$39.99');
    });

    it('returns null price IDs', () => {
      const { result } = renderHook(() => useStripePrices());
      expect(result.current.monthlyPriceId).toBeNull();
      expect(result.current.annualPriceId).toBeNull();
    });

    it('calls captureWarning exactly once with the error message', async () => {
      renderHook(() => useStripePrices());
      await waitFor(() => {
        expect(mockCaptureWarning).toHaveBeenCalledTimes(1);
        const [err, meta] = mockCaptureWarning.mock.calls[0] as [
          Error,
          { context: string; errorMessage: string },
        ];
        expect(err.message).toContain('Stripe prices query failed');
        expect(meta.context).toBe('useStripePrices');
        expect(meta.errorMessage).toBe('Network error');
      });
    });

    it('does not call captureWarning a second time on re-render', async () => {
      const { rerender } = renderHook(() => useStripePrices());
      await waitFor(() => expect(mockCaptureWarning).toHaveBeenCalledTimes(1));
      rerender({});
      // Still only called once
      expect(mockCaptureWarning).toHaveBeenCalledTimes(1);
    });
  });

  describe('error with cached data — background refetch failed', () => {
    // With cache-and-network, a background refetch error can coexist with
    // valid cached stripePrices. The hook should return live cached values
    // and must NOT fire a misleading "using hardcoded fallback" warning.
    beforeEach(() => {
      mockUseGetStripePricesQuery.mockReturnValue({
        data: {
          stripePrices: {
            monthlyPriceCents: 999,
            annualTotalCents: 7999,
            monthlyPriceId: 'price_monthly_cached',
            annualPriceId: 'price_annual_cached',
          },
        },
        loading: false,
        error: { message: 'Refetch failed' },
      });
    });

    it('returns cached live prices, not fallback', () => {
      const { result } = renderHook(() => useStripePrices());
      expect(result.current.monthlyPriceDisplay).toBe('$9.99');
      expect(result.current.annualPriceDisplay).toBe('$79.99');
    });

    it('returns cached price IDs', () => {
      const { result } = renderHook(() => useStripePrices());
      expect(result.current.monthlyPriceId).toBe('price_monthly_cached');
      expect(result.current.annualPriceId).toBe('price_annual_cached');
    });

    it('does not call captureWarning', async () => {
      renderHook(() => useStripePrices());
      await waitFor(() => expect(mockCaptureWarning).not.toHaveBeenCalled());
    });
  });

  describe('stripePrices: null — backend returned null', () => {
    beforeEach(() => {
      mockUseGetStripePricesQuery.mockReturnValue({
        data: { stripePrices: null },
        loading: false,
        error: undefined,
      });
    });

    it('returns hardcoded fallback display prices', () => {
      const { result } = renderHook(() => useStripePrices());
      expect(result.current.monthlyPriceDisplay).toBe('$4.99');
      expect(result.current.annualPriceDisplay).toBe('$39.99');
    });

    it('returns null price IDs', () => {
      const { result } = renderHook(() => useStripePrices());
      expect(result.current.monthlyPriceId).toBeNull();
      expect(result.current.annualPriceId).toBeNull();
    });

    it('calls captureWarning with the null-prices message', async () => {
      renderHook(() => useStripePrices());
      await waitFor(() => {
        expect(mockCaptureWarning).toHaveBeenCalledTimes(1);
        const [err, meta] = mockCaptureWarning.mock.calls[0] as [
          Error,
          { context: string },
        ];
        expect(err.message).toContain('Stripe prices query returned null');
        expect(meta.context).toBe('useStripePrices');
      });
    });
  });
});
