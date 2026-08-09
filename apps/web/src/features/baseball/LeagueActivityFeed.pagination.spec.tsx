/**
 * Tests for LeagueActivityFeed server-driven pagination (LS-5950).
 *
 * The feed now fetches PAGE_SIZE=20 events initially and re-queries with an
 * increased limit on every "Load older" press. When the server returns fewer
 * events than the current limit, no more pages exist and the button hides.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useGetLeagueActivityQuery } from '@legacy-sports/graphql';

import { LeagueActivityFeed } from './LeagueActivityFeed';

/* ── Mock state (read by factory implementations at render time) ─────────── */

interface WithChildren {
  children?: React.ReactNode;
}
interface ButtonProps extends WithChildren {
  onPress?: () => void;
  disabled?: boolean;
}

let mockActivity: unknown[] = [];

/* ── Module mocks ─────────────────────────────────────────────────────────── */

jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
  Card: ({ children }: WithChildren) => <div>{children}</div>,
  Button: ({ children, onPress, disabled }: ButtonProps) => (
    <button onClick={onPress} disabled={disabled}>
      {children}
    </button>
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
  // Simulate server-side limit: return up to variables.limit items.
  useGetLeagueActivityQuery: jest.fn(
    ({ variables }: { variables: { limit?: number } }) => ({
      data: {
        leagueActivity: mockActivity.slice(0, variables?.limit ?? 20),
      },
      loading: false,
      error: undefined,
    }),
  ),
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

const PAGE_SIZE = 20;

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

const mockedQuery = useGetLeagueActivityQuery as jest.Mock;

/* ── Tests ────────────────────────────────────────────────────────────────── */

describe('LeagueActivityFeed – server-driven pagination (LS-5950)', () => {
  afterEach(() => {
    mockActivity = [];
    mockedQuery.mockClear();
  });

  it('renders all events when they fit within one page', () => {
    mockActivity = buildTradeEvents(PAGE_SIZE - 1);
    render(
      <LeagueActivityFeed leagueId={42} draftStatus="active" teamCount={10} />,
    );

    expect(screen.getByText(detailFor(0))).toBeInTheDocument();
    expect(screen.getByText(detailFor(PAGE_SIZE - 2))).toBeInTheDocument();
    expect(screen.queryByText('Load older')).not.toBeInTheDocument();
  });

  it('shows "Load older" when server returns exactly PAGE_SIZE events', () => {
    mockActivity = buildTradeEvents(PAGE_SIZE + 10);
    render(
      <LeagueActivityFeed leagueId={42} draftStatus="active" teamCount={10} />,
    );

    // Only PAGE_SIZE items rendered (server sliced to limit)
    expect(screen.getByText(detailFor(0))).toBeInTheDocument();
    expect(screen.getByText(detailFor(PAGE_SIZE - 1))).toBeInTheDocument();
    expect(screen.queryByText(detailFor(PAGE_SIZE))).not.toBeInTheDocument();

    expect(screen.getByText('Load older')).toBeInTheDocument();
  });

  it('fetches the next page when "Load older" is pressed', () => {
    mockActivity = buildTradeEvents(PAGE_SIZE + 5);
    render(
      <LeagueActivityFeed leagueId={42} draftStatus="active" teamCount={10} />,
    );

    fireEvent.click(screen.getByText('Load older'));

    // Re-queried with limit = PAGE_SIZE * 2, all events now visible
    expect(screen.getByText(detailFor(PAGE_SIZE))).toBeInTheDocument();
    expect(screen.getByText(detailFor(PAGE_SIZE + 4))).toBeInTheDocument();
    // No more pages — the second page has fewer than limit items
    expect(screen.queryByText('Load older')).not.toBeInTheDocument();
  });

  it('passes the initial limit to the query on mount', () => {
    mockActivity = buildTradeEvents(5);
    render(
      <LeagueActivityFeed leagueId={42} draftStatus="active" teamCount={10} />,
    );

    expect(mockedQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ limit: PAGE_SIZE }),
      }),
    );
  });

  it('shows footer count matching loaded events', () => {
    mockActivity = buildTradeEvents(3);
    render(
      <LeagueActivityFeed leagueId={42} draftStatus="active" teamCount={10} />,
    );

    expect(screen.getByText('3 events loaded')).toBeInTheDocument();
  });

  it('uses singular "event" for exactly one result', () => {
    mockActivity = buildTradeEvents(1);
    render(
      <LeagueActivityFeed leagueId={42} draftStatus="active" teamCount={10} />,
    );

    expect(screen.getByText('1 event loaded')).toBeInTheDocument();
  });
});
