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

interface UpdateLeagueSettingsCallArgs {
  variables: { input: Record<string, unknown> };
}

const mockUpdateLeagueSettings = jest
  .fn<Promise<unknown>, [UpdateLeagueSettingsCallArgs]>()
  .mockResolvedValue({});

jest.mock('@legacy-sports/graphql', () => ({
  useUpdateLeagueSettingsMutation: () => [
    mockUpdateLeagueSettings,
    { loading: false },
  ],
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
type XStackProps = ButtonProps & {
  accessibilityRole?: string;
  testID?: string;
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
  // XStack doubles as a pressable in OptionButtonGroup (used by
  // WaiverSystemField/FaabBudgetField) — forward onPress/aria-label/role so
  // those buttons are queryable and clickable in tests, same treatment
  // StepPremiumOptions.spec.tsx gives it.
  const XStack = ({ children, onPress, ...rest }: XStackProps) => (
    <div
      onClick={onPress}
      role={rest.accessibilityRole}
      aria-label={rest['aria-label']}
      data-testid={rest.testID ?? rest['data-testid']}
    >
      {children}
    </div>
  );
  return {
    createTokens: (tokens: unknown) => tokens,
    Button,
    Card: PassThrough,
    H4: PassThrough,
    Input,
    Separator: () => null,
    Spinner: () => <span>spinner</span>,
    Text: PassThrough,
    XStack,
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

/**
 * Regression guard for LS-8656: tapping the Settings tab crashed with
 * "TypeError: Cannot convert undefined value to object" because
 * currentGamesPerMatchup/currentSpStartsPerMatchup had no defaults, unlike
 * every other prop on this component. A caller that omits them (e.g. a
 * host screen that hasn't loaded league data yet) must not crash.
 */
describe('LeagueSettingsControl — safe defaults for required matchup props (LS-8656)', () => {
  it('renders without throwing when currentGamesPerMatchup/currentSpStartsPerMatchup are omitted', () => {
    expect(() =>
      render(<LeagueSettingsControl leagueId={1} sport="baseball" />),
    ).not.toThrow();

    expect(screen.getByLabelText('Games per matchup')).toHaveValue('1');
    expect(screen.getByLabelText('SP starts per matchup')).toHaveValue('1');
  });
});

/**
 * Regression guard for LS-8655: production Rollbar report (item
 * Legacy-Sports/200) of the identical "TypeError: Cannot convert undefined
 * value to object" crash inside LeagueSettingsControl on Android, filed the
 * same day as — and matching the exact stack trace of — LS-8656 and LS-8660.
 * Investigation found both known root causes for this error signature
 * already fixed on main (LS-8656's missing prop defaults, LS-8660's
 * unbounded button grid); this test closes the one untested gap — a caller
 * that omits every optional prop, including `sport` itself — to confirm no
 * third cause remains.
 */
describe('LeagueSettingsControl — renders with every optional prop omitted (LS-8655)', () => {
  it('renders without throwing when no optional props are passed at all', () => {
    expect(() => render(<LeagueSettingsControl leagueId={1} />)).not.toThrow();

    expect(screen.getByLabelText('Games per matchup')).toHaveValue('1');
    expect(screen.getByLabelText('SP starts per matchup')).toHaveValue('1');
  });
});

/**
 * Regression guard for LS-9162: production Rollbar report (item
 * Legacy-Sports/200, 6 occurrences) of the same "TypeError: Cannot convert
 * undefined value to object" crash inside LeagueSettingsControl on Android.
 * Investigation confirmed this is the identical stack signature as
 * LS-8655/LS-8656/LS-8660 — both known root causes (missing prop defaults,
 * the unbounded button grid) are already fixed on main, and five of the six
 * occurrences predate all three fixes; the sixth lands within a few hours of
 * the LS-8655 fix landing, well inside normal Android store rollout lag.
 *
 * LS-8655's regression test covers every optional prop omitted for the
 * (default) baseball sport. The one combination it didn't exercise — a
 * football league with every optional prop besides `sport` omitted, which
 * resolves a different `GAMES_PER_MATCHUP_BY_SPORT` bounds entry — is added
 * here to fully close out the "no third cause remains" finding.
 */
describe('LeagueSettingsControl — renders for a football league with every other optional prop omitted (LS-9162)', () => {
  it('renders without throwing for a football league with only leagueId and sport passed', () => {
    expect(() =>
      render(<LeagueSettingsControl leagueId={1} sport="football" />),
    ).not.toThrow();

    expect(screen.getByLabelText('Games per matchup')).toHaveValue('1');
    expect(screen.getByLabelText('SP starts per matchup')).toHaveValue('1');
  });
});

/**
 * LS-6305: the Settings tab had no way to edit waiver type (FAAB) or the
 * FAAB budget after league creation — those fields exist on the backend
 * (updateLeagueSettings) and are collected at league-create time, but no
 * commissioner control exposed them post-creation. Covers the new Waiver
 * System section: default rendering, premium gating (mirrors the FAAB
 * league-create gating), the downgrade-safe clamp (mirrors LS-5912's
 * playoff-format clamp so a resave never resubmits a forbidden value), and
 * that Save only sends faabBudgetDefault when waiverType is 'faab'.
 */
describe('LeagueSettingsControl — Waiver System (LS-6305)', () => {
  beforeEach(() => {
    mockUpdateLeagueSettings.mockClear();
  });

  it('defaults to Standard selected and hides the FAAB budget field when no waiver props are passed', () => {
    render(<LeagueSettingsControl {...defaultProps} isPremium={false} />);

    expect(screen.getByRole('button', { name: 'Standard' })).toHaveAttribute(
      'aria-label',
      'Standard',
    );
    expect(
      screen.queryByRole('button', { name: '$100' }),
    ).not.toBeInTheDocument();
  });

  it('routes a free user tapping FAAB to onUpgrade instead of switching', () => {
    const onUpgrade = jest.fn();
    render(
      <LeagueSettingsControl
        {...defaultProps}
        isPremium={false}
        onUpgrade={onUpgrade}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /FAAB.*Premium/ }));

    expect(onUpgrade).toHaveBeenCalled();
    // Still standard — no budget field revealed.
    expect(
      screen.queryByRole('button', { name: '$100' }),
    ).not.toBeInTheDocument();
  });

  it('lets a premium user switch to FAAB, reveals the budget field, and saves both fields', async () => {
    render(
      <LeagueSettingsControl
        {...defaultProps}
        leagueId={42}
        isPremium={true}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /FAAB.*Premium/ }));
    expect(screen.getByRole('button', { name: '$150' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '$150' }));

    const saveButton = screen.getByRole('button', { name: 'Save Settings' });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await screen.findByRole('button', { name: 'Save Settings' });
    const call = mockUpdateLeagueSettings.mock.calls[0][0];
    expect(call.variables.input.leagueId).toBe(42);
    expect(call.variables.input.waiverType).toBe('faab');
    expect(call.variables.input.faabBudgetDefault).toBe(150);
  });

  it('omits faabBudgetDefault from Save when waiverType is standard', async () => {
    render(
      <LeagueSettingsControl {...defaultProps} leagueId={7} isPremium={true} />,
    );

    // Trigger a change so Save is enabled without touching waiver settings.
    fireEvent.change(screen.getByLabelText('Games per matchup'), {
      target: { value: '3' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await screen.findByRole('button', { name: 'Save Settings' });
    const call = mockUpdateLeagueSettings.mock.calls[0][0];
    expect(call.variables.input.waiverType).toBe('standard');
    expect(call.variables.input).not.toHaveProperty('faabBudgetDefault');
  });

  it('clamps a grandfathered FAAB league to Standard for a now-downgraded user (prevents ForbiddenError)', () => {
    render(
      <LeagueSettingsControl
        {...defaultProps}
        currentWaiverType="faab"
        isPremium={false}
      />,
    );

    expect(
      screen.queryByRole('button', { name: '$100' }),
    ).not.toBeInTheDocument();
  });
});
