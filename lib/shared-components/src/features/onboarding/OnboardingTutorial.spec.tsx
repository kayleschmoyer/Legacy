/**
 * Ported from apps/web (LS-6900 step resume, LS-6901 backdrop, LS-6902 modal
 * dismissal, LS-6903 funnel analytics, LS-6904 skip label, LS-6908 Get Started
 * routing, LS-6909 Escape) for the shared Tamagui OnboardingTutorial (LS-10381).
 *
 * Tamagui needs a configured provider that Jest does not set up, so `tamagui`
 * is replaced with plain elements. The Dialog double wires the outside-press
 * guard the same way the real Dialog.Content prop does. Focus trapping belongs
 * to the real Tamagui Dialog and is covered by the apps/web-e2e
 * onboarding-tutorial spec.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { OnboardingTutorial } from './OnboardingTutorial';
import { ONBOARDING_STEPS } from './onboardingSteps';

type Children = { children?: React.ReactNode };
type DomProps = Children & {
  testID?: string;
  role?: string;
  onPress?: () => void;
  'aria-label'?: string;
  'aria-current'?: string;
};

type ContentProps = DomProps & {
  onInteractOutside?: (e: { preventDefault: () => void }) => void;
};

jest.mock('./ConceptTooltip', () => ({
  ConceptTooltip: ({ term }: { term: string }) => <span>{term}</span>,
}));

jest.mock('tamagui', () => {
  const R: typeof React = jest.requireActual('react');
  const el =
    (tag: string) =>
    ({ children, testID, role, onPress, ...rest }: DomProps) =>
      R.createElement(
        tag,
        {
          role,
          'data-testid': testID,
          'aria-label': rest['aria-label'],
          'aria-current': rest['aria-current'],
          onClick: onPress,
        },
        children,
      );
  const Button = ({
    children,
    onPress,
    testID,
    ...rest
  }: DomProps): React.ReactElement =>
    R.createElement(
      'button',
      {
        type: 'button',
        onClick: onPress,
        'data-testid': testID,
        'aria-label': rest['aria-label'],
        'aria-current': rest['aria-current'],
      },
      children,
    );

  const Content = ({
    children,
    testID,
    role,
    onInteractOutside,
  }: ContentProps) => (
    <div
      data-testid="backdrop"
      onClick={() => onInteractOutside?.({ preventDefault: jest.fn() })}
    >
      <div
        role={role}
        aria-modal="true"
        data-testid={testID}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
  const Dialog = Object.assign(
    ({ children }: Children) => <div>{children}</div>,
    {
      Portal: ({ children }: Children) => <div>{children}</div>,
      Overlay: () => null,
      Content,
      Title: ({ children }: Children) => <div>{children}</div>,
    },
  );

  return {
    Button,
    Dialog,
    H2: el('h2'),
    Paragraph: el('p'),
    ScrollView: el('div'),
    Text: el('span'),
    XStack: el('div'),
    YStack: el('div'),
  };
});

const analytics = {
  onStarted: jest.fn(),
  onStepViewed: jest.fn(),
  onCompleted: jest.fn(),
  onSkipped: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

function advanceToLastStep() {
  // The final step swaps "Next →" for "🚀 Get Started".
  while (screen.queryByText('🚀 Get Started') === null) {
    fireEvent.click(screen.getByText('Next →'));
  }
}

describe('OnboardingTutorial — step navigation', () => {
  it('opens on step 1 with no Back button', () => {
    render(<OnboardingTutorial onClose={jest.fn()} />);

    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
    expect(screen.getByText('Welcome to Legacy Sports')).toBeInTheDocument();
    expect(screen.queryByText('← Back')).toBeNull();
    expect(screen.getByTestId('onboarding-step-1')).toBeInTheDocument();
  });

  it('advances with Next and returns with Back', () => {
    render(<OnboardingTutorial onClose={jest.fn()} />);

    fireEvent.click(screen.getByText('Next →'));
    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument();
    expect(screen.getByText('Season Assignment')).toBeInTheDocument();

    fireEvent.click(screen.getByText('← Back'));
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
  });

  it('jumps to a step from the progress dots and marks the current one', () => {
    render(<OnboardingTutorial onClose={jest.fn()} />);

    fireEvent.click(screen.getByLabelText('Go to step 4'));

    expect(screen.getByText('Step 4 of 6')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to step 4')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByLabelText('Go to step 1')).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('renders every step title and shows Get Started on the last', () => {
    render(<OnboardingTutorial onClose={jest.fn()} />);

    for (const [i, s] of ONBOARDING_STEPS.entries()) {
      expect(screen.getByText(s.title)).toBeInTheDocument();
      if (i < ONBOARDING_STEPS.length - 1) {
        fireEvent.click(screen.getByText('Next →'));
      }
    }

    expect(screen.getByText('🚀 Get Started')).toBeInTheDocument();
    expect(screen.queryByText('Skip tutorial')).toBeNull();
  });
});

describe('OnboardingTutorial — step resume (LS-6900)', () => {
  it('opens on the provided initialStep', () => {
    render(<OnboardingTutorial onClose={jest.fn()} initialStep={3} />);

    expect(screen.getByText(/Step\s*4\s*of/)).toBeInTheDocument();
  });

  it('clamps an out-of-range initialStep to a valid step', () => {
    const { unmount } = render(
      <OnboardingTutorial onClose={jest.fn()} initialStep={999} />,
    );
    expect(screen.getByText(/Step\s*6\s*of\s*6/)).toBeInTheDocument();
    unmount();

    render(<OnboardingTutorial onClose={jest.fn()} initialStep={-2} />);
    expect(screen.getByText(/Step\s*1\s*of/)).toBeInTheDocument();
  });

  it('reports each navigation through onStepChange', () => {
    const onStepChange = jest.fn();
    render(
      <OnboardingTutorial
        onClose={jest.fn()}
        initialStep={1}
        onStepChange={onStepChange}
      />,
    );

    fireEvent.click(screen.getByText('Next →'));
    expect(onStepChange).toHaveBeenLastCalledWith(2);

    fireEvent.click(screen.getByText('← Back'));
    expect(onStepChange).toHaveBeenLastCalledWith(1);

    fireEvent.click(screen.getByTestId('onboarding-dot-1'));
    expect(onStepChange).toHaveBeenLastCalledWith(0);
  });
});

describe('OnboardingTutorial — focus restore (LS-6902)', () => {
  it('returns focus to the element that opened the tutorial on close', () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Launch
          </button>
          {open && <OnboardingTutorial onClose={() => setOpen(false)} />}
        </div>
      );
    }
    render(<Harness />);
    const launch = screen.getByText('Launch');
    launch.focus();
    fireEvent.click(launch);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(launch);
  });
});

describe('OnboardingTutorial — skip / close', () => {
  it('dismisses via the ✕ button (LS-6901)', () => {
    const onClose = jest.fn();
    render(<OnboardingTutorial onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('Skip tutorial'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('labels the footer skip "Skip tutorial", not the bare word "Skip" (LS-6904)', () => {
    const onClose = jest.fn();
    render(<OnboardingTutorial onClose={onClose} />);

    expect(screen.queryByText('Skip')).toBeNull();
    fireEvent.click(screen.getByText('Skip tutorial'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss when the backdrop is clicked (LS-6901)', () => {
    const onClose = jest.fn();
    render(<OnboardingTutorial onClose={onClose} />);

    fireEvent.click(screen.getByTestId('backdrop'));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('OnboardingTutorial — Escape is not a confirmed skip (LS-6909)', () => {
  it('calls onClose on Escape when onDismiss is omitted', () => {
    const onClose = jest.fn();
    render(<OnboardingTutorial onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss, not onClose, when Escape is pressed', () => {
    const onClose = jest.fn();
    const onDismiss = jest.fn();
    render(<OnboardingTutorial onClose={onClose} onDismiss={onDismiss} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the ✕ button',
      () => fireEvent.click(screen.getByLabelText('Skip tutorial')),
    ],
    [
      'the footer Skip button',
      () => fireEvent.click(screen.getByText('Skip tutorial')),
    ],
  ])('still calls onClose, not onDismiss, from %s', (_label, act) => {
    const onClose = jest.fn();
    const onDismiss = jest.fn();
    render(<OnboardingTutorial onClose={onClose} onDismiss={onDismiss} />);

    act();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('OnboardingTutorial — Get Started routing (LS-6908)', () => {
  it('calls onGetStarted, not onClose, from the final button', () => {
    const onClose = jest.fn();
    const onGetStarted = jest.fn();
    render(
      <OnboardingTutorial onClose={onClose} onGetStarted={onGetStarted} />,
    );

    advanceToLastStep();
    fireEvent.click(screen.getByText('🚀 Get Started'));

    expect(onGetStarted).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('falls back to onClose when onGetStarted is omitted', () => {
    const onClose = jest.fn();
    render(<OnboardingTutorial onClose={onClose} />);

    advanceToLastStep();
    fireEvent.click(screen.getByText('🚀 Get Started'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose, not onGetStarted, when skipped', () => {
    const onClose = jest.fn();
    const onGetStarted = jest.fn();
    render(
      <OnboardingTutorial onClose={onClose} onGetStarted={onGetStarted} />,
    );

    fireEvent.click(screen.getByText('Skip tutorial'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onGetStarted).not.toHaveBeenCalled();
  });
});

describe('OnboardingTutorial — funnel analytics (LS-6903)', () => {
  it('emits started and the first step view on mount', () => {
    render(<OnboardingTutorial onClose={jest.fn()} analytics={analytics} />);

    expect(analytics.onStarted).toHaveBeenCalledTimes(1);
    expect(analytics.onStepViewed).toHaveBeenCalledTimes(1);
    expect(analytics.onStepViewed).toHaveBeenLastCalledWith('welcome', 0);
  });

  it('emits a step view per step without re-emitting started', () => {
    render(<OnboardingTutorial onClose={jest.fn()} analytics={analytics} />);

    fireEvent.click(screen.getByText('Next →'));

    expect(analytics.onStepViewed).toHaveBeenCalledTimes(2);
    expect(analytics.onStepViewed).toHaveBeenLastCalledWith(
      'season-assignment',
      1,
    );
    expect(analytics.onStarted).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'close_button',
      () => fireEvent.click(screen.getByLabelText('Skip tutorial')),
    ],
    ['skip_button', () => fireEvent.click(screen.getByText('Skip tutorial'))],
    ['escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
  ])('emits skipped with from_step and method=%s', (method, act) => {
    const onClose = jest.fn();
    render(<OnboardingTutorial onClose={onClose} analytics={analytics} />);

    act();

    expect(analytics.onSkipped).toHaveBeenCalledWith('welcome', method);
    expect(analytics.onCompleted).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('emits completed (not skipped) when finishing, including via onGetStarted', () => {
    render(
      <OnboardingTutorial
        onClose={jest.fn()}
        onGetStarted={jest.fn()}
        analytics={analytics}
      />,
    );

    advanceToLastStep();
    fireEvent.click(screen.getByText('🚀 Get Started'));

    expect(analytics.onCompleted).toHaveBeenCalledTimes(1);
    expect(analytics.onSkipped).not.toHaveBeenCalled();
  });

  it('emits only one terminal event if close fires twice', () => {
    render(<OnboardingTutorial onClose={jest.fn()} analytics={analytics} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByText('Skip tutorial'));

    expect(analytics.onSkipped).toHaveBeenCalledTimes(1);
  });

  it('does not re-emit started when resuming past the first step', () => {
    render(
      <OnboardingTutorial
        onClose={jest.fn()}
        initialStep={2}
        analytics={analytics}
      />,
    );

    expect(analytics.onStarted).not.toHaveBeenCalled();
    expect(analytics.onStepViewed).toHaveBeenCalledWith('game-selection', 2);
  });
});

describe('OnboardingTutorial — final-step links and slots', () => {
  it('uses renderLink for the CTAs; activating one navigates and completes', () => {
    const onClose = jest.fn();
    const onNavigate = jest.fn();
    render(
      <OnboardingTutorial
        onClose={onClose}
        onNavigate={onNavigate}
        analytics={analytics}
        renderLink={({ href, onPress, children }) => (
          <a href={href} onClick={onPress}>
            {children}
          </a>
        )}
      />,
    );
    advanceToLastStep();

    fireEvent.click(screen.getByRole('link', { name: /create league/i }));

    expect(onNavigate).toHaveBeenCalledWith('/baseball/league/create');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(analytics.onCompleted).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /view leagues/i })).toHaveAttribute(
      'href',
      '/baseball',
    );
  });

  it('falls back to a pressable link that calls onNavigate', () => {
    const onNavigate = jest.fn();
    const onClose = jest.fn();
    render(<OnboardingTutorial onClose={onClose} onNavigate={onNavigate} />);
    advanceToLastStep();

    fireEvent.click(screen.getByText('View Leagues →'));

    expect(onNavigate).toHaveBeenCalledWith('/baseball');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders default illustrations and lets hosts override or hide them', () => {
    const { unmount } = render(
      <OnboardingTutorial onClose={jest.fn()} initialStep={2} />,
    );
    expect(screen.getByText(/Week 7 Game Slots/)).toBeInTheDocument();
    unmount();

    const { unmount: unmount2 } = render(
      <OnboardingTutorial
        onClose={jest.fn()}
        initialStep={2}
        slots={{ 'game-slots-example': <span>custom slot</span> }}
      />,
    );
    expect(screen.getByText('custom slot')).toBeInTheDocument();
    expect(screen.queryByText(/Week 7 Game Slots/)).toBeNull();
    unmount2();

    render(
      <OnboardingTutorial
        onClose={jest.fn()}
        initialStep={2}
        slots={{ 'game-slots-example': null }}
      />,
    );
    expect(screen.queryByText(/Week 7 Game Slots/)).toBeNull();
  });
});

describe('OnboardingTutorial — copy (LS-10774)', () => {
  it('starts the Game Selection step with a capitalized term', () => {
    render(<OnboardingTutorial onClose={jest.fn()} initialStep={2} />);

    expect(screen.getByText('Game selection')).toBeInTheDocument();
    expect(screen.queryByText('game selection')).toBeNull();
  });

  it('labels the earned-run row ER and uses US spelling', () => {
    render(<OnboardingTutorial onClose={jest.fn()} initialStep={3} />);

    expect(screen.getByText('Earned Run Allowed (ER)')).toBeInTheDocument();
    expect(
      screen.getByText(
        'League commissioners can customize scoring weights in league settings.',
      ),
    ).toBeInTheDocument();
  });

  it('spans the sample week label across every sample game date', () => {
    render(<OnboardingTutorial onClose={jest.fn()} initialStep={4} />);

    expect(screen.getByText('Week 7 · Aug 5–14, 2019')).toBeInTheDocument();
  });
});
