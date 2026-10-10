/**
 * Tests for LeagueActivityFeed filter chips (LS-10686).
 *
 * Chip counts must reflect the league's server-side totals, not the loaded
 * page, and a category chip must stay visible (and fetch its events from the
 * server) even when none of its events are in the first unfiltered page.
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
interface MockEvent {
  id: string;
  leagueId: number;
  eventType: string;
  payload: string;
  occurredAt: string;
  actorUsername: string;
}

let mockActivity: MockEvent[] = [];
let mockCounts: { eventType: string; count: number }[] | undefined;

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
    WaiverClaimApproved: 'WaiverClaimApproved',
    WaiverClaimRejected: 'WaiverClaimRejected',
    DraftPickMade: 'DraftPickMade',
    LeagueAnnouncement: 'LeagueAnnouncement',
  },
  // Simulate the server: apply the eventTypes filter, then the limit.
  useGetLeagueActivityQuery: jest.fn(
    ({
      variables,
    }: {
      variables: { limit?: number; eventTypes?: string[] | null };
    }) => ({
      data: {
        leagueActivity: mockActivity
          .filter(
            (e) =>
              !variables.eventTypes ||
              variables.eventTypes.length === 0 ||
              variables.eventTypes.includes(e.eventType),
          )
          .slice(0, variables.limit ?? 20),
      },
      loading: false,
      error: undefined,
    }),
  ),
  useGetLeagueActivityCountsQuery: jest.fn(() => ({
    data: mockCounts ? { leagueActivityCounts: mockCounts } : undefined,
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

function buildEvents(
  eventType: string,
  count: number,
  startId: number,
): MockEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `evt-${startId + i}`,
    leagueId: 42,
    eventType,
    payload: JSON.stringify({
      round: 1,
      pickNumber: i + 1,
      playerName: `Draftee ${i}`,
    }),
    occurredAt: '2026-01-01T00:00:00.000Z',
    actorUsername: 'alice',
  }));
}

const mockedQuery = useGetLeagueActivityQuery as jest.Mock;

function renderFeed(): void {
  render(
    <LeagueActivityFeed leagueId={42} draftStatus="active" teamCount={10} />,
  );
}

/* ── Tests ────────────────────────────────────────────────────────────────── */

describe('LeagueActivityFeed – filter chips (LS-10686)', () => {
  beforeEach(() => {
    // 20 newer trades fill the first page; 4 older draft picks page out.
    mockActivity = [
      ...buildEvents('TradeProposed', 20, 0),
      ...buildEvents('DraftPickMade', 4, 100),
    ];
    mockCounts = [
      { eventType: 'TradeProposed', count: 20 },
      { eventType: 'DraftPickMade', count: 4 },
      // `waiver_claimed` (pending) is excluded server-side, so it never
      // appears in the counts.
    ];
  });

  afterEach(() => {
    mockedQuery.mockClear();
  });

  it('shows league-wide totals on the chips, not loaded-page counts', () => {
    renderFeed();

    expect(screen.getByText('All · 24')).toBeInTheDocument();
    expect(screen.getByText('Trades · 20')).toBeInTheDocument();
    expect(screen.getByText('Draft · 4')).toBeInTheDocument();
    // Only 20 events are loaded on the first page.
    expect(screen.getByText('20 events loaded')).toBeInTheDocument();
  });

  it('keeps a category chip whose events are older than the first page', () => {
    renderFeed();

    expect(screen.queryByText('Drafted Draftee 0.')).not.toBeInTheDocument();
    expect(screen.getByText('Draft · 4')).toBeInTheDocument();
  });

  it('fetches the selected category from the server', () => {
    renderFeed();

    fireEvent.click(screen.getByText('Draft · 4'));

    expect(mockedQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          eventTypes: ['DraftPickMade'],
        }),
      }),
    );
    expect(screen.getByText('alice drafted Draftee 0.')).toBeInTheDocument();
    expect(screen.getByText('alice drafted Draftee 3.')).toBeInTheDocument();
    expect(screen.getByText('4 events loaded')).toBeInTheDocument();
  });

  it('hides a category chip only when the league has none of that type', () => {
    renderFeed();

    expect(screen.queryByText(/^Waivers/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Commissioner/)).not.toBeInTheDocument();
  });

  it('shows every chip without counts while totals are unavailable', () => {
    mockCounts = undefined;
    renderFeed();

    for (const label of ['All', 'Trades', 'Waivers', 'Draft', 'Commissioner']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });
});
