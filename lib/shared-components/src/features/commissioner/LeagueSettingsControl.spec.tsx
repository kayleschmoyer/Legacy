/**
 * Regression guard for LS-5912: advanced playoff formats must be gated behind
 * PremiumGate in LeagueSettingsControl so non-premium users see an upgrade
 * prompt instead of disabled buttons, and so saving with an existing advanced
 * format never triggers a server-side ForbiddenError.
 *
 * The always-free 4-team format must remain selectable for free-tier users.
 * For premium users every format is selectable.
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
  PremiumGate: ({
    children,
    isPremium,
    featureName,
  }: Children & { isPremium: boolean; featureName: string }) =>
    isPremium ? (
      <div>{children}</div>
    ) : (
      <div data-testid="premium-gate-locked">
        {featureName} — Upgrade to Premium
      </div>
    ),
}));

const defaultProps = {
  leagueId: 1,
  currentGamesPerMatchup: 1,
  currentSpStartsPerMatchup: 1,
  currentPlayoffEnabled: true,
  currentPlayoffFormat: '4-team',
};

describe('LeagueSettingsControl — advanced playoff format gating (LS-5912)', () => {
  it('shows 4-team freely and replaces 6-team/8-team with PremiumGate for free users', () => {
    render(<LeagueSettingsControl {...defaultProps} isPremium={false} />);

    expect(
      screen.getByRole('button', { name: 'Playoff format: 4-team' }),
    ).toBeEnabled();

    // Advanced formats replaced by PremiumGate locked card (salary cap has one too)
    const lockedGates = screen.getAllByTestId('premium-gate-locked');
    expect(
      lockedGates.some((el) =>
        el.textContent?.includes('Advanced Playoff Formats'),
      ),
    ).toBe(true);
    expect(
      screen.queryByRole('button', { name: 'Playoff format: 6-team' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Playoff format: 8-team' }),
    ).not.toBeInTheDocument();
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
      screen
        .queryAllByTestId('premium-gate-locked')
        .some((el) => el.textContent?.includes('Advanced Playoff Formats')),
    ).toBe(false);
  });

  it('clamps an advanced format to 4-team for a non-premium user (prevents ForbiddenError)', () => {
    // League was set to 6-team while premium, user downgraded — form should show 4-team
    render(
      <LeagueSettingsControl
        {...defaultProps}
        currentPlayoffFormat="6-team"
        isPremium={false}
      />,
    );

    // 4-team button should be selected (aria-pressed=true)
    expect(
      screen.getByRole('button', { name: 'Playoff format: 4-team' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
