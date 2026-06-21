/**
 * Regression guard for LS-5015: advanced playoff formats must be gated by
 * subscription tier in LeagueSettingsControl.
 *
 * The always-free 4-team format must remain selectable for free-tier users,
 * while the premium 6-team and 8-team formats are individually locked (disabled
 * with a "(premium)" affordance). For premium users every format is selectable.
 *
 * Previously a single over-broad <PremiumGate> wrapped all three options, which
 * blocked free users from the free 4-team format entirely.
 */
import React from 'react';
import { LeagueSettingsControl } from './LeagueSettingsControl';
import { render, screen } from '../../test-utils';

jest.mock('@legacy-sports/graphql', () => ({
  useUpdateLeagueSettingsMutation: () => [jest.fn(), { loading: false }],
}));

type Children = { children?: React.ReactNode };
type ButtonProps = Children & {
  onPress?: () => void;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-pressed'?: boolean;
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
      aria-pressed={rest['aria-pressed']}
      data-testid={rest['data-testid']}
    >
      {children}
    </button>
  );
  return {
    Button,
    Card: PassThrough,
    H4: PassThrough,
    Input: PassThrough,
    Separator: () => null,
    Spinner: () => <span>spinner</span>,
    Text: PassThrough,
    XStack: PassThrough,
    YStack: PassThrough,
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  AlertTriangle: () => null,
  Check: () => null,
  Lock: () => null,
  Settings: () => null,
}));

jest.mock('../../utils/colors', () => ({
  BRAND_NAVY_LIGHT: '#2a3d6a',
  withAlpha: (color: string) => color,
}));

jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({ children }: Children) => <div>{children}</div>,
}));

const defaultProps = {
  leagueId: 1,
  currentGamesPerMatchup: 1,
  currentSpStartsPerMatchup: 1,
  currentPlayoffEnabled: true,
  currentPlayoffFormat: '4-team',
};

describe('LeagueSettingsControl — advanced playoff format gating (LS-5015)', () => {
  it('locks 6-team and 8-team but leaves 4-team selectable for free users', () => {
    render(<LeagueSettingsControl {...defaultProps} isPremium={false} />);

    const fourTeam = screen.getByRole('button', {
      name: 'Playoff format: 4-team',
    });
    const sixTeam = screen.getByRole('button', {
      name: 'Playoff format: 6-team (premium)',
    });
    const eightTeam = screen.getByRole('button', {
      name: 'Playoff format: 8-team (premium)',
    });

    expect(fourTeam).toBeEnabled();
    expect(sixTeam).toBeDisabled();
    expect(eightTeam).toBeDisabled();
  });

  it('leaves every playoff format selectable for premium users', () => {
    render(<LeagueSettingsControl {...defaultProps} isPremium={true} />);

    expect(
      screen.getByRole('button', { name: 'Playoff format: 4-team' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Playoff format: 6-team' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Playoff format: 8-team' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', {
        name: 'Playoff format: 6-team (premium)',
      }),
    ).not.toBeInTheDocument();
  });
});
