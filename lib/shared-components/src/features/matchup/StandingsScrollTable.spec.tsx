import React from 'react';
import { useMedia } from 'tamagui';
import { StandingsTable } from './StandingsTable';
import {
  KEY_SCROLL_STEP,
  keyScrollTarget,
  nearestScrollFor,
  scrollCueFor,
} from './StandingsScrollTable';
import { render } from '../../test-utils';

type StandingRecord = React.ComponentProps<
  typeof StandingsTable
>['standings'][0];

function makeTeam(
  overrides: Partial<StandingRecord> & { teamId: string; teamName: string },
): StandingRecord {
  return {
    __typename: 'TeamStanding' as const,
    wins: 0,
    losses: 0,
    ties: 0,
    winPercentage: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    avatarUrl: null,
    primaryColor: null,
    secondaryColor: null,
    divisionId: null,
    streak: null,
    medianWins: null,
    medianLosses: null,
    medianTies: null,
    ...overrides,
  };
}

const standings: StandingRecord[] = [
  makeTeam({
    teamId: '1',
    teamName: 'Thunder',
    wins: 10,
    losses: 4,
    winPercentage: 0.714,
    pointsFor: 1250.5,
    pointsAgainst: 1100.2,
    streak: 'W3',
  }),
  makeTeam({
    teamId: '2',
    teamName: "legacyplaywright's Extremely Long Team Name",
    wins: 9,
    losses: 5,
    winPercentage: 0.643,
    pointsFor: 1180.3,
    pointsAgainst: 1050.7,
    streak: 'L1',
  }),
];

const mockUseMedia = useMedia as unknown as jest.Mock;

afterEach(() => {
  mockUseMedia.mockReturnValue({});
});

