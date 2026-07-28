/**
 * Regression gate for LS-4663:
 * DraftRail must render sport-scoped depth-chart slots and roster-bar fills.
 *
 * - Baseball league (default): keeps today's C / 1B / 2B / 3B / SS / OF / P / UTIL layout.
 * - Football league: 1 QB / 2 RB / 3 WR / 1 TE / 1 K / 1 DEF / 1 FLEX,
 *   with fills sourced from the football position color map.
 */
import React from 'react';
import { DraftRail } from './DraftRail';
import { POSITION_COLORS } from './constants';
import type { DraftPlayer } from './types';
import { fireEvent, render } from '../../test-utils';

jest.mock('./DraftIntelligence', () => ({
  DraftIntelligence: () => <div data-testid="intel" />,
}));
jest.mock('./DraftQueuePanel', () => ({
  DraftQueuePanel: () => <div data-testid="queue" />,
}));

const baseProps = {
  isPremium: false,
  isMyPick: false,
  commPickMode: false,
  isOwner: false,
  isGeneralManager: false,
  draftId: null,
  myTeamId: null,
  currentOverallPick: 0,
  currentPickInfo: {
    draftId: 1,
    teamId: 1,
    pickNumber: 1,
    overallPick: 1,
    round: 1,
    isComplete: false,
  },
  currentPickTeamId: 1,
  currentPickLoadError: null,
  onlineTeamIds: new Set<string>(),
  initDraftLoading: false,
  autoPickDisabled: false,
  myTeam: [],
  positionCounts: {} as Record<string, number>,
  pickHistory: [],
  statsLookup: new Map(),
  teamNameById: () => '',
  chatOpen: false,
  onShowToast: jest.fn(),
  onDraftPlayer: jest.fn(),
  onCommissionerPick: jest.fn(),
  onInitializeDraft: jest.fn(),
  onRetryCurrentPick: jest.fn(),
  onToggleChat: jest.fn(),
  onRefresh: jest.fn(),
};

