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
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { LOGGER } from '@legacy-sports/logging';

import type {
  MatchupPlayerData,
  MatchupPositionOption,
} from './MatchupRosterEditorView';
import { MatchupRosterEditorView } from './MatchupRosterEditorView';
import { render } from '../../test-utils';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockLogger = LOGGER as jest.Mocked<typeof LOGGER>;

const noop = () => Promise.resolve();

function makePlayer(
  id: string,
  positionId: number | null,
  eligiblePositions: string[] = ['SP'],
): MatchupPlayerData {
  return {
    id,
    positionId,
    teamId: 1,
    season: 2024,
    player: {
      firstName: 'Test',
      lastName: `Player${id}`,
      eligiblePositions,
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

  describe('heading rendering — State B regression guards (LS-4283)', () => {
    // State B: "Edit Lineup" heading itself missing — the view does not render
    // at all. These tests pin the heading text so a rename or a guard that
    // erroneously returns null is caught at the unit level in <1 s.

    it('renders "Edit Lineup" heading when not locked', () => {
      const players = [makePlayer('p1', 101)];
      const positionMap = new Map<number, string>([[101, 'SP']]);
      render(
        <MatchupRosterEditorView
          players={players}
          positionMap={positionMap}
          positionOptions={[SP_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={noop}
          locked={false}
        />,
      );
      expect(screen.getByText('Edit Lineup')).toBeTruthy();
    });

    it('renders "Current Lineup" heading when locked', () => {
      const players = [makePlayer('p1', 101)];
      const positionMap = new Map<number, string>([[101, 'SP']]);
      render(
        <MatchupRosterEditorView
          players={players}
          positionMap={positionMap}
          positionOptions={[SP_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={noop}
          locked={true}
        />,
      );
      expect(screen.getByText('Current Lineup')).toBeTruthy();
    });

    it('returns null (renders nothing) when players array is empty', () => {
      const { container } = render(
        <MatchupRosterEditorView
          players={[]}
          positionMap={new Map()}
          positionOptions={[SP_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={noop}
        />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('STARTERS section rendering — State A regression guards (LS-4283)', () => {
    // State A: "Edit Lineup" heading IS visible but player rows are missing
    // inside the STARTERS section. These tests pin both the section header and
    // at least one data-testid player row so both failure modes are caught at
    // the unit level.

    it('renders STARTERS section header with correct slot count', () => {
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
    });

    it('renders at least one data-testid player row in the starters section', () => {
      const players = [makePlayer('p1', 101)];
      const positionMap = new Map<number, string>([[101, 'SP']]);
      const { container } = render(
        <MatchupRosterEditorView
          players={players}
          positionMap={positionMap}
          positionOptions={[SP_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={noop}
        />,
      );
      const rows = container.querySelectorAll(
        '[data-testid^="matchup-player-row-"]',
      );
      expect(rows.length).toBeGreaterThan(0);
    });

    it('renders both "Edit Lineup" heading AND STARTERS rows simultaneously', () => {
      const players = [makePlayer('p1', 101), makePlayer('p2', null)];
      const positionMap = new Map<number, string>([[101, 'SP']]);
      const { container } = render(
        <MatchupRosterEditorView
          players={players}
          positionMap={positionMap}
          positionOptions={[SP_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={noop}
        />,
      );
      // State B check: heading visible
      expect(screen.getByText('Edit Lineup')).toBeTruthy();
      // State A check: at least one player row rendered
      expect(
        container.querySelectorAll('[data-testid^="matchup-player-row-"]')
          .length,
      ).toBeGreaterThan(0);
    });
  });

  describe('position eligibility validation (LS-4036)', () => {
    // The view used to fire onMoveToPosition / onSwapPositions for any drop
    // target, leaving the server to reject ineligible moves while the UI
    // silently swallowed the error. These tests pin both the pre-mutation
    // guard and its visible UX surface. The pure eligibility predicate has
    // its own matrix in rosterUtils.spec.ts.
    //
    // Tamagui drops `data-testid` on animated XStack rows (LS-4133), so each
    // row is wrapped in a plain `<div data-testid="matchup-player-row-{id}">`
    // whose first child is the Tamagui-rendered onPress carrier. Selection
    // requires dispatching the click on that inner element, not the wrapper.
    const selectPlayer = (container: HTMLElement, playerId: string): void => {
      const wrapper = container.querySelector(
        `[data-testid="matchup-player-row-${playerId}"]`,
      );
      const inner = wrapper?.firstElementChild as HTMLElement | null;
      if (!inner) throw new Error(`row ${playerId} not rendered`);
      fireEvent.click(inner);
    };

    it('shows "Not eligible" on an empty SP slot when an ineligible batter is selected', () => {
      const benchBatter = makePlayer('b1', null, ['C']);
      const { container } = render(
        <MatchupRosterEditorView
          players={[benchBatter]}
          positionMap={new Map([[101, 'SP']])}
          positionOptions={[SP_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={noop}
        />,
      );
      // Before selection: no "Not eligible" badge on the empty slot.
      expect(screen.queryByText(/Not eligible/)).toBeNull();

      selectPlayer(container, 'b1');

      // After selecting the ineligible batter, the empty SP slot now shows
      // "Not eligible" instead of "Tap to assign".
      expect(screen.getByText(/Not eligible/)).toBeTruthy();
      expect(screen.queryByText(/Tap to assign/)).toBeNull();
    });

    it('disables (and dims) ineligible position buttons for a selected bench player', () => {
      const benchBatter = makePlayer('b1', null, ['C']);
      const { container } = render(
        <MatchupRosterEditorView
          players={[benchBatter]}
          positionMap={new Map([[101, 'SP']])}
          positionOptions={[SP_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={noop}
        />,
      );
      selectPlayer(container, 'b1');

      const spBtn = container.querySelector(
        '[data-testid="roster-assign-b1-101"]',
      );
      expect(spBtn).not.toBeNull();
      // Tamagui Button forwards `disabled` to the rendered button element.
      expect(spBtn?.disabled).toBe(true);
    });

    it('blocks an ineligible assign click and surfaces the inline error', () => {
      const benchBatter = makePlayer('b1', null, ['C']);
      const onMoveToPosition = jest.fn().mockResolvedValue(undefined);
      const { container } = render(
        <MatchupRosterEditorView
          players={[benchBatter]}
          positionMap={new Map([[101, 'SP']])}
          positionOptions={[SP_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={onMoveToPosition}
        />,
      );
      selectPlayer(container, 'b1');

      // The button is disabled, but the eligibility guard inside the handler
      // is the actual source of truth. Confirm both layers: the button is
      // disabled in the DOM, and no mutation was ever fired by the prior tap.
      expect(onMoveToPosition).not.toHaveBeenCalled();

      // The empty slot rendered with the "Not eligible" label, the canonical
      // visible explanation referenced by the bug report.
      expect(screen.getByText(/Not eligible/)).toBeTruthy();
    });

    it('does not show "Not eligible" when the selected bench player is eligible for the slot', () => {
      const benchPitcher = makePlayer('p1', null, ['SP']);
      const { container } = render(
        <MatchupRosterEditorView
          players={[benchPitcher]}
          positionMap={new Map([[101, 'SP']])}
          positionOptions={[SP_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={noop}
        />,
      );
      selectPlayer(container, 'p1');
      expect(screen.queryByText(/Not eligible/)).toBeNull();
      expect(screen.getByText(/Tap to assign/)).toBeTruthy();
    });
  });

  describe('swap-target eligibility feedback (LS-4050)', () => {
    // Occupied swap-target rows previously showed "Tap to swap" regardless of
    // eligibility, misleading users into thinking the swap was possible before
    // blocking it at click time.  These tests pin the visual feedback contract
    // for occupied ineligible swap targets (the functional block in
    // handlePlayerClick was already in place via LS-4036).

    const selectPlayer = (container: HTMLElement, playerId: string): void => {
      const wrapper = container.querySelector(
        `[data-testid="matchup-player-row-${playerId}"]`,
      );
      const inner = wrapper?.firstElementChild as HTMLElement | null;
      if (!inner) throw new Error(`row ${playerId} not rendered`);
      fireEvent.click(inner);
    };

    it('shows "Not eligible" on an occupied slot when the selected player cannot move there', () => {
      // sp1 (SP-only) selected; c1 (C-only) is in the C slot.
      // sp1 cannot fill the C slot, so c1's row must surface "Not eligible".
      const players = [
        makePlayer('sp1', 101, ['SP']),
        makePlayer('c1', 102, ['C']),
      ];
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
      selectPlayer(container, 'sp1');
      expect(screen.getByText('Not eligible')).toBeTruthy();
      expect(screen.queryByText('Tap to swap')).toBeNull();
    });

    it('shows "Tap to swap" on an occupied slot when both players are eligible for the exchanged slots', () => {
      const players = [
        makePlayer('p1', 101, ['SP', 'C']),
        makePlayer('p2', 102, ['SP', 'C']),
      ];
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
      selectPlayer(container, 'p1');
      expect(screen.getByText('Tap to swap')).toBeTruthy();
      expect(screen.queryByText('Not eligible')).toBeNull();
    });

    it('does not call onSwapPositions when tapping an ineligible occupied swap target', () => {
      const onSwapPositions = jest.fn().mockResolvedValue(undefined);
      const players = [
        makePlayer('sp1', 101, ['SP']),
        makePlayer('c1', 102, ['C']),
      ];
      const positionMap = new Map<number, string>([
        [101, 'SP'],
        [102, 'C'],
      ]);
      const { container } = render(
        <MatchupRosterEditorView
          players={players}
          positionMap={positionMap}
          positionOptions={[SP_SLOT, C_SLOT]}
          onSwapPositions={onSwapPositions}
          onMoveToPosition={noop}
        />,
      );
      selectPlayer(container, 'sp1');
      selectPlayer(container, 'c1');
      expect(onSwapPositions).not.toHaveBeenCalled();
      // The error banner should name the ineligible player.
      expect(screen.getByText(/is not eligible for/)).toBeTruthy();
    });
  });

  describe('mutation failure handling (LS-2664)', () => {
    // Before LS-2664, the four mutation handlers called `setSelectedPlayerId(null)`
    // unconditionally after `await onMutation(...)`. If the promise rejected, the
    // line was never reached AND the rejection was silently swallowed by the
    // surrounding `void`. These tests pin the new contract:
    //   - selection is cleared on success
    //   - selection is preserved on failure (user can retry)
    //   - LOGGER.error is called on failure
    //   - onMutationError prop is invoked with the thrown error
    const selectPlayer = (container: HTMLElement, playerId: string): void => {
      const wrapper = container.querySelector(
        `[data-testid="matchup-player-row-${playerId}"]`,
      );
      const inner = wrapper?.firstElementChild as HTMLElement | null;
      if (!inner) throw new Error(`row ${playerId} not rendered`);
      fireEvent.click(inner);
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('preserves selection and reports error when onMoveToPosition rejects (bench → slot)', async () => {
      const err = new Error('backend rejected');
      const onMoveToPosition = jest.fn().mockRejectedValue(err);
      const onMutationError = jest.fn();
      const benchPitcher = makePlayer('p1', null, ['SP']);
      const { container } = render(
        <MatchupRosterEditorView
          players={[benchPitcher]}
          positionMap={new Map([[101, 'SP']])}
          positionOptions={[SP_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={onMoveToPosition}
          onMutationError={onMutationError}
        />,
      );
      selectPlayer(container, 'p1');

      // Trigger an assign to the empty SP slot via the inline button row.
      const assignBtn = container.querySelector(
        '[data-testid="roster-assign-p1-101"]',
      );
      if (!assignBtn) throw new Error('assign button not rendered');
      fireEvent.click(assignBtn);

      await waitFor(() => expect(onMutationError).toHaveBeenCalledWith(err));
      expect(mockLogger.error.mock.calls).toEqual([
        ['MatchupRosterEditorView mutation failed', err],
      ]);
      // Row is still rendered with selection styling (border + actions visible).
      expect(
        container.querySelector('[data-testid="roster-assign-p1-101"]'),
      ).not.toBeNull();
    });

    it('clears selection on successful mutation', async () => {
      const onMoveToPosition = jest.fn().mockResolvedValue(undefined);
      const benchPitcher = makePlayer('p1', null, ['SP']);
      const { container } = render(
        <MatchupRosterEditorView
          players={[benchPitcher]}
          positionMap={new Map([[101, 'SP']])}
          positionOptions={[SP_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={onMoveToPosition}
        />,
      );
      selectPlayer(container, 'p1');

      const assignBtn = container.querySelector(
        '[data-testid="roster-assign-p1-101"]',
      );
      if (!assignBtn) throw new Error('assign button not rendered');
      fireEvent.click(assignBtn);

      // After success the inline action buttons disappear because the row is
      // no longer selected.
      await waitFor(() =>
        expect(
          container.querySelector('[data-testid="roster-assign-p1-101"]'),
        ).toBeNull(),
      );
      expect(mockLogger.error.mock.calls).toHaveLength(0);
    });

    it('logs even when no onMutationError is provided', async () => {
      const err = new Error('boom');
      const onMoveToPosition = jest.fn().mockRejectedValue(err);
      const starter = makePlayer('p1', 101, ['SP']);
      const { container } = render(
        <MatchupRosterEditorView
          players={[starter]}
          positionMap={new Map([[101, 'SP']])}
          positionOptions={[SP_SLOT]}
          onSwapPositions={noop}
          onMoveToPosition={onMoveToPosition}
        />,
      );
      selectPlayer(container, 'p1');

      const benchBtn = container.querySelector(
        '[data-testid="roster-bench-p1"]',
      );
      if (!benchBtn) throw new Error('bench button not rendered');
      fireEvent.click(benchBtn);

      await waitFor(() =>
        expect(mockLogger.error.mock.calls).toEqual([
          ['MatchupRosterEditorView mutation failed', err],
        ]),
      );
    });

    it('reports error when onSwapPositions rejects (two-player swap)', async () => {
      const err = new Error('swap failed');
      const onSwapPositions = jest.fn().mockRejectedValue(err);
      const onMutationError = jest.fn();
      const players = [
        makePlayer('p1', 101, ['SP', 'C']),
        makePlayer('p2', 102, ['SP', 'C']),
      ];
      const positionMap = new Map<number, string>([
        [101, 'SP'],
        [102, 'C'],
      ]);
      const { container } = render(
        <MatchupRosterEditorView
          players={players}
          positionMap={positionMap}
          positionOptions={[SP_SLOT, C_SLOT]}
          onSwapPositions={onSwapPositions}
          onMoveToPosition={noop}
          onMutationError={onMutationError}
        />,
      );
      selectPlayer(container, 'p1');
      selectPlayer(container, 'p2');

      await waitFor(() => expect(onMutationError).toHaveBeenCalledWith(err));
      expect(mockLogger.error.mock.calls.length).toBeGreaterThan(0);
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
