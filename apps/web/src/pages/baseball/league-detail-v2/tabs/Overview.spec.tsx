/**
 * Tests for the DuesCompact subcomponent of OverviewTab (LS-4632).
 *
 * Covers the redesign acceptance criteria for the dues summary:
 *   1. Renders null when dues are not enabled.
 *   2. Renders null when no member rows are returned.
 *   3. Renders the paid / total headline and collected dollar amount.
 *   4. Renders the Outstanding list only when unpaid members exist.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

import { DuesCompact } from './Overview';
import type { GetLeagueDuesStatusQuery } from '../../../../api/db/graphql.generated';

let mockData: GetLeagueDuesStatusQuery | null = null;

jest.mock('../../../../api/db/graphql.generated', () => ({
  useGetLeagueDuesStatusQuery: jest.fn(() => ({ data: mockData })),
  useGetLeagueStandingsQuery: jest.fn(() => ({ data: null })),
}));

// Overview.tsx pulls in heavy feature trees (LeagueChatTab -> GifPicker uses
// import.meta.env, etc.) that aren't relevant to DuesCompact's logic. Stub
// them at the module boundary so Jest doesn't try to parse them.
jest.mock('../../../../features/baseball/LeagueChatTab', () => ({
  LeagueChatTab: () => null,
}));
jest.mock('../../../../features/baseball/LeagueActivityFeed', () => ({
  LeagueActivityFeed: () => null,
}));
jest.mock(
  '../../../../features/baseball/CommissionerAnnouncementsPanel',
  () => ({
    CommissionerAnnouncementsPanel: () => null,
  }),
);
jest.mock('@legacy-sports/shared-components/leagues', () => ({
  LeagueScoringSummary: () => null,
}));
jest.mock('../../../../lib/scoring', () => ({
  useLeagueScoringSettings: () => ({
    loading: false,
    error: null,
    profileName: null,
    settings: null,
  }),
}));
jest.mock('qrcode.react', () => ({
  QRCodeSVG: () => null,
}));

type DuesSettings = NonNullable<GetLeagueDuesStatusQuery['leagueDuesSettings']>;
type DuesMember = NonNullable<
  GetLeagueDuesStatusQuery['leagueDuesStatus']
>[number];

const settings = (enabled: boolean, amountCents = 5000): DuesSettings => ({
  __typename: 'LeagueDuesSettings',
  enabled,
  amountCents,
});

const member = (overrides: Partial<DuesMember> = {}): DuesMember => ({
  __typename: 'LeagueMemberPaymentStatus',
  userId: 1,
  username: 'Alice',
  paid: false,
  ...overrides,
});

beforeEach(() => {
  mockData = null;
});

describe('DuesCompact', () => {
  it('renders nothing when dues are disabled', () => {
    mockData = {
      leagueDuesSettings: settings(false),
      leagueDuesStatus: [member()],
    };
    const { container } = render(<DuesCompact leagueId={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there are no member rows', () => {
    mockData = {
      leagueDuesSettings: settings(true),
      leagueDuesStatus: [],
    };
    const { container } = render(<DuesCompact leagueId={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders paid / total headline and collected dollar total', () => {
    mockData = {
      leagueDuesSettings: settings(true, 5000),
      leagueDuesStatus: [
        member({ userId: 1, username: 'Alice', paid: true }),
        member({ userId: 2, username: 'Bob', paid: true }),
        member({ userId: 3, username: 'Carol', paid: false }),
        member({ userId: 4, username: 'Dave', paid: false }),
      ],
    };
    render(<DuesCompact leagueId={1} />);
    expect(screen.getByText('League Dues')).toBeInTheDocument();
    expect(screen.getByText('$50.00 per team')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('/4')).toBeInTheDocument();
    expect(
      screen.getByText('teams paid · $100.00 collected'),
    ).toBeInTheDocument();
  });

  it('renders the Outstanding list with unpaid members only', () => {
    mockData = {
      leagueDuesSettings: settings(true, 2500),
      leagueDuesStatus: [
        member({ userId: 1, username: 'Alice', paid: true }),
        member({ userId: 2, username: 'Bob', paid: false }),
        member({ userId: 3, username: 'Carol', paid: false }),
      ],
    };
    render(<DuesCompact leagueId={1} />);
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getAllByText('Pending')).toHaveLength(2);
  });

  it('hides the Outstanding list when every member has paid', () => {
    mockData = {
      leagueDuesSettings: settings(true, 5000),
      leagueDuesStatus: [
        member({ userId: 1, username: 'Alice', paid: true }),
        member({ userId: 2, username: 'Bob', paid: true }),
      ],
    };
    render(<DuesCompact leagueId={1} />);
    expect(screen.queryByText('Outstanding')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
  });
});
