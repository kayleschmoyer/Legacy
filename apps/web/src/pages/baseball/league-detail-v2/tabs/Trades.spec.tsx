/**
 * Contract tests for the in-league Trades tab (LS-7513 — TC-019).
 *
 * The TradesTab is one of three surfaces that wrap TradingCenter (alongside the
 * standalone native TradeCenterPage and the standalone web /trade-center route).
 * Unlike the other two surfaces, it receives isCommissioner as a prop from the
 * parent LeagueDetailPageV2 rather than deriving it locally, and it inherits
 * WebSocket state from the page-level LeagueWebSocketContext rather than wiring
 * its own subscription.
 *
 * Tests verify:
 *   1. leagueId and userTeamId are forwarded to TradingCenter.
 *   2. isCommissioner is forwarded exactly as received (true / false / default).
 *   3. Non-member and no-team states render the spectator guard, not TradingCenter.
 *   4. A league with no id renders an empty error state, not TradingCenter.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
import React from 'react';
import { render, screen } from '@testing-library/react';

import type { LeagueFragment } from '@legacy-sports/graphql';
import { TradesTab } from './Trades';

// ── Mocks ─────────────────────────────────────────────────────────────────────

let capturedProps: Record<string, unknown> | null = null;

jest.mock('../../../../features/baseball/TradingCenter', () => ({
  TradingCenter: (props: any) => {
    capturedProps = props;
    return (
      <div
        data-testid="trading-center"
        data-league-id={String(props.leagueId)}
        data-team-id={String(props.userTeamId)}
        data-is-commissioner={String(props.isCommissioner ?? false)}
      />
    );
  },
}));

let mockHasTradeAnalyzer = false;
const mockNavigate = jest.fn();

jest.mock('../../../../hooks/useIsPremium', () => ({
  useHasEntitlement: () => mockHasTradeAnalyzer,
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual<typeof import('react-router-dom')>('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../Shared', () => ({
  Banner: ({
    title,
    sub,
    kind,
  }: {
    title: React.ReactNode;
    sub?: React.ReactNode;
    kind?: string;
  }) => (
    <div data-testid="banner" data-kind={kind ?? 'info'}>
      <span data-testid="banner-title">{title}</span>
      {sub && <span data-testid="banner-sub">{sub}</span>}
    </div>
  ),
  Section: ({
    title,
    children,
  }: {
    title: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="section">
      {title}
      {children}
    </div>
  ),
  Empty: ({ title, sub }: { title: string; sub?: string }) => (
    <div data-testid="empty">
      <span data-testid="empty-title">{title}</span>
      {sub && <span data-testid="empty-sub">{sub}</span>}
    </div>
  ),
}));

jest.mock('../Icons', () => ({
  I: {
    Eye: () => null,
    ArrowLeftRight: () => null,
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseLeague = { id: 10, name: 'Test League' } as unknown as LeagueFragment;

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedProps = null;
});

describe('TradesTab — TradingCenter contract', () => {
  it('forwards leagueId to TradingCenter', () => {
    render(<TradesTab league={baseLeague} isMember myTeamId={42} />);
    expect(screen.getByTestId('trading-center')).toHaveAttribute(
      'data-league-id',
      '10',
    );
  });

  it('forwards userTeamId to TradingCenter', () => {
    render(<TradesTab league={baseLeague} isMember myTeamId={42} />);
    expect(screen.getByTestId('trading-center')).toHaveAttribute(
      'data-team-id',
      '42',
    );
  });

  it('passes isCommissioner=true when the prop is set', () => {
    render(
      <TradesTab league={baseLeague} isMember myTeamId={42} isCommissioner />,
    );
    expect(screen.getByTestId('trading-center')).toHaveAttribute(
      'data-is-commissioner',
      'true',
    );
  });

  it('defaults isCommissioner to false when the prop is omitted', () => {
    render(<TradesTab league={baseLeague} isMember myTeamId={42} />);
    expect(capturedProps?.isCommissioner).toBe(false);
  });

  it('does not pass onSubscribeRefresh — real-time is inherited from page context', () => {
    render(<TradesTab league={baseLeague} isMember myTeamId={42} />);
    expect(capturedProps?.onSubscribeRefresh).toBeUndefined();
  });
});

describe('TradesTab — spectator guard', () => {
  it('shows spectator banner (not TradingCenter) when user is not a member', () => {
    render(<TradesTab league={baseLeague} isMember={false} myTeamId={null} />);
    expect(screen.queryByTestId('trading-center')).not.toBeInTheDocument();
    expect(screen.getByTestId('banner')).toHaveAttribute(
      'data-kind',
      'spectator',
    );
    expect(screen.getByTestId('banner-title')).toHaveTextContent(
      'Spectator Mode',
    );
  });

  it('shows spectator banner when member flag is true but myTeamId is null', () => {
    render(<TradesTab league={baseLeague} isMember myTeamId={null} />);
    expect(screen.queryByTestId('trading-center')).not.toBeInTheDocument();
    expect(screen.getByTestId('banner')).toHaveAttribute(
      'data-kind',
      'spectator',
    );
  });
});

describe('TradesTab — premium gating contract (LS-10520)', () => {
  // TradingCenter defaults its premium switches to false, so the tab must
  // inject the viewer's trade_analyzer entitlement or paying users only ever
  // see the lock card.
  beforeEach(() => {
    mockHasTradeAnalyzer = false;
    mockNavigate.mockClear();
  });

  it.each([true, false])(
    'passes canUseTradeTools=%s from the trade_analyzer entitlement',
    (entitled) => {
      mockHasTradeAnalyzer = entitled;
      render(<TradesTab league={baseLeague} isMember myTeamId={42} />);
      expect(capturedProps?.canUseTradeTools).toBe(entitled);
    },
  );

  it('does not inject isPremium — league trade voting is unchanged', () => {
    mockHasTradeAnalyzer = true;
    render(<TradesTab league={baseLeague} isMember myTeamId={42} />);
    expect(capturedProps?.isPremium).toBeUndefined();
  });

  it('wires onUpgradePremium to the subscription page', () => {
    render(<TradesTab league={baseLeague} isMember myTeamId={42} />);
    (capturedProps?.onUpgradePremium as () => void)();
    expect(mockNavigate).toHaveBeenCalledWith('/profile/subscription');
  });
});

describe('TradesTab — missing league id guard', () => {
  it('renders an empty error state (not TradingCenter) when league.id is absent', () => {
    const leagueWithoutId = {
      ...baseLeague,
      id: undefined,
    } as unknown as LeagueFragment;
    render(<TradesTab league={leagueWithoutId} isMember myTeamId={42} />);
    expect(screen.queryByTestId('trading-center')).not.toBeInTheDocument();
    expect(screen.getByTestId('empty-title')).toHaveTextContent(
      'Trades unavailable',
    );
  });
});
