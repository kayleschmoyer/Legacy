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
import { FOOTBALL_POSITION_COLORS, POSITION_COLORS } from './constants';
import { render } from '../../test-utils';

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
  draftId: null,
  myTeamId: null,
  currentOverallPick: 0,
  autoPickDisabled: false,
  myTeam: [],
  positionCounts: {} as Record<string, number>,
  pickHistory: [],
  statsLookup: new Map(),
  teamNameById: () => '',
  onShowToast: jest.fn(),
  onDraftPlayer: jest.fn(),
  onCommissionerPick: jest.fn(),
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
          c.includes(FOOTBALL_POSITION_COLORS.QB.toLowerCase()) ||
          c === 'rgb(196, 30, 58)',
      ),
    ).toBe(true);
    expect(
      colors.some(
        (c) =>
          c.includes(FOOTBALL_POSITION_COLORS.RB.toLowerCase()) ||
          c === 'rgb(139, 111, 71)',
      ),
    ).toBe(true);
    // Baseball palette must not bleed into a football rail.
    expect(
      colors.every((c) => !c.includes(POSITION_COLORS['1B'].toLowerCase())),
    ).toBe(true);
  });
});
