import React from 'react';
import { render, screen } from '@testing-library/react';
import { FootballTeamFilter } from './FootballTeamFilter';
import type { NflTeamMetadataEntry } from './FootballTeamFilter';

jest.mock('tamagui', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    createTokens: (tokens: unknown) => tokens,
    Select: Object.assign(
      ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      {
        Trigger: Box,
        Value: Box,
        Content: Box,
        ScrollUpButton: () => null,
        ScrollDownButton: () => null,
        Viewport: Box,
        Group: Box,
        Item: ({ children }: { children?: React.ReactNode }) => (
          <div>{children}</div>
        ),
        ItemText: Box,
        ItemIndicator: () => null,
      },
    ),
    XStack: ({
      children,
      accessibilityLabel,
    }: {
      children?: React.ReactNode;
      accessibilityLabel?: string;
    }) => <div aria-label={accessibilityLabel}>{children}</div>,
    YStack: Box,
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  Check: () => null,
  ChevronDown: () => null,
}));

jest.mock('@legacy-sports/shared-components', () => ({
  NFL_TEAMS: {
    KC: {
      abbreviation: 'KC',
      fullName: 'Kansas City Chiefs',
      conference: 'AFC',
      division: 'West',
      city: 'Kansas City',
    },
    DAL: {
      abbreviation: 'DAL',
      fullName: 'Dallas Cowboys',
      conference: 'NFC',
      division: 'East',
      city: 'Dallas',
    },
  },
  StatusBadge: ({ label }: { label: string }) => (
    <span data-testid="status-badge">{label}</span>
  ),
}));

const noop = jest.fn();

describe('FootballTeamFilter — badge rendering', () => {
  it('renders no badges when teamMetadata is undefined', () => {
    render(<FootballTeamFilter selected="All" onChange={noop} />);
    expect(screen.queryAllByTestId('status-badge')).toHaveLength(0);
  });

  it('renders no badges when teamMetadata is an empty array', () => {
    render(
      <FootballTeamFilter selected="All" onChange={noop} teamMetadata={[]} />,
    );
    expect(screen.queryAllByTestId('status-badge')).toHaveLength(0);
  });

  it('renders bye-week and SoS badges for each team in teamMetadata', () => {
    const metadata: NflTeamMetadataEntry[] = [
      { teamAbbreviation: 'KC', byeWeek: 14, sosTier: 'easy' },
      { teamAbbreviation: 'DAL', byeWeek: 7, sosTier: 'hard' },
    ];
    render(
      <FootballTeamFilter
        selected="All"
        onChange={noop}
        teamMetadata={metadata}
      />,
    );

    const badges = screen.getAllByTestId('status-badge');
    const labels = badges.map((b) => b.textContent);

    expect(labels).toContain('Bye 14');
    expect(labels).toContain('SoS: Easy');
    expect(labels).toContain('Bye 7');
    expect(labels).toContain('SoS: Hard');
  });

  it('uses human-readable SoS label (Easy/Med/Hard) not raw enum value', () => {
    const metadata: NflTeamMetadataEntry[] = [
      { teamAbbreviation: 'KC', byeWeek: 9, sosTier: 'medium' },
    ];
    render(
      <FootballTeamFilter
        selected="All"
        onChange={noop}
        teamMetadata={metadata}
      />,
    );

    const labels = screen
      .getAllByTestId('status-badge')
      .map((b) => b.textContent);
    expect(labels).toContain('SoS: Med');
    expect(labels).not.toContain('SoS: medium');
  });

  it('uses correct accessibilityLabel with human-readable SoS tier', () => {
    const metadata: NflTeamMetadataEntry[] = [
      { teamAbbreviation: 'KC', byeWeek: 14, sosTier: 'easy' },
    ];
    render(
      <FootballTeamFilter
        selected="All"
        onChange={noop}
        teamMetadata={metadata}
      />,
    );

    const group = screen.getByRole('generic', {
      name: 'Bye week 14, Strength of schedule: Easy',
    });
    expect(group).toBeTruthy();
  });
});
