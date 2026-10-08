/**
 * LS-10740: once dues are enabled, `leagueDuesStatus` lists every league
 * owner — including members never marked paid/unpaid (null payment row id) —
 * so the dashboard must render them as Unpaid rows with a Mark Paid action
 * and count them in the summary, instead of "No league members found".
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';

import { LeagueDuesStatusDashboard } from './LeagueDuesStatusDashboard';

const mockUseStatus = jest.fn();

jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueDuesStatusQuery: (...args: unknown[]): unknown =>
    mockUseStatus(...args),
  useMarkMemberPaidMutation: () => [jest.fn(), { loading: false }],
  useMarkMemberUnpaidMutation: () => [jest.fn(), { loading: false }],
}));

// apps/web/jest.config.ts maps every deep @tamagui/lucide-icons/icons/* path
// to one shared module (LS-9423), so a single mock covers all icons used here.
jest.mock('@tamagui/lucide-icons/icons/Check', () => {
  const Icon = () => <span />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('tamagui', () => {
  const Passthrough = ({
    children,
    'data-testid': testId,
  }: {
    children?: React.ReactNode;
    'data-testid'?: string;
  }) => <div data-testid={testId}>{children}</div>;
  return {
    Button: ({ children }: { children?: React.ReactNode }) => (
      <button type="button">{children}</button>
    ),
    Card: Passthrough,
    H4: Passthrough,
    Separator: () => <hr />,
    Spinner: () => <span data-testid="spinner" />,
    Text: Passthrough,
    XStack: Passthrough,
    YStack: Passthrough,
  };
});

const settings = {
  id: 1,
  leagueId: 10,
  enabled: true,
  amountCents: 1000,
  reminderEnabled: false,
  reminderDayOfWeek: null,
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
};

const member = (
  userId: number,
  overrides: { id?: number | null; paid?: boolean; paidAt?: string } = {},
) => ({
  id: overrides.id ?? null,
  leagueId: 10,
  userId,
  username: `owner${userId}`,
  paid: overrides.paid ?? false,
  paidAt: overrides.paidAt ?? null,
  markedBy: null,
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
});

describe('LeagueDuesStatusDashboard populated table (LS-10740)', () => {
  beforeEach(() => {
    mockUseStatus.mockReset();
  });

  it('lists never-marked owners as Unpaid and counts them in the summary', () => {
    mockUseStatus.mockReturnValue({
      data: {
        leagueDuesSettings: settings,
        leagueDuesStatus: [member(1), member(2), member(3)],
      },
      loading: false,
      error: undefined,
      refetch: jest.fn(),
    });

    render(
      <LeagueDuesStatusDashboard
        leagueId={10}
        isCommissioner
        currentUserId={1}
      />,
    );

    expect(
      screen.queryByText('No league members found'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('All (3)')).toBeInTheDocument();
    expect(screen.getByText('Unpaid (3)')).toBeInTheDocument();
    expect(screen.getByText('Paid (0)')).toBeInTheDocument();

    // Commissioner's own row: Unpaid, but no self-mark action (LS-4029).
    const selfRow = screen.getByTestId('dues-member-row-1');
    expect(within(selfRow).getByText('Unpaid')).toBeInTheDocument();
    expect(within(selfRow).getByText('Self')).toBeInTheDocument();
    expect(within(selfRow).queryByText('Mark Paid')).not.toBeInTheDocument();

    for (const userId of [2, 3]) {
      const row = screen.getByTestId(`dues-member-row-${userId}`);
      expect(within(row).getByText(`owner${userId}`)).toBeInTheDocument();
      expect(within(row).getByText('Unpaid')).toBeInTheDocument();
      expect(within(row).getByText('Mark Paid')).toBeInTheDocument();
    }
  });

  it('computes paid count and collected total across all members', () => {
    mockUseStatus.mockReturnValue({
      data: {
        leagueDuesSettings: settings,
        leagueDuesStatus: [
          member(1),
          member(2, {
            id: 7,
            paid: true,
            paidAt: '2026-10-07T00:00:00.000Z',
          }),
          member(3),
        ],
      },
      loading: false,
      error: undefined,
      refetch: jest.fn(),
    });

    render(
      <LeagueDuesStatusDashboard
        leagueId={10}
        isCommissioner
        currentUserId={1}
      />,
    );

    expect(screen.getByText('Paid (1)')).toBeInTheDocument();
    expect(screen.getByText('Unpaid (2)')).toBeInTheDocument();
    expect(screen.getByText('10.00')).toBeInTheDocument();
    const paidRow = screen.getByTestId('dues-member-row-2');
    expect(within(paidRow).getByText('Mark Unpaid')).toBeInTheDocument();
  });
});
