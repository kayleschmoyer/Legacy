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
import { fireEvent, render, screen } from '../../test-utils';

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
type InputProps = {
  value?: string;
  onChangeText?: (text: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
  placeholder?: string;
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
  const Input = ({ value, onChangeText, disabled, ...rest }: InputProps) => (
    <input
      value={value}
      onChange={(e) => onChangeText?.(e.target.value)}
      disabled={!!disabled}
      aria-label={rest['aria-label']}
      placeholder={rest.placeholder}
    />
  );
  return {
    Button,
    Card: PassThrough,
    H4: PassThrough,
    Input,
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

/**
 * Regression guard for LS-8660: the Settings tab crashed for every freshly
 * created baseball league. Root cause — Games Per Matchup / SP Starts Per
 * Matchup rendered one Button per integer up to the sport's max
 * (GAMES_PER_MATCHUP_BY_SPORT.baseball.max === 162), a data-independent
 * render blowup introduced by LS-4762. Both fields are now bounded numeric
 * Inputs instead of per-value button grids.
 */
describe('LeagueSettingsControl — bounded numeric inputs (LS-8660)', () => {
  it('renders without throwing for a freshly created baseball league (162-game max)', () => {
    expect(() =>
      render(
        <LeagueSettingsControl
          {...defaultProps}
          sport="baseball"
          currentGamesPerMatchup={5}
          currentSpStartsPerMatchup={1}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByLabelText('Games per matchup')).toHaveValue('5');
    expect(screen.getByLabelText('SP starts per matchup')).toHaveValue('1');

    // The old per-value button grid must be gone — no more "Games per
    // matchup: N games" buttons regardless of the sport's max.
    expect(
      screen.queryByRole('button', { name: /Games per matchup: /i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /SP starts per matchup: /i }),
    ).not.toBeInTheDocument();
  });

  it('shows a validation error and disables Save when games per matchup is out of bounds', () => {
    render(
      <LeagueSettingsControl
        {...defaultProps}
        sport="baseball"
        currentGamesPerMatchup={5}
        currentSpStartsPerMatchup={1}
      />,
    );

    fireEvent.change(screen.getByLabelText('Games per matchup'), {
      target: { value: '9999' },
    });

    expect(
      screen.getByText('Games per matchup must be between 1 and 162'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save Settings' }),
    ).toBeDisabled();
  });

  it('allows clearing and retyping the games per matchup input', () => {
    render(
      <LeagueSettingsControl
        {...defaultProps}
        sport="baseball"
        currentGamesPerMatchup={5}
        currentSpStartsPerMatchup={1}
      />,
    );

    const input = screen.getByLabelText('Games per matchup');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue('');

    fireEvent.change(input, { target: { value: '10' } });
    expect(input).toHaveValue('10');
  });
});
