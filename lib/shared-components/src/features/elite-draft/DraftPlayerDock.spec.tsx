import React from 'react';

import { DraftPlayerDock, type DraftPlayerDockProps } from './DraftPlayerDock';
import type { DraftPlayer } from './types';
import { fireEvent, render } from '../../test-utils';

const player = (overrides: Partial<DraftPlayer> = {}): DraftPlayer => ({
  id: 1,
  name: 'Lou Gehrig',
  position: '1B',
  club: 'NYY',
  adp: 14,
  avg: 0.34,
  hr: 493,
  rbi: 1995,
  runs: 1888,
  sb: 102,
  games: 2164,
  hits: 2721,
  obp: 0.447,
  slg: 0.632,
  ...overrides,
});

const PLAYERS = [
  player(),
  player({ id: 2, name: 'Ernie Banks', position: 'SS', club: 'CHC', adp: 45 }),
  player({ id: 3, name: 'Greg Maddux', position: 'P', club: 'ATL', adp: 41 }),
];

function makeProps(
  overrides: Partial<DraftPlayerDockProps> = {},
): DraftPlayerDockProps {
  return {
    sport: 'baseball',
    pickLabel: 'Your pick · #42',
    availableLabel: '1,148 available',
    openSlotsLabel: 'open slots: 1B, SS',
    clockLabel: '0:47 left',
    columns: 2,
    tools: <input aria-label="Search players" />,
    players: PLAYERS,
    fitsOpenSlot: (p) => p.position === '1B' || p.position === 'SS',
    canDraft: true,
    isCommPick: false,
    pickLoading: false,
    loading: false,
    hasMore: false,
    loadingMore: false,
    searchTerm: '',
    onDraftPlayer: jest.fn(),
    onLoadMore: jest.fn(),
    ...overrides,
  };
}

describe('DraftPlayerDock — collapsed bar (LS-10005 AC1)', () => {
  it('shows the pick number, availability count and open slots while collapsed', () => {
    const { getByTestId, getByText } = render(
      <DraftPlayerDock {...makeProps()} />,
    );

    expect(getByTestId('draft-player-dock').getAttribute('data-open')).toBe(
      'false',
    );
    expect(getByText('Your pick · #42')).toBeTruthy();
    expect(getByText('1,148 available · open slots: 1B, SS')).toBeTruthy();
    expect(getByText('0:47 left')).toBeTruthy();
  });

  it('omits the clock when none applies', () => {
    const { queryByText } = render(
      <DraftPlayerDock {...makeProps({ clockLabel: null })} />,
    );
    expect(queryByText('0:47 left')).toBeNull();
  });

  it("offers to browse rather than pick when it is not the viewer's turn", () => {
    const { getByTestId, queryByText } = render(
      <DraftPlayerDock {...makeProps({ canDraft: false })} />,
    );
    expect(getByTestId('draft-player-dock-cta').textContent).toBe(
      'Browse players',
    );
    expect(queryByText('DRAFT')).toBeNull();
  });
});

