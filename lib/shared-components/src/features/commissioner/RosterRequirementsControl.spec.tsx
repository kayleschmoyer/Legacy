/**
 * Component tests for RosterRequirementsControl (LS-9099) — the
 * football-specific Commissioner Settings control for reconfiguring roster
 * position slot counts after league creation.
 */
import React from 'react';
import { RosterRequirementsControl } from './RosterRequirementsControl';
import { fireEvent, render, screen, waitFor } from '../../test-utils';

const mockUpdateRosterPositions = jest.fn();
let mockPositionsData:
  | {
      leaguePositions: { id: number; leagueId: number; positionType: string }[];
    }
  | undefined;
let mockPositionsLoading = false;
const mockRefetch = jest.fn();

jest.mock('@legacy-sports/graphql', () => ({
  useGetLeaguePositionsQuery: () => ({
    data: mockPositionsData,
    loading: mockPositionsLoading,
    refetch: mockRefetch,
  }),
  useUpdateRosterPositionsMutation: () => [
    mockUpdateRosterPositions,
    { loading: false },
  ],
}));

type Children = { children?: React.ReactNode };
type ButtonProps = Children & {
  onPress?: () => void;
  disabled?: boolean;
  'aria-label'?: string;
  'data-testid'?: string;
};

jest.mock('tamagui', () => {
  const PassThrough = ({ children }: Children) => <div>{children}</div>;
  const Button = ({ children, onPress, disabled, ...rest }: ButtonProps) => (
    <button
      type="button"
      onClick={onPress}
      disabled={!!disabled}
      aria-label={rest['aria-label']}
      data-testid={rest['data-testid']}
    >
      {children}
    </button>
  );
  return {
    Button,
    Card: PassThrough,
    H4: PassThrough,
    Spinner: () => <span>spinner</span>,
    Text: PassThrough,
    XStack: PassThrough,
    YStack: PassThrough,
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  Minus: () => null,
  Plus: () => null,
  Settings: () => null,
}));

jest.mock('../../utils/colors', () => ({
  BRAND_NAVY_LIGHT: '#2a3d6a',
  withAlpha: (color: string) => color,
}));

const defaultProps = { leagueId: 1, defensiveFormat: 'dst' as const };

beforeEach(() => {
  jest.clearAllMocks();
  mockPositionsData = undefined;
  mockPositionsLoading = false;
});

describe('RosterRequirementsControl', () => {
  it('renders each D/ST-format slot with the current rostered count', () => {
    mockPositionsData = {
      leaguePositions: [
        { id: 1, leagueId: 1, positionType: 'QB' },
        { id: 2, leagueId: 1, positionType: 'RB' },
        { id: 3, leagueId: 1, positionType: 'RB' },
      ],
    };

    render(<RosterRequirementsControl {...defaultProps} />);

    expect(screen.getByText('Quarterback')).toBeInTheDocument();
    expect(screen.getByText('Running Back')).toBeInTheDocument();
    // RB count of 2 should be visible next to its steppers
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('falls back to the sport defaults when the league has no positions configured yet', () => {
    mockPositionsData = { leaguePositions: [] };

    render(<RosterRequirementsControl {...defaultProps} />);

    // Default D/ST shape: QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DST:1, BN:7
    expect(screen.getByText('Quarterback')).toBeInTheDocument();
    expect(screen.getByText('Team D/ST')).toBeInTheDocument();
  });

  it('enables Save once a count changes, and calls the mutation with the updated slots', async () => {
    mockPositionsData = {
      leaguePositions: [
        { id: 1, leagueId: 1, positionType: 'QB' },
        { id: 2, leagueId: 1, positionType: 'RB' },
      ],
    };
    mockUpdateRosterPositions.mockResolvedValue({});

    render(<RosterRequirementsControl {...defaultProps} />);

    const saveButton = screen.getByRole('button', {
      name: 'Save Roster Requirements',
    });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Increase RB count' }));

    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateRosterPositions).toHaveBeenCalledWith({
        variables: {
          input: {
            leagueId: 1,
            rosterSlots: [
              { positionType: 'QB', count: 1 },
              { positionType: 'RB', count: 2 },
            ],
          },
        },
      });
    });
  });

  it('surfaces a server-side shrink rejection via onError instead of throwing', async () => {
    mockPositionsData = {
      leaguePositions: [
        { id: 1, leagueId: 1, positionType: 'QB' },
        { id: 2, leagueId: 1, positionType: 'RB' },
        { id: 3, leagueId: 1, positionType: 'RB' },
      ],
    };
    const rejectionMessage =
      'Cannot reduce "RB" to 1 slot(s) — a team already has 2 player(s) rostered in that position. Drop players from that position first.';
    mockUpdateRosterPositions.mockRejectedValue(new Error(rejectionMessage));
    const onError = jest.fn();

    render(<RosterRequirementsControl {...defaultProps} onError={onError} />);

    fireEvent.click(screen.getByRole('button', { name: 'Decrease RB count' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Roster Requirements' }),
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(new Error(rejectionMessage));
    });
  });

  it('resets to the last-saved counts on Reset', () => {
    mockPositionsData = {
      leaguePositions: [
        { id: 1, leagueId: 1, positionType: 'QB' },
        { id: 2, leagueId: 1, positionType: 'RB' },
      ],
    };

    render(<RosterRequirementsControl {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Increase RB count' }));
    expect(
      screen.getByRole('button', { name: 'Save Roster Requirements' }),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(
      screen.getByRole('button', { name: 'Save Roster Requirements' }),
    ).toBeDisabled();
  });
});
