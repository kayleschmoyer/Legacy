/**
 * DraftMiniBoard (native, LS-9263) — team x round grid, tap-to-inspect.
 *
 * Under test: empty state, default inspect hint, and tap-to-inspect caption
 * update — asserted via RN accessibilityRole/accessibilityLabel (mapped to
 * data-accessibility-* attributes by the mock below), not DOM role/aria-label
 * (see DraftMiniBoard.spec.tsx for the web/DOM-role counterpart, which this
 * jest project's moduleFileExtensions no longer resolves to this component).
 *
 * Ships its own minimal `react-native` mock (mirroring
 * PickSplashStatGraphic.native.spec.tsx) so Pressable/Animated.View surface
 * accessibilityRole/accessibilityLabel as queryable data attributes instead
 * of raw (and React-dev-warning-producing) DOM props.
 */
import React from 'react';
import { DraftMiniBoard } from './DraftMiniBoard.native';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { fireEvent, render } from '../../test-utils';

jest.mock('react-native', () => ({
  Animated: {
    Value: jest.fn(() => ({
      setValue: jest.fn(),
      interpolate: jest.fn(() => undefined),
    })),
    View: ({ children }: { children?: React.ReactNode }) => (
      <div>{children}</div>
    ),
    loop: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
    sequence: jest.fn(),
    timing: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
  },
  Easing: {
    inOut: jest.fn((easing: unknown) => easing),
    quad: jest.fn(),
  },
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    accessibilityRole,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
    accessibilityRole?: string;
  }) => (
    <button
      onClick={onPress}
      data-accessibility-label={accessibilityLabel}
      data-accessibility-role={accessibilityRole}
    >
      {children}
    </button>
  ),
}));

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

describe('DraftMiniBoard (native)', () => {
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
    const { container, getByText } = render(
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

    const cell = container.querySelector(
      '[data-accessibility-label="R1 · Team One — Infielder One (1B)"]',
    );
    expect(cell).toBeTruthy();
    fireEvent.click(cell as Element);
    expect(getByText(/R1 · Team One — Infielder One \(1B\)/)).toBeTruthy();
  });
});
