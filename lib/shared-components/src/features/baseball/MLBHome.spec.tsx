import React from 'react';
import { act } from '@testing-library/react';
import { MLBHome, type MLBHomeLeague } from './MLBHome';
import { fireEvent, render, screen } from '../../test-utils';

type Children = { children?: React.ReactNode };
type PressProps = Children & { onPress?: () => void; disabled?: boolean };
type ButtonProps = PressProps & {
  ['aria-label']?: string;
  accessibilityLabel?: string;
};
type InputProps = {
  value?: string;
  onChangeText?: (next: string) => void;
  placeholder?: string;
  ['aria-label']?: string;
};

// The create dialog is exercised by its own spec; here we only assert MLBHome
// opens it and forwards the submit handler.
jest.mock('./CreateLeagueDialog', () => ({
  CreateLeagueDialog: ({
    open,
    onSubmit,
  }: {
    open: boolean;
    onSubmit: (input: unknown) => Promise<void>;
  }) =>
    open ? (
      <div data-testid="mock-create-dialog">
        <button
          type="button"
          onClick={() => void onSubmit({ leagueName: 'X' })}
        >
          dialog-submit
        </button>
      </div>
    ) : null,
}));

jest.mock('tamagui', () => {
  const Box = ({ children, onPress }: PressProps) => (
    <div onClick={onPress}>{children}</div>
  );
  const Button = ({
    children,
    onPress,
    disabled,
    'aria-label': ariaLabel,
    accessibilityLabel,
  }: ButtonProps) => (
    <button
      type="button"
      onClick={onPress}
      disabled={!!disabled}
      aria-label={ariaLabel ?? accessibilityLabel}
    >
      {children}
    </button>
  );
  const Heading = ({ children }: Children) => <h2>{children}</h2>;
  const Text = ({ children, onPress }: PressProps) => (
    <span onClick={onPress}>{children}</span>
  );
  const Input = ({
    value,
    onChangeText,
    placeholder,
    'aria-label': ariaLabel,
  }: InputProps) => (
    <input
      value={value ?? ''}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChangeText?.(e.target.value)}
    />
  );
  return {
    ScrollView: Box,
    YStack: Box,
    XStack: Box,
    Button,
    H1: Heading,
    H2: Heading,
    H3: Heading,
    Paragraph: ({ children }: Children) => <p>{children}</p>,
    Text,
    Input,
    Separator: () => <hr />,
    Spinner: () => <div role="status" />,
  };
});

const LEAGUES: MLBHomeLeague[] = [
  {
    id: 1,
    name: 'Saturday Sluggers',
    draftStatus: 'in-progress',
    maxRosterSize: 25,
  },
  {
    id: 2,
    name: 'Sunday Stars',
    draftStatus: 'completed',
    currentWeekNumber: 4,
  },
];

const FROZEN_LEAGUE: MLBHomeLeague = {
  id: 3,
  name: 'Frozen Fossils',
  draftStatus: 'completed',
  currentWeekNumber: 10,
  tierFrozenAt: '2024-03-01T00:00:00.000Z',
};

const RENEW_FROZEN_LEAGUE: MLBHomeLeague = {
  id: 4,
  name: 'Ended Eagles',
  draftStatus: 'completed',
  currentWeekNumber: 20,
  frozenAt: '2024-11-01T00:00:00.000Z',
};

const ROLE_LEAGUES: MLBHomeLeague[] = [
  {
    id: 10,
    name: 'Commish League',
    draftStatus: 'completed',
    permissionLevel: 'commissioner',
  },
  {
    id: 11,
    name: 'GM League',
    draftStatus: 'completed',
    permissionLevel: 'general_manager',
  },
  {
    id: 12,
    name: 'Member League',
    draftStatus: 'completed',
    permissionLevel: 'member',
  },
];

