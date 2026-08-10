/**
 * DraftSquadStrip (native, LS-9244) — the roster sheet must split into a
 * "Roster" tab (round/position slots) and a "Draft Picks" tab (picks ordered
 * by overall pick number) instead of merging both into one list.
 */
import React from 'react';
import { DraftSquadStrip } from './DraftSquadStrip.native';
import type { DraftPickRecord, DraftPlayer } from './types';
import { fireEvent, render, screen } from '../../test-utils';

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

const player = (overrides: Partial<DraftPlayer> = {}): DraftPlayer =>
  ({
    id: 1,
    name: 'Infielder One',
    position: '1B',
    ...overrides,
  }) as DraftPlayer;

describe('DraftSquadStrip (native)', () => {
  it('renders the squad summary and slot count on the collapsed strip', () => {
    render(
      <DraftSquadStrip
        myPicks={[pick()]}
        myTeam={[player()]}
        statsLookup={new Map([[1, player()]])}
        rounds={5}
        teamName="Team One"
        isMyPick={false}
        open={false}
        onOpen={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText('My Squad · 1/5')).toBeTruthy();
  });

  it('defaults to the Roster tab and shows round/position slots without pick numbers', () => {
    render(
      <DraftSquadStrip
        myPicks={[pick({ id: '1', round: 1, overallPick: 3, playerId: 1 })]}
        myTeam={[player()]}
        statsLookup={new Map([[1, player()]])}
        rounds={2}
        teamName="Team One"
        isMyPick={false}
        open={true}
        onOpen={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Roster' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Draft Picks' })).toBeTruthy();
    expect(screen.getByText('Infielder One')).toBeTruthy();
    expect(screen.getByText('Rd 1')).toBeTruthy();
    // Round-slot row no longer inlines the pick number — that detail lives on the Draft Picks tab.
    expect(screen.queryByText(/Pick #3/)).toBeNull();
  });

  it('switches to the Draft Picks tab and lists picks ordered by overall pick number', () => {
    render(
      <DraftSquadStrip
        myPicks={[
          pick({ id: '2', round: 2, overallPick: 15, playerId: 2 }),
          pick({ id: '1', round: 1, overallPick: 3, playerId: 1 }),
        ]}
        myTeam={[
          player(),
          player({ id: 2, name: 'Outfielder Two', position: 'OF' }),
        ]}
        statsLookup={
          new Map([
            [1, player()],
            [2, player({ id: 2, name: 'Outfielder Two', position: 'OF' })],
          ])
        }
        rounds={5}
        teamName="Team One"
        isMyPick={false}
        open={true}
        onOpen={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Draft Picks' }));

    const names = screen.getAllByText(/Infielder One|Outfielder Two/);
    expect(names.map((n) => n.textContent)).toEqual([
      'Infielder One',
      'Outfielder Two',
    ]);
    expect(screen.getByText('#3')).toBeTruthy();
    expect(screen.getByText('#15')).toBeTruthy();
  });

  it('shows an empty state on the Draft Picks tab when no picks have been made', () => {
    render(
      <DraftSquadStrip
        myPicks={[]}
        myTeam={[]}
        statsLookup={new Map()}
        rounds={5}
        teamName="Team One"
        isMyPick={false}
        open={true}
        onOpen={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Draft Picks' }));
    expect(screen.getByText('No picks made yet.')).toBeTruthy();
  });

  it('calls onOpen when the strip is tapped', () => {
    const onOpen = jest.fn();
    // Neither the mobile nor web jest project's react-native mock exposes
    // Pressable's accessibilityLabel as a queryable DOM attribute the same
    // way, so target the sole rendered button by role instead (portable
    // across both shared-components:mobile and shared-components:web).
    const { getAllByRole } = render(
      <DraftSquadStrip
        myPicks={[]}
        myTeam={[]}
        statsLookup={new Map()}
        rounds={5}
        teamName="Team One"
        isMyPick={false}
        open={false}
        onOpen={onOpen}
        onClose={jest.fn()}
      />,
    );
    fireEvent.click(getAllByRole('button')[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the sheet is dismissed', () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <DraftSquadStrip
        myPicks={[pick()]}
        myTeam={[player()]}
        statsLookup={new Map([[1, player()]])}
        rounds={5}
        teamName="Team One"
        isMyPick={false}
        open={true}
        onOpen={jest.fn()}
        onClose={onClose}
      />,
    );
    expect(getByText('TEAM ONE')).toBeTruthy();
    // The "✕" close affordance is unambiguous by text content and portable
    // across both jest projects' react-native mocks.
    const closeButton = getByText('✕').closest('button');
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
