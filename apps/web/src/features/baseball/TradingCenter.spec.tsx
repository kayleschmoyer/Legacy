/**
 * Contract tests for the web TradingCenter wrapper (LS-7513 — TC-019).
 *
 * The web wrapper is the second of three surfaces that compose TradingCenter.
 * Its responsibilities are:
 *   1. Forward all caller props (leagueId, userTeamId, isCommissioner, …) to
 *      the shared TradingCenter component unchanged.
 *   2. Wire real-time refresh by subscribing to the page-level
 *      LeagueWebSocketContext via useLeagueWebSocket, and connecting the
 *      onTradeOffer / onRosterUpdate callbacks to the shared component's
 *      onSubscribeRefresh mechanism.
 *   3. Never expose onSubscribeRefresh in its own public API — the caller
 *      should not need to know how real-time is wired internally.
 *
 * Contrast with the other two surfaces:
 *   - Native TradeCenterPage: creates its own WebSocket connection using
 *     useWebSocket + a keychain JWT and passes onSubscribeRefresh explicitly.
 *   - Trades tab (league-detail-v2): inherits the page-level context without
 *     any explicit real-time wiring in the tab component itself.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
import React from 'react';
import { render } from '@testing-library/react';

import { TradingCenter } from './TradingCenter';

// ── Mocks ─────────────────────────────────────────────────────────────────────

let capturedWsOpts: {
  onTradeOffer?: () => void;
  onRosterUpdate?: () => void;
} | null = null;

jest.mock('../../hooks/useLeagueWebSocket', () => ({
  useLeagueWebSocket: (opts: any) => {
    capturedWsOpts = opts;
    return { connected: false };
  },
}));

let capturedSharedProps: Record<string, any> | null = null;

jest.mock('@legacy-sports/shared-components/leagues', () => ({
  TradingCenter: (props: any) => {
    capturedSharedProps = props;
    return <div data-testid="shared-trading-center" />;
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedWsOpts = null;
  capturedSharedProps = null;
});

describe('TradingCenter web wrapper — prop forwarding', () => {
  it('forwards leagueId to the shared component', () => {
    render(<TradingCenter leagueId={10} userTeamId={42} />);
    expect(capturedSharedProps?.leagueId).toBe(10);
  });

  it('forwards userTeamId to the shared component', () => {
    render(<TradingCenter leagueId={10} userTeamId={42} />);
    expect(capturedSharedProps?.userTeamId).toBe(42);
  });

  it('forwards isCommissioner=true to the shared component', () => {
    render(<TradingCenter leagueId={1} userTeamId={1} isCommissioner />);
    expect(capturedSharedProps?.isCommissioner).toBe(true);
  });

  it('forwards isPremium to the shared component', () => {
    render(<TradingCenter leagueId={1} userTeamId={1} isPremium />);
    expect(capturedSharedProps?.isPremium).toBe(true);
  });

  it('always injects onSubscribeRefresh — the shared component must not manage WS itself', () => {
    render(<TradingCenter leagueId={1} userTeamId={1} />);
    expect(typeof capturedSharedProps?.onSubscribeRefresh).toBe('function');
  });
});

describe('TradingCenter web wrapper — real-time wiring', () => {
  it('subscribes to onTradeOffer and onRosterUpdate via useLeagueWebSocket', () => {
    render(<TradingCenter leagueId={1} userTeamId={99} />);
    expect(typeof capturedWsOpts?.onTradeOffer).toBe('function');
    expect(typeof capturedWsOpts?.onRosterUpdate).toBe('function');
  });

  it('triggers a data refresh when a TRADE_OFFER WebSocket event arrives', () => {
    render(<TradingCenter leagueId={1} userTeamId={99} />);

    const refetch = jest.fn();
    capturedSharedProps!.onSubscribeRefresh(refetch);

    capturedWsOpts!.onTradeOffer!();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('triggers a data refresh when a ROSTER_UPDATE WebSocket event arrives', () => {
    render(<TradingCenter leagueId={1} userTeamId={99} />);

    const refetch = jest.fn();
    capturedSharedProps!.onSubscribeRefresh(refetch);

    capturedWsOpts!.onRosterUpdate!();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('stops calling refetch after the cleanup returned by onSubscribeRefresh is invoked', () => {
    render(<TradingCenter leagueId={1} userTeamId={99} />);

    const refetch = jest.fn();
    const cleanup: (() => void) | void =
      capturedSharedProps!.onSubscribeRefresh(refetch);
    if (typeof cleanup === 'function') cleanup();

    capturedWsOpts!.onTradeOffer!();
    expect(refetch).not.toHaveBeenCalled();
  });
});
