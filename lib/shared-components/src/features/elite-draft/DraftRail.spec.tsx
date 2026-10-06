/**
 * Regression gate for LS-4663 / LS-10501:
 * DraftRail's My Roster bars must follow the league's configured roster slots
 * — the same `buildRosterSlotInstances` derivation the depth chart and the
 * Positions Drafted strip use — never a hard-coded per-sport template. That
 * covers bench, IDP and Superflex slots, and mock drafts (sport defaults from
 * `draftRoom.rules`, since a mock draft has no `league_positions`).
 */
import React from 'react';
import { getDefaultRosterPositions } from '@legacy-sports/utils';
import { DraftRail } from './DraftRail';
import { buildRosterSlotInstances, rosterSlotTypeCounts } from './rosterSlots';
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
  controlAllTeams: false,
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
  myTeam: [] as DraftPlayer[],
  leaguePositions: getDefaultRosterPositions('baseball').map(
    (positionType) => ({ positionType }),
  ),
  maxRosterSize: 25 as number | null,
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
  const slots = (...types: string[]) =>
    types.map((positionType) => ({ positionType }));

  it('renders the baseball league config, with SP/RP collapsed into P and a bench', () => {
    const { queryByLabelText, getByText } = render(
      <DraftRail {...baseProps} />,
    );
    expect(queryByLabelText('C: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('OF: 0 of 3')).toBeTruthy();
    expect(queryByLabelText('DH: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('P: 0 of 8')).toBeTruthy();
    expect(queryByLabelText('BN: 0 of 8')).toBeTruthy();
    expect(queryByLabelText('UTIL: 0 of 2')).toBeNull();
    expect(queryByLabelText('QB: 0 of 1')).toBeNull();
    expect(getByText('0 / 25')).toBeTruthy();
  });

  it('follows a custom baseball roster instead of the old template', () => {
    const { queryByLabelText, getByText } = render(
      <DraftRail
        {...baseProps}
        leaguePositions={slots('C', 'C', 'SS', 'OF', 'SP', 'SP', 'RP')}
        maxRosterSize={10}
      />,
    );
    expect(queryByLabelText('C: 0 of 2')).toBeTruthy();
    expect(queryByLabelText('OF: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('P: 0 of 3')).toBeTruthy();
    expect(queryByLabelText('BN: 0 of 3')).toBeTruthy();
    expect(queryByLabelText('1B: 0 of 1')).toBeNull();
    expect(getByText('0 / 10')).toBeTruthy();
  });

  // The QA report: QB1 RB2 WR2 TE1 K1 DST1 FLEX1 + BN6 = 15, while the rail
  // used to show the hard-coded "0/10, WR 0/3, DEF 0/1" with no bench.
  it('renders the football league config (LS-10501 QA league), DST label and bench included', () => {
    const { queryByLabelText, getByText } = render(
      <DraftRail
        {...baseProps}
        sport="football"
        leaguePositions={slots(
          'QB',
          'RB',
          'RB',
          'WR',
          'WR',
          'TE',
          'K',
          'DST',
          'FLEX',
        )}
        maxRosterSize={15}
      />,
    );
    expect(queryByLabelText('QB: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('RB: 0 of 2')).toBeTruthy();
    expect(queryByLabelText('WR: 0 of 2')).toBeTruthy();
    expect(queryByLabelText('TE: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('K: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('DST: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('FLEX: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('BN: 0 of 6')).toBeTruthy();
    expect(queryByLabelText('DEF: 0 of 1')).toBeNull();
    expect(queryByLabelText('WR: 0 of 3')).toBeNull();
    expect(getByText('0 / 15')).toBeTruthy();
  });

  it('renders IDP and Superflex slots from the league config', () => {
    const { queryByLabelText } = render(
      <DraftRail
        {...baseProps}
        sport="football"
        leaguePositions={slots('QB', 'SFLEX', 'DL', 'DL', 'LB', 'DB')}
        maxRosterSize={8}
      />,
    );
    expect(queryByLabelText('SFLEX: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('DL: 0 of 2')).toBeTruthy();
    expect(queryByLabelText('LB: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('DB: 0 of 1')).toBeTruthy();
    expect(queryByLabelText('BN: 0 of 2')).toBeTruthy();
    expect(queryByLabelText('DST: 0 of 1')).toBeNull();
  });

  // A mock draft has no league_positions; useDraftQueries hands the rail the
  // sport defaults from draftRoom.rules instead (covered in
  // useDraftQueries.spec.ts), and maxRosterSize may be null.
  it.each(['baseball', 'football'] as const)(
    'renders the %s sport defaults for a mock draft',
    (sport) => {
      const leaguePositions = getDefaultRosterPositions(sport).map(
        (positionType) => ({ positionType }),
      );
      const { getAllByRole, getByText } = render(
        <DraftRail
          {...baseProps}
          sport={sport}
          leaguePositions={leaguePositions}
          maxRosterSize={null}
        />,
      );
      const expected = rosterSlotTypeCounts(
        buildRosterSlotInstances(leaguePositions, [], sport, null),
      );
      const rows = getAllByRole('listitem').filter((el) =>
        /: \d+ of \d+$/.test(el.getAttribute('aria-label') ?? ''),
      );
      expect(rows.map((el) => el.getAttribute('aria-label'))).toEqual(
        expected.map(
          (r) =>
            `${r.positionType === 'BENCH' ? 'BN' : r.positionType}: 0 of ${r.total}`,
        ),
      );
      const total = expected.reduce((sum, r) => sum + r.total, 0);
      expect(getByText(`0 / ${total}`)).toBeTruthy();
    },
  );

  it('fills bars from the same slot assignment as the depth chart', () => {
    const team = [
      { id: 1, name: 'WR A', position: 'WR', eligiblePositions: ['WR'] },
      { id: 2, name: 'WR B', position: 'WR', eligiblePositions: ['WR'] },
      { id: 3, name: 'WR C', position: 'WR', eligiblePositions: ['WR'] },
      { id: 4, name: 'WR D', position: 'WR', eligiblePositions: ['WR'] },
    ] as DraftPlayer[];
    const { queryByLabelText, getByText } = render(
      <DraftRail
        {...baseProps}
        sport="football"
        myTeam={team}
        leaguePositions={slots('QB', 'WR', 'WR', 'FLEX')}
        maxRosterSize={6}
      />,
    );
    // Two WR slots, the third WR spills into FLEX, the fourth onto the bench.
    expect(queryByLabelText('WR: 2 of 2')).toBeTruthy();
    expect(queryByLabelText('FLEX: 1 of 1')).toBeTruthy();
    expect(queryByLabelText('BN: 1 of 2')).toBeTruthy();
    expect(queryByLabelText('QB: 0 of 1')).toBeTruthy();
    expect(getByText('4 / 6')).toBeTruthy();
  });

  // LS-4824: mobile-only collapse toggle. Default collapsed so the player
  // pool isn't pushed below the fold on mobile.
  describe('mobile collapse toggle (LS-4824)', () => {
    it('renders collapsed by default with aria-expanded=false', () => {
      const { getByRole, getByTestId } = render(<DraftRail {...baseProps} />);
      const toggle = getByRole('button', { name: /draft panel/i });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.getAttribute('aria-controls')).toBe('d-rail-content');
      const aside = getByTestId('draft-rail');
      expect(aside.getAttribute('data-collapsed')).toBe('true');
    });

    it('toggles collapsed/expanded state on click', () => {
      const { getByRole, getByTestId } = render(<DraftRail {...baseProps} />);
      const toggle = getByRole('button', { name: /draft panel/i });
      const aside = getByTestId('draft-rail');

      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(aside.getAttribute('data-collapsed')).toBe('false');

      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(aside.getAttribute('data-collapsed')).toBe('true');
    });

    it('keeps roster content in the DOM when collapsed (CSS-only hide)', () => {
      // Content stays mounted so React state and accessibility tree are
      // preserved; visibility is controlled by the .collapsed class scoped
      // to the mobile media query in styles.ts.
      const { queryByLabelText } = render(<DraftRail {...baseProps} />);
      expect(queryByLabelText('C: 0 of 1')).toBeTruthy();
      expect(queryByLabelText('P: 0 of 8')).toBeTruthy();
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
      fireEvent.drop(getByLabelText('P: 0 of 8'));
      expect(onCommissionerPick).toHaveBeenCalledWith(42);
      expect(onDraftPlayer).not.toHaveBeenCalled();
    });

    it('highlights eligible slots while a card is being dragged', () => {
      const { getByLabelText } = render(
        <DraftRail {...baseProps} isMyPick draggedPlayer={player(['SS'])} />,
      );
      expect(getByLabelText('SS: 0 of 1').getAttribute('data-drop-state')).toBe(
        'eligible',
      );
      expect(getByLabelText('C: 0 of 1').getAttribute('data-drop-state')).toBe(
        'ineligible',
      );
      // The bench takes anyone.
      expect(getByLabelText('BN: 0 of 8').getAttribute('data-drop-state')).toBe(
        'eligible',
      );
    });

    it('drafts a team defense dropped on the football DST row', () => {
      const onDraftPlayer = jest.fn();
      const { getByLabelText } = render(
        <DraftRail
          {...baseProps}
          sport="football"
          leaguePositions={[{ positionType: 'QB' }, { positionType: 'DST' }]}
          maxRosterSize={3}
          isMyPick
          draggedPlayer={player(['DST'])}
          onDraftPlayer={onDraftPlayer}
        />,
      );
      expect(getByLabelText('QB: 0 of 1').getAttribute('data-drop-state')).toBe(
        'ineligible',
      );
      fireEvent.drop(getByLabelText('DST: 0 of 1'));
      expect(onDraftPlayer).toHaveBeenCalledWith(42);
    });
  });

  it('paints roster-bar fills with sport-scoped position colors', () => {
    const { container } = render(
      <DraftRail
        {...baseProps}
        sport="football"
        myTeam={
          [
            { id: 1, name: 'QB1', position: 'QB' },
            { id: 2, name: 'RB1', position: 'RB' },
          ] as DraftPlayer[]
        }
        leaguePositions={[{ positionType: 'QB' }, { positionType: 'RB' }]}
        maxRosterSize={2}
      />,
    );
    const fills = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="pos-fill-"]'),
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

  // LS-10568: getDraftRecommendations is league-only; a mock room's
  // myTeamId is a seat id, so Draft Intelligence must not mount there.
  describe('Draft Intelligence gating', () => {
    it('renders Draft Intelligence for a premium user on their pick', () => {
      const { queryByTestId } = render(
        <DraftRail
          {...baseProps}
          isPremium
          isMyPick
          draftId={1}
          myTeamId={2}
        />,
      );
      expect(queryByTestId('intel')).toBeTruthy();
    });

    it('hides Draft Intelligence in a mock draft', () => {
      const { queryByTestId, queryByText } = render(
        <DraftRail
          {...baseProps}
          isPremium
          isMyPick
          isMockDraft
          draftId={1}
          myTeamId={2}
        />,
      );
      expect(queryByTestId('intel')).toBeNull();
      expect(queryByText('Draft Intelligence')).toBeNull();
    });
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