describe('StandingsTable below 980px — sticky Team + horizontal scroll (LS-10717)', () => {
  beforeEach(() => {
    // Phone width: `$xxs` matches, `$gtMd` does not.
    mockUseMedia.mockReturnValue({ xxs: true, xs: true, sm: true, md: true });
  });

  it('renders every column header, including the ones previously hidden', () => {
    const { getAllByRole } = render(
      <StandingsTable standings={standings} showWaiverOrder />,
    );
    expect(
      getAllByRole('columnheader').map((h) => h.textContent?.trim()),
    ).toEqual([
      '#',
      'Team',
      'W',
      'L',
      'T',
      'Win% ↓',
      'PF',
      'PA',
      'Diff',
      'Strk',
      'Waiver',
    ]);
  });

  it('renders the stat values for each team', () => {
    const { getByText } = render(<StandingsTable standings={standings} />);
    expect(getByText('71.4%')).toBeTruthy();
    expect(getByText('1250.50')).toBeTruthy();
    expect(getByText('1100.20')).toBeTruthy();
    expect(getByText('+150.3')).toBeTruthy();
    expect(getByText('W3')).toBeTruthy();
  });

  it('exposes the stats pane as a labelled, keyboard-focusable region', () => {
    const { getByRole } = render(<StandingsTable standings={standings} />);
    const region = getByRole('region', {
      name: 'Standings stats, scrolls horizontally',
    });
    expect(region.getAttribute('tabindex')).toBe('0');
  });

  it('exposes one logical row per team that owns its scrolling cells', () => {
    const { getAllByRole, container } = render(
      <StandingsTable standings={standings} />,
    );
    const rows = getAllByRole('row');
    // Header row + one row per team.
    expect(rows).toHaveLength(standings.length + 1);

    const thunderRow = rows.find((r) => r.textContent?.includes('Thunder'));
    expect(thunderRow).toBeDefined();
    const owned = (thunderRow?.getAttribute('aria-owns') ?? '').split(' ');
    // W, L, T, Win%, PF, PA, Diff, Strk.
    expect(owned).toHaveLength(8);
    const ownedText = owned.map(
      (id) => container.ownerDocument.getElementById(id)?.textContent,
    );
    expect(ownedText).toEqual([
      '10',
      '4',
      '0',
      '71.4%',
      '1250.50',
      '1100.20',
      '+150.3',
      'W3',
    ]);
  });

  it('puts the scroll region ahead of the team links in tab order', () => {
    const { getByRole, getByText } = render(
      <StandingsTable
        standings={standings}
        getTeamUrl={(id) => `/baseball/teams/${id}`}
      />,
    );
    const region = getByRole('region');
    // The jest tamagui mock drops `tag`, so assert on the link's text node:
    // the pinned team cells come after the region in DOM (= tab) order.
    const teamName = getByText('Thunder');
    expect(
      region.compareDocumentPosition(teamName) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps the full team name available (title + text) while truncating to one line', () => {
    const longName = "legacyplaywright's Extremely Long Team Name";
    const { getByText } = render(<StandingsTable standings={standings} />);
    const name = getByText(longName);
    expect(name.getAttribute('title')).toBe(longName);
  });

  it('renders division label rows and resets ranks per division', () => {
    const { getByText, getAllByText } = render(
      <StandingsTable
        standings={[
          makeTeam({
            teamId: '1',
            teamName: 'A',
            divisionId: 1,
            divisionName: 'East',
          }),
          makeTeam({
            teamId: '2',
            teamName: 'B',
            divisionId: 2,
            divisionName: 'West',
          }),
        ]}
      />,
    );
    expect(getByText('East')).toBeTruthy();
    expect(getByText('West')).toBeTruthy();
    // Each division's only team is ranked 1.
    expect(getAllByText('1').length).toBeGreaterThanOrEqual(2);
  });

  it('shows a skeleton (not the scroll region) while loading', () => {
    const { getByRole, queryByRole, getByText } = render(
      <StandingsTable standings={[]} loading />,
    );
    expect(getByRole('status')).toBeTruthy();
    expect(getByText('Loading standings...')).toBeTruthy();
    expect(queryByRole('region')).toBeNull();
  });

  it('has no scroll region in the error state', () => {
    const { queryByRole, getByText } = render(
      <StandingsTable standings={[]} error={new globalThis.Error('Boom')} />,
    );
    expect(getByText('Error: Boom')).toBeTruthy();
    expect(queryByRole('region')).toBeNull();
  });

  it('hides the scroll caption when the content does not overflow', () => {
    // jsdom performs no layout, so the pane reports no overflow.
    const { queryByText } = render(<StandingsTable standings={standings} />);
    expect(queryByText(/for PF, PA, Diff/)).toBeNull();
  });
});

describe('StandingsTable at 980px and above', () => {
  beforeEach(() => {
    mockUseMedia.mockReturnValue({ gtSm: true, gtMd: true });
  });

  it('renders the single full table with no scroll machinery', () => {
    const { queryByRole, getByText } = render(
      <StandingsTable standings={standings} showWaiverOrder />,
    );
    expect(queryByRole('region')).toBeNull();
    expect(getByText('PF')).toBeTruthy();
    expect(getByText('Waiver')).toBeTruthy();
  });
});

describe('scrollCueFor', () => {
  it('shows nothing when the content fits', () => {
    expect(scrollCueFor({ x: 0, viewport: 400, content: 400 }, false)).toEqual({
      overflow: false,
      fade: false,
      scrolled: false,
      caption: false,
    });
  });

  it('shows the fade and caption at the start of an overflowing pane', () => {
    expect(scrollCueFor({ x: 0, viewport: 160, content: 480 }, false)).toEqual({
      overflow: true,
      fade: true,
      scrolled: false,
      caption: true,
    });
  });

  it('casts the pinned shadow once scrolled and drops the fade at the end', () => {
    expect(
      scrollCueFor({ x: 320, viewport: 160, content: 480 }, false),
    ).toEqual({ overflow: true, fade: false, scrolled: true, caption: true });
  });

  it('keeps the caption hidden once dismissed', () => {
    expect(
      scrollCueFor({ x: 0, viewport: 160, content: 480 }, true).caption,
    ).toBe(false);
  });

  it('reports no overflow before the pane has been measured', () => {
    expect(
      scrollCueFor({ x: 0, viewport: 0, content: 480 }, false).overflow,
    ).toBe(false);
  });
});

describe('keyScrollTarget', () => {
  const metrics = { x: 100, viewport: 160, content: 480 };

  it('steps by 64px with the arrow keys, clamped to the scroll range', () => {
    expect(keyScrollTarget('ArrowRight', metrics)).toBe(100 + KEY_SCROLL_STEP);
    expect(keyScrollTarget('ArrowLeft', metrics)).toBe(100 - KEY_SCROLL_STEP);
    expect(keyScrollTarget('ArrowLeft', { ...metrics, x: 10 })).toBe(0);
    expect(keyScrollTarget('ArrowRight', { ...metrics, x: 300 })).toBe(320);
  });

  it('jumps to the first and last column with Home/End', () => {
    expect(keyScrollTarget('Home', metrics)).toBe(0);
    expect(keyScrollTarget('End', metrics)).toBe(320);
  });

  it('ignores other keys', () => {
    expect(keyScrollTarget('Tab', metrics)).toBeNull();
  });
});

describe('nearestScrollFor', () => {
  const metrics = { x: 100, viewport: 160, content: 480 };

  it('leaves a fully visible column alone', () => {
    expect(nearestScrollFor(120, 44, metrics)).toBe(100);
  });

  it('scrolls left to reveal a column clipped on the left', () => {
    expect(nearestScrollFor(44, 44, metrics)).toBe(44);
  });

  it('scrolls right just enough to reveal a column clipped on the right', () => {
    expect(nearestScrollFor(300, 60, metrics)).toBe(200);
  });
});