const baseProps = {
  onCreateLeague: jest.fn().mockResolvedValue(undefined),
  onJoinLeague: jest.fn(),
  onViewLeague: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MLBHome', () => {
  it('shows the full hero and empty state when the user has no leagues', () => {
    render(<MLBHome {...baseProps} leagues={[]} />);
    expect(screen.getByText(/Season Hub/)).toBeInTheDocument();
    expect(screen.getByText('No baseball leagues yet')).toBeInTheDocument();
    expect(screen.queryByText('+ Create')).not.toBeInTheDocument();
  });

  it('shows the compact hero and league list when the user has leagues', () => {
    render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    expect(screen.getByText('+ Create')).toBeInTheDocument();
    expect(screen.queryByText(/Season Hub/)).not.toBeInTheDocument();
    expect(screen.getByText('Saturday Sluggers')).toBeInTheDocument();
    expect(screen.getByText('Sunday Stars')).toBeInTheDocument();
  });

  it('renders draft-status badges from each league', () => {
    render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    expect(screen.getByText('Drafting')).toBeInTheDocument();
    expect(screen.getByText('Week 4')).toBeInTheDocument();
  });

  it('filters the league list via search', () => {
    jest.useFakeTimers();
    render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    fireEvent.change(screen.getByPlaceholderText(/Search leagues/i), {
      target: { value: 'Saturday' },
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.getByText('Saturday Sluggers')).toBeInTheDocument();
    expect(screen.queryByText('Sunday Stars')).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  it('shows the error notice (not the empty state) when error is set', () => {
    render(<MLBHome {...baseProps} leagues={[]} error />);
    expect(
      screen.getByText(/Could not load your leagues/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('No leagues yet')).not.toBeInTheDocument();
  });

  it('shows only a spinner while loading', () => {
    render(<MLBHome {...baseProps} leagues={[]} loading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Create League')).not.toBeInTheDocument();
  });

  it('opens the create dialog when Create League is pressed', () => {
    render(<MLBHome {...baseProps} leagues={[]} />);
    expect(screen.queryByTestId('mock-create-dialog')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Create a new baseball league',
      }),
    );
    expect(screen.getByTestId('mock-create-dialog')).toBeInTheDocument();
  });

  it('invokes onViewLeague when a league row is pressed', () => {
    render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    fireEvent.click(screen.getByText('Saturday Sluggers'));
    expect(baseProps.onViewLeague).toHaveBeenCalledWith(1);
  });

  it('renders the league-cap indicator and disables Create at the cap', () => {
    const onUpgrade = jest.fn();
    render(
      <MLBHome
        {...baseProps}
        leagues={LEAGUES}
        leagueCap={{ count: 3, limit: 3, atLimit: true, onUpgrade }}
      />,
    );
    expect(screen.getByText('Your leagues: 3/3')).toBeInTheDocument();
    const createBtn = screen.getByRole('button', {
      name: 'Create a new baseball league',
    });
    expect(createBtn).toBeDisabled();
    fireEvent.click(screen.getByText('— Upgrade to add more'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('shows Upgrade CTAs (hero + empty state) instead of Create when at cap with no leagues', () => {
    const onUpgrade = jest.fn();
    render(
      <MLBHome
        {...baseProps}
        leagues={[]}
        leagueCap={{ count: 3, limit: 3, atLimit: true, onUpgrade }}
      />,
    );
    expect(
      screen.queryByRole('button', {
        name: 'Create your first baseball league',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create a new baseball league' }),
    ).not.toBeInTheDocument();
    const upgradeBtns = screen.getAllByRole('button', {
      name: 'Upgrade to add more leagues',
    });
    expect(upgradeBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(upgradeBtns[0]);
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('mentions the free-tier cap in the empty-state copy when leagueCap is provided', () => {
    render(
      <MLBHome
        {...baseProps}
        leagues={[]}
        leagueCap={{ count: 0, limit: 3, atLimit: false, onUpgrade: jest.fn() }}
      />,
    );
    expect(
      screen.getByText(/Free plan includes 3 leagues/),
    ).toBeInTheDocument();
  });

  it('does not mention the cap in empty-state copy when isPremium', () => {
    render(
      <MLBHome
        {...baseProps}
        leagues={[]}
        leagueCap={{ count: 0, limit: 3, atLimit: false, onUpgrade: jest.fn() }}
        isPremium
      />,
    );
    expect(screen.queryByText(/Free plan includes/)).not.toBeInTheDocument();
  });

  it('shows "Unlimited leagues" badge for premium users and hides the cap indicator', () => {
    render(<MLBHome {...baseProps} leagues={LEAGUES} isPremium />);
    expect(screen.getByText('Unlimited leagues')).toBeInTheDocument();
    expect(screen.queryByText(/Your leagues:/)).not.toBeInTheDocument();
  });

  it('renders an Invite Friends action only when onInviteFriends is provided', () => {
    const { rerender } = render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    expect(screen.queryByText('Invite Friends')).not.toBeInTheDocument();
    rerender(
      <MLBHome {...baseProps} leagues={LEAGUES} onInviteFriends={jest.fn()} />,
    );
    expect(screen.getByText('Invite Friends')).toBeInTheDocument();
  });

  it('renders the sign-in notice when unauthenticated', () => {
    render(
      <MLBHome
        {...baseProps}
        leagues={[]}
        isAuthenticated={false}
        onSignIn={jest.fn()}
      />,
    );
    expect(
      screen.getByText(/Sign in to manage your fantasy baseball leagues/i),
    ).toBeInTheDocument();
  });

  it('does not render a Live Scores button when onScoreboard is omitted', () => {
    render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    expect(screen.queryByText('Live Scores')).not.toBeInTheDocument();
  });

  it('renders role chips when permissionLevel is set on leagues', () => {
    render(<MLBHome {...baseProps} leagues={ROLE_LEAGUES} />);
    // Filter bar + row chip each render the label, so ≥2 occurrences per role
    expect(screen.getAllByText('Commish').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('GM').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Member').length).toBeGreaterThanOrEqual(2);
  });

  it('does not render role chips when permissionLevel is absent', () => {
    render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    // No filter bar and no role chips when no league has permissionLevel
    expect(screen.queryByText('Commish')).not.toBeInTheDocument();
    expect(screen.queryByText('GM')).not.toBeInTheDocument();
    expect(screen.queryByText('Member')).not.toBeInTheDocument();
  });

  it('shows the role filter bar only when leagues have permissionLevel data', () => {
    const { rerender } = render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    expect(
      screen.queryByRole('button', { name: 'Filter by All' }),
    ).not.toBeInTheDocument();
    rerender(<MLBHome {...baseProps} leagues={ROLE_LEAGUES} />);
    expect(
      screen.getByRole('button', { name: 'Filter by All' }),
    ).toBeInTheDocument();
  });

  it('filters leagues by role when a filter button is pressed', () => {
    render(<MLBHome {...baseProps} leagues={ROLE_LEAGUES} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by Commish' }));
    expect(screen.getByText('Commish League')).toBeInTheDocument();
    expect(screen.queryByText('GM League')).not.toBeInTheDocument();
    expect(screen.queryByText('Member League')).not.toBeInTheDocument();
  });

  it('renders a Live Scores button and calls onScoreboard when provided', () => {
    const onScoreboard = jest.fn();
    render(
      <MLBHome {...baseProps} leagues={LEAGUES} onScoreboard={onScoreboard} />,
    );
    const btn = screen.getByText('Live Scores');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onScoreboard).toHaveBeenCalledTimes(1);
  });

  it('does not render a Players button when onBrowsePlayers is omitted', () => {
    render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    expect(
      screen.queryByRole('button', { name: 'Browse baseball players' }),
    ).not.toBeInTheDocument();
  });

  it('renders a Players button in the compact hero and calls onBrowsePlayers when provided', () => {
    const onBrowsePlayers = jest.fn();
    render(
      <MLBHome
        {...baseProps}
        leagues={LEAGUES}
        onBrowsePlayers={onBrowsePlayers}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Browse baseball players' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onBrowsePlayers).toHaveBeenCalledTimes(1);
  });

  it('renders a Players button in the full hero when the user has no leagues', () => {
    const onBrowsePlayers = jest.fn();
    render(
      <MLBHome {...baseProps} leagues={[]} onBrowsePlayers={onBrowsePlayers} />,
    );
    const btn = screen.getByRole('button', { name: 'Browse baseball players' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onBrowsePlayers).toHaveBeenCalledTimes(1);
  });

  describe('frozen / archived leagues', () => {
    it('excludes tier-frozen leagues from the active list and shows the archived toggle', () => {
      render(<MLBHome {...baseProps} leagues={[...LEAGUES, FROZEN_LEAGUE]} />);
      expect(screen.queryByText('Frozen Fossils')).not.toBeInTheDocument();
      expect(screen.getByText(/Archived leagues \(1\)/)).toBeInTheDocument();
    });

    it('expands the archived section when the toggle is clicked', () => {
      render(<MLBHome {...baseProps} leagues={[...LEAGUES, FROZEN_LEAGUE]} />);
      fireEvent.click(screen.getByText(/Archived leagues \(1\)/));
      expect(screen.getByText('Frozen Fossils')).toBeInTheDocument();
      // Badge label is 'Archived' (textTransform="uppercase" is CSS-only in tests)
      expect(screen.getByText('Archived')).toBeInTheDocument();
    });

    it('shows the Archived badge (not the draft-status badge) for frozenAt leagues', () => {
      render(
        <MLBHome {...baseProps} leagues={[...LEAGUES, RENEW_FROZEN_LEAGUE]} />,
      );
      fireEvent.click(screen.getByText(/Archived leagues \(1\)/));
      expect(screen.getByText('Ended Eagles')).toBeInTheDocument();
      // Badge label is 'Archived'; 'Week 20' must NOT appear for the archived league
      expect(screen.getByText('Archived')).toBeInTheDocument();
      expect(screen.queryByText('Week 20')).not.toBeInTheDocument();
    });

    it('does not render the archived section when all leagues are active', () => {
      render(<MLBHome {...baseProps} leagues={LEAGUES} />);
      expect(screen.queryByText(/Archived leagues/)).not.toBeInTheDocument();
    });

    it('does not show frozen leagues in the active league grid', () => {
      render(<MLBHome {...baseProps} leagues={[LEAGUES[0], FROZEN_LEAGUE]} />);
      // Active grid shows only the non-frozen league
      expect(screen.getByText('Saturday Sluggers')).toBeInTheDocument();
      // Frozen league is hidden until the toggle is clicked
      expect(screen.queryByText('Frozen Fossils')).not.toBeInTheDocument();
    });
  });

  it('shows only the first 20 leagues and a "show more" button when there are more than 20', () => {
    const manyLeagues: MLBHomeLeague[] = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      name: `League ${i + 1}`,
    }));
    render(<MLBHome {...baseProps} leagues={manyLeagues} />);
    expect(screen.getByText('League 1')).toBeInTheDocument();
    expect(screen.getByText('League 20')).toBeInTheDocument();
    expect(screen.queryByText('League 21')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Show 5 more leagues/i }),
    ).toBeInTheDocument();
  });

  it('reveals the remaining leagues when "show more" is clicked', () => {
    const manyLeagues: MLBHomeLeague[] = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      name: `League ${i + 1}`,
    }));
    render(<MLBHome {...baseProps} leagues={manyLeagues} />);
    fireEvent.click(
      screen.getByRole('button', { name: /Show 5 more leagues/i }),
    );
    expect(screen.getByText('League 21')).toBeInTheDocument();
    expect(screen.getByText('League 25')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Show .* more leagues/i }),
    ).not.toBeInTheDocument();
  });

  it('resets pagination to the first page when the search term changes', () => {
    const manyLeagues: MLBHomeLeague[] = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      name: i < 20 ? `Alpha ${i + 1}` : `Beta ${i - 19}`,
    }));
    render(<MLBHome {...baseProps} leagues={manyLeagues} />);
    fireEvent.click(
      screen.getByRole('button', { name: /Show 5 more leagues/i }),
    );
    expect(screen.getByText('Beta 5')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Search leagues/i), {
      target: { value: 'a' },
    });
    expect(screen.queryByText('Beta 5')).not.toBeInTheDocument();
  });

  it('does not render a Mock Draft button when onMockDraft is omitted', () => {
    render(<MLBHome {...baseProps} leagues={LEAGUES} />);
    expect(screen.queryByText('Mock Draft')).not.toBeInTheDocument();
  });

  it('renders a Mock Draft button in the returning-user hero and calls onMockDraft', () => {
    const onMockDraft = jest.fn();
    render(
      <MLBHome {...baseProps} leagues={LEAGUES} onMockDraft={onMockDraft} />,
    );
    const btn = screen.getByRole('button', {
      name: 'Practice with a mock draft simulator',
    });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onMockDraft).toHaveBeenCalledTimes(1);
  });

  it('renders a Mock Draft button in the new-user hero and calls onMockDraft', () => {
    const onMockDraft = jest.fn();
    render(<MLBHome {...baseProps} leagues={[]} onMockDraft={onMockDraft} />);
    const btn = screen.getByRole('button', {
      name: 'Practice with a mock draft simulator',
    });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onMockDraft).toHaveBeenCalledTimes(1);
  });

  describe('Mock Draft upsell ribbon', () => {
    it('shows "2 / week free" microcopy and upgrade link for free users with onMockDraft', () => {
      const onMockDraft = jest.fn();
      const onMockDraftUpgrade = jest.fn();
      render(
        <MLBHome
          {...baseProps}
          leagues={LEAGUES}
          onMockDraft={onMockDraft}
          onMockDraftUpgrade={onMockDraftUpgrade}
          isPremium={false}
        />,
      );
      expect(
        screen.getAllByText('2 / week free').length,
      ).toBeGreaterThanOrEqual(1);
      const upgradeLinks = screen.getAllByText('Unlimited with Premium');
      expect(upgradeLinks.length).toBeGreaterThanOrEqual(1);
      fireEvent.click(upgradeLinks[0]);
      expect(onMockDraftUpgrade).toHaveBeenCalledTimes(1);
    });

    it('hides the upsell ribbon for premium users', () => {
      render(
        <MLBHome
          {...baseProps}
          leagues={LEAGUES}
          onMockDraft={jest.fn()}
          onMockDraftUpgrade={jest.fn()}
          isPremium
        />,
      );
      expect(screen.queryByText('2 / week free')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Unlimited with Premium'),
      ).not.toBeInTheDocument();
    });

    it('hides the upgrade link when onMockDraftUpgrade is not provided', () => {
      render(
        <MLBHome
          {...baseProps}
          leagues={LEAGUES}
          onMockDraft={jest.fn()}
          isPremium={false}
        />,
      );
      expect(
        screen.getAllByText('2 / week free').length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        screen.queryByText('Unlimited with Premium'),
      ).not.toBeInTheDocument();
    });
  });
});
