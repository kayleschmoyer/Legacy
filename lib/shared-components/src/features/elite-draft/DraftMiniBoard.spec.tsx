/**
 * Web capability-shim regression gate for LS-9206: DraftMiniBoard must render
 * the team x round grid on web (no react-native Pressable dependency) with
 * tap-to-inspect behavior matching the native version.
 */
import React from 'react';
import { DraftMiniBoard } from './DraftMiniBoard';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { fireEvent, render } from '../../test-utils';

const teams: LeagueTeam[] = [
  { id: '1', name: 'Team One', leagueId: 1 },
  { id: '2', name: 'Team Two', leagueId: 1 },
];

const pick = (overrides: Partial<DraftPickRecord> = {}): DraftPickRecord => ({
  id: '1',
  draftId: 1,
  round: 1,
  pickNumber: 1,
  overallPick: 1,
  pickedAt: '2026-01-01T00:00:00.000Z',
  teamId: 1,
  playerId: 1,
  ...overrides,
});

describe('DraftMiniBoard (web)', () => {
  it('returns null when there are no teams', () => {
    const { container } = render(
      <DraftMiniBoard
        teams={[]}
        picks={[]}
        currentPickInfo={null}
        myTeamId={null}
        statsLookup={new Map()}
        rounds={5}
      />,
    );
    expect(container.textContent).toBe('');
  });

  it('renders the default inspect hint, and updates the caption when a cell is tapped', () => {
    const statsLookup = new Map<number, DraftPlayer>([
      [1, { id: 1, name: 'Infielder One', position: '1B' } as DraftPlayer],
    ]);
    const { getByText, getByRole } = render(
      <DraftMiniBoard
        teams={teams}
        picks={[pick({ teamId: 1, playerId: 1 })]}
        currentPickInfo={null}
        myTeamId={1}
        statsLookup={statsLookup}
        rounds={1}
      />,
    );

    expect(
      getByText(/Tap a cell to inspect a pick\. Gold column is your team\./),
    ).toBeTruthy();

    const cell = getByRole('button', {
      name: /R1 · Team One — Infielder One \(1B\)/,
    });
    fireEvent.click(cell);
    expect(getByText(/R1 · Team One — Infielder One \(1B\)/)).toBeTruthy();
  });
});