describe('DraftPlayerDock — expand / collapse (LS-10005 AC2)', () => {
  it('expands from the CTA and collapses from the chevron', () => {
    const { getByTestId } = render(<DraftPlayerDock {...makeProps()} />);
    const dock = getByTestId('draft-player-dock');
    const cta = getByTestId('draft-player-dock-cta');
    const chevron = getByTestId('draft-player-dock-chevron');

    fireEvent.click(cta);
    expect(dock.getAttribute('data-open')).toBe('true');
    expect(cta.getAttribute('aria-expanded')).toBe('true');
    expect(chevron.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(chevron);
    expect(dock.getAttribute('data-open')).toBe('false');
    expect(cta.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands from the chevron too', () => {
    const { getByTestId } = render(<DraftPlayerDock {...makeProps()} />);
    fireEvent.click(getByTestId('draft-player-dock-chevron'));
    expect(getByTestId('draft-player-dock').getAttribute('data-open')).toBe(
      'true',
    );
  });

  it('points both toggles at the body they control', () => {
    const { getByTestId } = render(<DraftPlayerDock {...makeProps()} />);
    const bodyId = getByTestId('draft-player-dock-body').id;

    expect(bodyId).toBeTruthy();
    expect(
      getByTestId('draft-player-dock-cta').getAttribute('aria-controls'),
    ).toBe(bodyId);
    expect(
      getByTestId('draft-player-dock-chevron').getAttribute('aria-controls'),
    ).toBe(bodyId);
  });

  it('keeps the list mounted, and so its scroll position, across a collapse', () => {
    const { getByTestId } = render(<DraftPlayerDock {...makeProps()} />);
    const cta = getByTestId('draft-player-dock-cta');

    fireEvent.click(cta);
    const rows = getByTestId('draft-player-dock-rows');
    rows.scrollTop = 120;

    fireEvent.click(cta); // collapse
    fireEvent.click(cta); // expand again

    expect(getByTestId('draft-player-dock-rows')).toBe(rows);
    expect(rows.scrollTop).toBe(120);
  });

  it('takes the collapsed list out of the tab order', () => {
    const { getByTestId } = render(<DraftPlayerDock {...makeProps()} />);
    const body = getByTestId('draft-player-dock-body');

    expect(body.hasAttribute('inert')).toBe(true);
    fireEvent.click(getByTestId('draft-player-dock-cta'));
    expect(body.hasAttribute('inert')).toBe(false);
  });
});

describe('DraftPlayerDock — rows (LS-10005 AC3)', () => {
  it.each([1, 2, 3] as const)('lays rows out %i-up', (columns) => {
    const { getByTestId } = render(
      <DraftPlayerDock {...makeProps({ columns })} />,
    );
    expect(
      getByTestId('draft-player-dock-rows').getAttribute('data-cols'),
    ).toBe(String(columns));
  });

  it('renders rank, name and sport-aware meta per row', () => {
    const { getByTestId } = render(<DraftPlayerDock {...makeProps()} />);
    const row = getByTestId('draft-player-dock-row-1');

    expect(row.textContent).toContain('14');
    expect(row.textContent).toContain('Lou Gehrig');
    // Lead stat comes from the same STAT_COLUMNS_BY_SPORT formatter the
    // Data Table uses, so both views print it identically.
    expect(row.textContent).toContain('1B · NYY · 0.340 AVG');
  });

  it('highlights rows that fill an open slot', () => {
    const { getByTestId } = render(<DraftPlayerDock {...makeProps()} />);

    expect(getByTestId('draft-player-dock-row-1').className).toContain('fits');
    expect(getByTestId('draft-player-dock-row-3').className).not.toContain(
      'fits',
    );
  });

  it('drafts through the handler it was given', () => {
    const onDraftPlayer = jest.fn();
    const { getByLabelText } = render(
      <DraftPlayerDock {...makeProps({ onDraftPlayer })} />,
    );

    fireEvent.click(getByLabelText('Draft Ernie Banks'));
    expect(onDraftPlayer).toHaveBeenCalledWith(2);
  });

  it('labels a commissioner override as a force pick', () => {
    const { getByLabelText } = render(
      <DraftPlayerDock {...makeProps({ isCommPick: true })} />,
    );
    expect(getByLabelText('Force pick Lou Gehrig').textContent).toBe(
      'FORCE PICK',
    );
  });

  it('disables DRAFT while a pick is in flight', () => {
    const { getByLabelText } = render(
      <DraftPlayerDock {...makeProps({ pickLoading: true })} />,
    );
    expect(
      (getByLabelText('Draft Lou Gehrig') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('loads the next page on demand', () => {
    const onLoadMore = jest.fn();
    const { getByText } = render(
      <DraftPlayerDock {...makeProps({ hasMore: true, onLoadMore })} />,
    );

    fireEvent.click(getByText('Load more players'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('explains an empty search', () => {
    const { getByText } = render(
      <DraftPlayerDock {...makeProps({ players: [], searchTerm: 'zzz' })} />,
    );
    expect(getByText('No players match your search')).toBeTruthy();
  });
});