describe('DraftRail roster depth chart', () => {
  it('renders baseball slot layout by default', () => {
    const { queryByLabelText } = render(<DraftRail {...baseProps} />);
    expect(queryByLabelText('C: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('OF: 0 of 3')).toBeTruthy();
    expect(queryByLabelText('P: 0 of 9')).toBeTruthy();
    expect(queryByLabelText('UTIL: 0 of 2')).toBeTruthy();
    expect(queryByLabelText('QB: 0 of 1')).toBeNull();
  });

  it('renders football slot layout when sport="football"', () => {
    const { queryByLabelText } = render(
      <DraftRail {...baseProps} sport="football" />,
    );
    expect(queryByLabelText('QB: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('RB: 0 of 2')).toBeTruthy();
    expect(queryByLabelText('WR: 0 of 3')).toBeTruthy();
    expect(queryByLabelText('TE: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('K: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('DEF: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('FLEX: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('C: 0 of 1')).toBeNull();
  });

  // LS-4824: mobile-only collapse toggle. Default collapsed so the player
  // pool isn't pushed below the fold on mobile.
  describe('mobile collapse toggle (LS-4824)', () => {
    it('renders collapsed by default with aria-expanded=false', () => {
      const { getByRole, container } = render(<DraftRail {...baseProps} />);
      const toggle = getByRole('button', { name: /draft panel/i });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.getAttribute('aria-controls')).toBe('d-rail-content');
      const aside = container.querySelector('.d-rail');
      expect(aside?.classList.contains('collapsed')).toBe(true);
    });

    it('toggles collapsed/expanded state on click', () => {
      const { getByRole, container } = render(<DraftRail {...baseProps} />);
      const toggle = getByRole('button', { name: /draft panel/i });
      const aside = container.querySelector('.d-rail');

      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(aside?.classList.contains('collapsed')).toBe(false);

      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(aside?.classList.contains('collapsed')).toBe(true);
    });

    it('keeps roster content in the DOM when collapsed (CSS-only hide)', () => {
      // Content stays mounted so React state and accessibility tree are
      // preserved; visibility is controlled by the .collapsed class scoped
      // to the mobile media query in styles.ts.
      const { queryByLabelText } = render(<DraftRail {...baseProps} />);
      expect(queryByLabelText('C: 0 of 1')).toBeTruthy();
      expect(queryByLabelText('P: 0 of 9')).toBeTruthy();
    });
  });

  // LS-8068: drag-to-draft onto an eligible roster slot.
  describe('drag-to-draft', () => {
    const player = (eligiblePositions: string[]): DraftPlayer =>
      ({
        id: 42,
        name: 'Drafty McDraftface',
        position: eligiblePositions[0],
        eligiblePositions,
      }) as DraftPlayer;

    it('drafts the player when dropped on an eligible slot during your turn', () => {
      const onDraftPlayer = jest.fn();
      const { getByLabelText } = render(
        <DraftRail
          {...baseProps}
          isMyPick
          draggedPlayer={player(['SS'])}
          onDraftPlayer={onDraftPlayer}
        />,
      );
      fireEvent.drop(getByLabelText('SS: 0 of 1'));
      expect(onDraftPlayer).toHaveBeenCalledWith(42);
    });

    it('rejects a drop on an ineligible slot with a toast', () => {
      const onDraftPlayer = jest.fn();
      const onShowToast = jest.fn();
      const { getByLabelText } = render(
        <DraftRail
          {...baseProps}
          isMyPick
          draggedPlayer={player(['SS'])}
          onDraftPlayer={onDraftPlayer}
          onShowToast={onShowToast}
        />,
      );
      fireEvent.drop(getByLabelText('C: 0 of 1'));
      expect(onDraftPlayer).not.toHaveBeenCalled();
      expect(onShowToast).toHaveBeenCalledWith(
        expect.stringContaining('eligible'),
      );
    });

    it('rejects a drop when it is not your turn', () => {
      const onDraftPlayer = jest.fn();
      const onShowToast = jest.fn();
      const { getByLabelText } = render(
        <DraftRail
          {...baseProps}
          isMyPick={false}
          draggedPlayer={player(['SS'])}
          onDraftPlayer={onDraftPlayer}
          onShowToast={onShowToast}
        />,
      );
      fireEvent.drop(getByLabelText('SS: 0 of 1'));
      expect(onDraftPlayer).not.toHaveBeenCalled();
      expect(onShowToast).toHaveBeenCalledWith(
        expect.stringContaining('your turn'),
      );
    });

    it('force-picks via commissioner mode when dropped on an eligible slot', () => {
      const onCommissionerPick = jest.fn();
      const onDraftPlayer = jest.fn();
      const { getByLabelText } = render(
        <DraftRail
          {...baseProps}
          isMyPick={false}
          commPickMode
          isOwner
          draggedPlayer={player(['SP'])}
          onCommissionerPick={onCommissionerPick}
          onDraftPlayer={onDraftPlayer}
        />,
      );
      fireEvent.drop(getByLabelText('P: 0 of 9'));
      expect(onCommissionerPick).toHaveBeenCalledWith(42);
      expect(onDraftPlayer).not.toHaveBeenCalled();
    });

    it('highlights eligible slots while a card is being dragged', () => {
      const { getByLabelText } = render(
        <DraftRail {...baseProps} isMyPick draggedPlayer={player(['SS'])} />,
      );
      expect(
        getByLabelText('SS: 0 of 1').classList.contains('drop-eligible'),
      ).toBe(true);
      expect(
        getByLabelText('C: 0 of 1').classList.contains('drop-ineligible'),
      ).toBe(true);
    });
  });

  it('paints roster-bar fills with sport-scoped position colors', () => {
    const { container } = render(
      <DraftRail
        {...baseProps}
        sport="football"
        myTeam={[
          { id: 1, name: 'QB1', position: 'QB' } as never,
          { id: 2, name: 'RB1', position: 'RB' } as never,
        ]}
        positionCounts={{ QB: 1, RB: 1 }}
      />,
    );
    const fills = Array.from(
      container.querySelectorAll<HTMLElement>('.d-pos-progress-fill'),
    );
    const colors = fills.map((f) => f.style.background.toLowerCase());
    // Browsers normalize hex to rgb; assert via inline-style equality after lowercasing.
    expect(
      colors.some(
        (c) =>
          c.includes(POSITION_COLORS.football.QB.toLowerCase()) ||
          c === 'rgb(196, 30, 58)',
      ),
    ).toBe(true);
    expect(
      colors.some(
        (c) =>
          c.includes(POSITION_COLORS.football.RB.toLowerCase()) ||
          c === 'rgb(139, 111, 71)',
      ),
    ).toBe(true);
    // Baseball palette must not bleed into a football rail.
    expect(
      colors.every(
        (c) => !c.includes(POSITION_COLORS.baseball['1B'].toLowerCase()),
      ),
    ).toBe(true);
  });
});

// LS-8783: current-pick edge states, League Chat, and Refresh moved from
// DraftSidebar into the rail as part of the top-band + main + rail restructure.
describe('DraftRail current-pick panel and actions (LS-8783)', () => {
  it('does not render the current-pick panel once currentPickInfo resolves', () => {
    const { queryByText } = render(<DraftRail {...baseProps} />);
    expect(queryByText('Draft Order Pending')).toBeNull();
    expect(queryByText('Pick Load Error')).toBeNull();
  });

  it('shows the retry affordance when the current pick fails to load', () => {
    const onRetryCurrentPick = jest.fn();
    const { getByText } = render(
      <DraftRail
        {...baseProps}
        currentPickInfo={null}
        currentPickLoadError="boom"
        onRetryCurrentPick={onRetryCurrentPick}
      />,
    );
    fireEvent.click(getByText('Retry'));
    expect(onRetryCurrentPick).toHaveBeenCalledTimes(1);
  });

  it('shows draft-order init buttons for the owner when currentPickInfo is null and no picks exist', () => {
    const onInitializeDraft = jest.fn();
    const { getByText } = render(
      <DraftRail
        {...baseProps}
        currentPickInfo={null}
        isOwner
        onInitializeDraft={onInitializeDraft}
      />,
    );
    fireEvent.click(getByText('Generate Snake Order'));
    expect(onInitializeDraft).toHaveBeenCalledWith('snake');
  });

  it('toggles league chat via the League Chat button', () => {
    const onToggleChat = jest.fn();
    const { getByLabelText } = render(
      <DraftRail {...baseProps} chatOpen={false} onToggleChat={onToggleChat} />,
    );
    fireEvent.click(getByLabelText('League chat closed'));
    expect(onToggleChat).toHaveBeenCalledTimes(1);
  });

  it('calls onRefresh via the Refresh button', () => {
    const onRefresh = jest.fn();
    const { getByText } = render(
      <DraftRail {...baseProps} onRefresh={onRefresh} />,
    );
    fireEvent.click(getByText('Refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
