/**
 * Web capability-shim regression gate for LS-9206: DraftSquadStrip must render
 * the "My Squad" strip and roster sheet on web (no react-native Pressable
 * dependency) with the same open/close behavior as the native version.
 */
import React from 'react';
import { DraftSquadStrip } from './DraftSquadStrip';
import type { DraftPickRecord, DraftPlayer } from './types';
import { fireEvent, render } from '../../test-utils';

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

const player: DraftPlayer = {
  id: 1,
  name: 'Infielder One',
  position: '1B',
} as DraftPlayer;

describe('DraftSquadStrip (web)', () => {
  it('renders the squad summary and slot count', () => {
    const { getByText } = render(
      <DraftSquadStrip
        myPicks={[pick()]}
        myTeam={[player]}
        statsLookup={new Map([[1, player]])}
        rounds={5}
        teamName="Team One"
        isMyPick={false}
        open={false}
        onOpen={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(getByText('My Squad · 1/5')).toBeTruthy();
  });

  it('calls onOpen when the strip is tapped', () => {
    const onOpen = jest.fn();
    const { getByRole } = render(
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
    fireEvent.click(getByRole('button', { name: /Open roster/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders the full roster sheet and calls onClose when dismissed', () => {
    const onClose = jest.fn();
    const { getByText, getAllByRole } = render(
      <DraftSquadStrip
        myPicks={[pick()]}
        myTeam={[player]}
        statsLookup={new Map([[1, player]])}
        rounds={5}
        teamName="Team One"
        isMyPick={false}
        open={true}
        onOpen={jest.fn()}
        onClose={onClose}
      />,
    );
    expect(getByText('TEAM ONE')).toBeTruthy();
    expect(getByText('Infielder One')).toBeTruthy();

    fireEvent.click(getAllByRole('button', { name: 'Close roster' })[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
