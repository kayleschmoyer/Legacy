/**
 * Tests for LeagueActivityFeed pagination (LS-8060).
 *
 * The feed query returns up to 200 events. Before this fix the component
 * rendered every matching event at once, producing an unbounded panel on
 * the league overview page. The panel must now render a bounded first page
 * and reveal additional events via a "Show more" control.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { LeagueActivityFeed } from './LeagueActivityFeed';

/* ── Mock state (read by factory implementations at render time) ─────────── */

interface WithChildren {
  children?: React.ReactNode;
}
interface ButtonProps extends WithChildren {
  onPress?: () => void;
}

let mockActivity: unknown[] = [];

/* ── Module mocks ─────────────────────────────────────────────────────────── */

jest.mock('tamagui', () => ({
  Card: ({ children }: WithChildren) => <div>{children}</div>,
  Button: ({ children, onPress }: ButtonProps) => (
    <button onClick={onPress}>{children}</button>
  ),
  ScrollView: ({ children }: WithChildren) => <div>{children}</div>,
  Separator: () => <hr />,
  Spinner: () => <span>loading</span>,
  Text: ({ children }: WithChildren) => <span>{children}</span>,
  XStack: ({ children }: WithChildren) => <div>{children}</div>,
  YStack: ({ children }: WithChildren) => <div>{children}</div>,
}));

jest.mock('@tamagui/lucide-icons', () => ({
  ArrowLeftRight: () => null,
  ChevronRight: () => null,
  Clock: () => null,
  Filter: () => null,
  Shield: () => null,
  Trophy: () => null,
  UserCheck: () => null,
  UserMinus: () => null,
}));

jest.mock('@legacy-sports/graphql', () => ({
  LeagueActivityEventType: {
    TradeProposed: 'TradeProposed',
    TradeAccepted: 'TradeAccepted',
    TradeRejected: 'TradeRejected',
    TradeCancelled: 'TradeCancelled',
    TradeVetoed: 'TradeVetoed',
    WaiverClaimed: 'WaiverClaimed',
    WaiverCancelled: 'WaiverCancelled',
    DraftPickMade: 'DraftPickMade',
    LeagueAnnouncement: 'LeagueAnnouncement',
  },
  useGetLeagueActivityQuery: jest.fn(() => ({
    data: { leagueActivity: mockActivity },
    loading: false,
    error: undefined,
  })),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../constants/colors', () => ({
  BRAND_GOLD: '#C5A55A',
  BRAND_GOLD_LIGHT: '#C5A55A',
  BRAND_NAVY_LIGHT: '#1B3A5C',
  withAlpha: (color: string): string => color,
}));

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const PAGE_SIZE = 8;

/** Build N trade-accepted events whose rendered detail text is unique. */
function buildTradeEvents(count: number): unknown[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `evt-${i}`,
    leagueId: 42,
    eventType: 'TradeAccepted',
    payload: JSON.stringify({ teamAName: `T${i}A`, teamBName: `T${i}B` }),
    occurredAt: '2026-01-01T00:00:00.000Z',
    actorUsername: 'alice',
  }));
}

const detailFor = (i: number): string => `T${i}A and T${i}B completed a trade.`;

/* ── Tests ────────────────────────────────────────────────────────────────── */

describe('LeagueActivityFeed – pagination (LS-8060)', () => {
  afterEach(() => {
    mockActivity = [];
  });

  it('renders only the first page of events when more exist', () => {
    mockActivity = buildTradeEvents(12);
    render(
      <LeagueActivityFeed leagueId={42} draftStatus="active" teamCount={10} />,
    );

    // First PAGE_SIZE items are visible…
    expect(screen.getByText(detailFor(0))).toBeInTheDocument();
    expect(screen.getByText(detailFor(PAGE_SIZE - 1))).toBeInTheDocument();
    // …and the overflow items are not yet rendered.
    expect(screen.queryByText(detailFor(PAGE_SIZE))).not.toBeInTheDocument();
    expect(screen.queryByText(detailFor(11))).not.toBeInTheDocument();

    // Footer reflects the bounded count out of the full filtered total.
    expect(screen.getByText('Showing 8 of 12 events')).toBeInTheDocument();
    expect(screen.getByText('Show more')).toBeInTheDocument();
  });

  it('reveals the next page when "Show more" is pressed', () => {
    mockActivity = buildTradeEvents(12);
    render(
      <LeagueActivityFeed leagueId={42} draftStatus="active" teamCount={10} />,
    );

    fireEvent.click(screen.getByText('Show more'));

    // All 12 events are now rendered and the control is gone.
    expect(screen.getByText(detailFor(PAGE_SIZE))).toBeInTheDocument();
    expect(screen.getByText(detailFor(11))).toBeInTheDocument();
    expect(screen.getByText('Showing 12 of 12 events')).toBeInTheDocument();
    expect(screen.queryByText('Show more')).not.toBeInTheDocument();
  });

  it('does not render "Show more" when events fit on one page', () => {
    mockActivity = buildTradeEvents(PAGE_SIZE);
    render(
      <LeagueActivityFeed leagueId={42} draftStatus="active" teamCount={10} />,
    );

    expect(screen.queryByText('Show more')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 8 of 8 events')).toBeInTheDocument();
  });
});
