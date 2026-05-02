/**
 * Unit tests for MatchupRosterEditorView rendering contracts.
 *
 * The view is purely presentational — it renders starters/bench based entirely
 * on the props it receives.  These tests pin the prop-to-render contract so that
 * a regression (e.g. the data-fetching wrapper passing empty positionOptions
 * before the positions query resolves) is caught at the unit level before E2E.
 * See LS-3852 for the original race-condition fix in MatchupRosterEditor.tsx.
 */
import React from 'react';
import { screen } from '@testing-library/react';

import type {
  MatchupPlayerData,
  MatchupPositionOption,
} from './MatchupRosterEditorView';
import { MatchupRosterEditorView } from './MatchupRosterEditorView';
import { render } from '../../test-utils';

const noop = () => Promise.resolve();

function makePlayer(id: string, positionId: number | null): MatchupPlayerData {
  return {
    id,
    positionId,
    teamId: 1,
    season: 2024,
    player: {
      firstName: 'Test',
      lastName: `Player${id}`,
      eligiblePositions: ['SP'],
    },
  };
}

const SP_SLOT: MatchupPositionOption = { id: 101, type: 'SP' };
const C_SLOT: MatchupPositionOption = { id: 102, type: 'C' };

describe('MatchupRosterEditorView', () => {
  describe('with empty positionOptions', () => {
    it('shows STARTERS (0/0) and hides players that have a positionId', () => {
      // When positionOptions=[] the sortedSlots array is empty, so no starter
      // rows render even if players carry a non-null positionId.  This is the
      // defensive-prop invariant that MatchupRosterEditor.tsx's positionsLoading
      // guard enforces: the view should never receive empty positionOptions once
      // real players are present.
      const players = [makePlayer('p1', 101), makePlayer('p2', 102)];
      render(
        <MatchupRosterEditorView
          players={players}
          positionMap={new Map()}
          positionOptions={[]}
          onSwapPositions={noop}
          onMoveToPosition={noop}
        />,
      );
      expect(screen.getByText(/STARTERS \(0\/0\)/)).toBeTruthy();
      // Players with non-null positionId are not in BENCH (positionId !== null)
      // and not in STARTERS (no matching slot) — they don't appear at all.
      expect(screen.queryByText('Test Playerp1')).toBeNull();
    });
  });

  describe('with populated positionOptions', () => {
    it('shows players in STARTERS when their positionId matches a slot', () => {
      const players = [makePlayer('p1', 101), makePlayer('p2', 102)];
      const positionMap = new Map<number, string>([
        [101, 'SP'],
        [102, 'C'],
      ]);
      render(
        <MatchupRosterEditorView
          players={players}
          positionMap={positionMap}
          positionOptions={[SP_SLOT, C_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={noop}
        />,
      );
      expect(screen.getByText(/STARTERS \(2\/2\)/)).toBeTruthy();
      expect(screen.getByText('Test Playerp1')).toBeTruthy();
      expect(screen.getByText('Test Playerp2')).toBeTruthy();
    });

    it('puts bench players (positionId null) in BENCH', () => {
      const players = [makePlayer('p1', null), makePlayer('p2', null)];
      render(
        <MatchupRosterEditorView
          players={players}
          positionMap={new Map()}
          positionOptions={[SP_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={noop}
        />,
      );
      expect(screen.getByText(/BENCH \(2\)/)).toBeTruthy();
      expect(screen.getByText('Test Playerp1')).toBeTruthy();
      expect(screen.getByText('Test Playerp2')).toBeTruthy();
    });
  });

  describe('player row data-testid attribute (LS-4133)', () => {
    // Tamagui forwards `testID` to react-native-web on web, but in this app's
    // version it is dropped on a styled XStack with `onPress` — the rendered
    // element ends up with no `data-testid`. The view sets `data-testid`
    // directly on each row so Playwright's `getByTestId(/^matchup-player-row-/)`
    // resolves on the live web build.  This test fails the moment the explicit
    // `data-testid` is removed, catching the E2E regression in <1s.
    it('emits data-testid="matchup-player-row-{id}" on each starter row', () => {
      const players = [makePlayer('p1', 101), makePlayer('p2', 102)];
      const positionMap = new Map<number, string>([
        [101, 'SP'],
        [102, 'C'],
      ]);
      const { container } = render(
        <MatchupRosterEditorView
          players={players}
          positionMap={positionMap}
          positionOptions={[SP_SLOT, C_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={noop}
        />,
      );
      const ids = Array.from(
        container.querySelectorAll('[data-testid^="matchup-player-row-"]'),
      ).map((el) => el.getAttribute('data-testid'));
      expect(ids).toEqual(
        expect.arrayContaining([
          'matchup-player-row-p1',
          'matchup-player-row-p2',
        ]),
      );
    });

    it('emits data-testid on bench rows as well', () => {
      const players = [makePlayer('b1', null)];
      const { container } = render(
        <MatchupRosterEditorView
          players={players}
          positionMap={new Map()}
          positionOptions={[SP_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={noop}
        />,
      );
      expect(
        container.querySelector('[data-testid="matchup-player-row-b1"]'),
      ).not.toBeNull();
    });
  });
});
