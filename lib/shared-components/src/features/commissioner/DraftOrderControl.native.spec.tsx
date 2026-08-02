import React from 'react';
import { DraftOrderControl } from './DraftOrderControl.native';
import { useDraftOrder } from './useDraftOrder';
import { fireEvent, render, screen } from '../../test-utils';

jest.mock('./useDraftOrder', () => ({
  useDraftOrder: jest.fn(),
}));

// @tamagui/lucide-icons' generated CJS barrel resolves `List` and `Shuffle`
// to `undefined` under this jest environment (unrelated to LS-8850 — every
// other icon used here, e.g. Lock/ChevronUp/ChevronDown, resolves fine).
// Stub the module so the render test isn't blocked by that pre-existing
// environment quirk; production code keeps importing the real icons.
jest.mock('@tamagui/lucide-icons', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires -- jest.mock factory needs runtime require */
  const ReactLocal = require('react') as typeof import('react');
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
  const stubIcon = (name: string) => {
    const Icon = () => ReactLocal.createElement('svg', { 'data-icon': name });
    Icon.displayName = name;
    return Icon;
  };
  return {
    ChevronDown: stubIcon('ChevronDown'),
    ChevronUp: stubIcon('ChevronUp'),
    List: stubIcon('List'),
    Lock: stubIcon('Lock'),
    Shuffle: stubIcon('Shuffle'),
  };
});

const mockUseDraftOrder = jest.mocked(useDraftOrder);

const TEAMS = [
  { teamId: 1, teamName: 'Dinger Dynasty', draftOrder: 1 },
  { teamId: 2, teamName: 'Bronx Bombers', draftOrder: 2 },
  { teamId: 3, teamName: 'Curveball Crushers', draftOrder: 3 },
];

function makeHookReturn(
  overrides: Partial<ReturnType<typeof useDraftOrder>> = {},
): ReturnType<typeof useDraftOrder> {
  return {
    draftId: 42,
    isOrderLocked: false,
    loading: false,
    localOrder: TEAMS,
    hasCustomOrder: false,
    settingOrder: false,
    randomizing: false,
    isBusy: false,
    moveTeam: jest.fn(),
    handleSaveOrder: jest.fn(),
    handleRandomize: jest.fn(),
    handleReset: jest.fn(),
    ...overrides,
  };
}

const defaultProps = {
  leagueId: 1,
  draftStatus: 'not-started',
  onSuccess: jest.fn(),
  onError: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseDraftOrder.mockReturnValue(makeHookReturn());
});

// LS-8850: DraftOrderControl.tsx renders a raw <div> and imports @dnd-kit,
// both DOM-only, which crashes the Settings tab on native. This spec covers
// the Tamagui-only native variant added to fix that (see the render test
// requirement in the ticket's acceptance criteria).
describe('DraftOrderControl (native)', () => {
  it('renders each team in order with no drag affordance', () => {
    render(<DraftOrderControl {...defaultProps} />);

    expect(screen.getByText('Dinger Dynasty')).toBeTruthy();
    expect(screen.getByText('Bronx Bombers')).toBeTruthy();
    expect(screen.getByText('Curveball Crushers')).toBeTruthy();
    expect(screen.queryByLabelText(/Drag to reorder/)).toBeNull();
  });

  it('moves a team up when its up arrow is pressed', () => {
    const moveTeam = jest.fn();
    mockUseDraftOrder.mockReturnValue(makeHookReturn({ moveTeam }));

    render(<DraftOrderControl {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Move Bronx Bombers up'));

    expect(moveTeam).toHaveBeenCalledWith(1, 0);
  });

  it('moves a team down when its down arrow is pressed', () => {
    const moveTeam = jest.fn();
    mockUseDraftOrder.mockReturnValue(makeHookReturn({ moveTeam }));

    render(<DraftOrderControl {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Move Dinger Dynasty down'));

    expect(moveTeam).toHaveBeenCalledWith(0, 1);
  });

  it('disables the top row’s up arrow and the bottom row’s down arrow', () => {
    render(<DraftOrderControl {...defaultProps} />);

    expect(screen.getByLabelText('Move Dinger Dynasty up')).toBeDisabled();
    expect(
      screen.getByLabelText('Move Curveball Crushers down'),
    ).toBeDisabled();
  });

  it('saves the order when Save Order is pressed', () => {
    const handleSaveOrder = jest.fn();
    mockUseDraftOrder.mockReturnValue(
      makeHookReturn({ hasCustomOrder: true, handleSaveOrder }),
    );

    render(<DraftOrderControl {...defaultProps} />);
    fireEvent.click(screen.getByText('Save Order'));

    expect(handleSaveOrder).toHaveBeenCalled();
  });

  it('randomizes the order when Randomize is pressed', () => {
    const handleRandomize = jest.fn();
    mockUseDraftOrder.mockReturnValue(makeHookReturn({ handleRandomize }));

    render(<DraftOrderControl {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Randomize draft order'));

    expect(handleRandomize).toHaveBeenCalled();
  });

  it('shows a read-only list with no reorder controls or Randomize when the draft is in progress', () => {
    mockUseDraftOrder.mockReturnValue(makeHookReturn({ isOrderLocked: true }));

    render(<DraftOrderControl {...defaultProps} draftStatus="in-progress" />);

    expect(
      screen.getByText(/pick order can no longer be changed/),
    ).toBeTruthy();
    expect(screen.queryByLabelText(/Move .* up/)).toBeNull();
    expect(screen.queryByLabelText('Randomize draft order')).toBeNull();
    expect(screen.queryByText('Save Order')).toBeNull();
  });

  it('shows the permanently-locked state once the draft is completed', () => {
    mockUseDraftOrder.mockReturnValue(
      makeHookReturn({ isOrderLocked: true, localOrder: [] }),
    );

    render(<DraftOrderControl {...defaultProps} draftStatus="completed" />);

    expect(
      screen.getByText(
        'The draft is complete — pick order is permanently locked.',
      ),
    ).toBeTruthy();
  });

  it('shows a loading state while the order is being fetched', () => {
    mockUseDraftOrder.mockReturnValue(
      makeHookReturn({ loading: true, localOrder: [] }),
    );

    render(<DraftOrderControl {...defaultProps} />);

    expect(screen.getByText('Loading draft order…')).toBeTruthy();
  });

  it('shows an empty state when the league has no teams yet', () => {
    mockUseDraftOrder.mockReturnValue(makeHookReturn({ localOrder: [] }));

    render(<DraftOrderControl {...defaultProps} />);

    expect(
      screen.getByText(/No teams yet\. Add teams to the league/),
    ).toBeTruthy();
  });

  it('renders the locked upgrade prompt instead of the control when not premium', () => {
    render(<DraftOrderControl {...defaultProps} isPremium={false} />);

    expect(screen.queryByText('Dinger Dynasty')).toBeNull();
  });
});
