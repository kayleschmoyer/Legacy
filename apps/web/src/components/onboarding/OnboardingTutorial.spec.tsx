/**
 * LS-6902: the tutorial dialog must follow the WAI-ARIA Modal Dialog Pattern —
 * focus moves in on open, Tab/Shift+Tab is trapped, Escape dismisses, and
 * focus is restored on close.
 *
 * Tamagui primitives need a TamaguiProvider that this Jest setup does not
 * configure, so the shared-components/ui primitives are mocked as plain DOM
 * elements; the focus-management code under test runs unmocked.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { OnboardingTutorial } from './OnboardingTutorial';
import * as analytics from '../../utils/analytics';

jest.mock('../../utils/analytics', () => ({
  trackOnboardingStarted: jest.fn(),
  trackOnboardingStepViewed: jest.fn(),
  trackOnboardingSkipped: jest.fn(),
  trackOnboardingCompleted: jest.fn(),
}));

type MockProps = {
  children?: React.ReactNode;
  onPress?: () => void;
  id?: string;
  'aria-label'?: string;
  'aria-modal'?: string;
  'aria-labelledby'?: string;
  role?: string;
};

jest.mock('@legacy-sports/shared-components/ui', () => {
  const ReactActual: typeof React = jest.requireActual('react');
  const passThrough = ({ children, id, role, ...rest }: MockProps) =>
    ReactActual.createElement(
      'div',
      {
        id,
        role,
        'aria-modal': rest['aria-modal'],
        'aria-labelledby': rest['aria-labelledby'],
      },
      children,
    );
  return {
    Button: ({ children, onPress, ...rest }: MockProps) =>
      ReactActual.createElement(
        'button',
        { type: 'button', onClick: onPress, 'aria-label': rest['aria-label'] },
        children,
      ),
    ConceptTooltip: ({ term }: { term: string }) =>
      ReactActual.createElement('span', null, term),
    H2: ({ children, id }: MockProps) =>
      ReactActual.createElement('h2', { id }, children),
    Paragraph: passThrough,
    XStack: passThrough,
    YStack: passThrough,
  };
});

jest.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

jest.mock('../../context/ThemeContext', () => ({
  useThemeContext: () => ({ resolvedTheme: 'dark' }),
}));

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div>
      <button type="button">Background button</button>
      {open && (
        <OnboardingTutorial
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

describe('OnboardingTutorial — modal focus management (LS-6902)', () => {
  it('moves initial focus to the close button when opened', () => {
    render(<OnboardingTutorial onClose={jest.fn()} />);

    expect(document.activeElement).toBe(screen.getByLabelText('Skip tutorial'));
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = jest.fn();
    render(<OnboardingTutorial onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('wraps Tab from the last focusable element back to the first', () => {
    render(<OnboardingTutorial onClose={jest.fn()} />);
    const dialog = screen.getByRole('dialog');
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button'),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    fireEvent.keyDown(document.activeElement ?? last, { key: 'Tab' });

    expect(document.activeElement).toBe(first);
  });

  it('wraps Shift+Tab from the first focusable element to the last', () => {
    render(<OnboardingTutorial onClose={jest.fn()} />);
    const dialog = screen.getByRole('dialog');
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('a[href], button'),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first.focus();
    fireEvent.keyDown(document.activeElement ?? first, {
      key: 'Tab',
      shiftKey: true,
    });

    expect(document.activeElement).toBe(last);
  });

  it('pulls focus back into the dialog if it escapes to the background page', () => {
    render(<Harness onClose={jest.fn()} />);
    const dialog = screen.getByRole('dialog');

    screen.getByText('Background button').focus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab' });

    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('restores focus to the element that opened the dialog on close', () => {
    function OpenerHarness() {
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
    render(<OpenerHarness />);
    const launch = screen.getByText('Launch');
    launch.focus();
    fireEvent.click(launch);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(launch);
  });
});

describe('OnboardingTutorial — backdrop click (LS-6901)', () => {
  it('does not dismiss the tutorial when the backdrop is clicked', () => {
    const onClose = jest.fn();
    render(<OnboardingTutorial onClose={onClose} />);
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;

    fireEvent.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('still dismisses via the explicit Skip button', () => {
    const onClose = jest.fn();
    render(<OnboardingTutorial onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('Skip tutorial'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('OnboardingTutorial — footer skip label (LS-6904)', () => {
  it('labels the footer skip button "Skip tutorial", not the bare word "Skip"', () => {
    const onClose = jest.fn();
    render(<OnboardingTutorial onClose={onClose} />);

    expect(screen.queryByText('Skip')).toBeNull();

    fireEvent.click(screen.getByText('Skip tutorial'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('OnboardingTutorial — Get Started routing (LS-6908)', () => {
  function advanceToLastStep() {
    // The final step swaps "Next →" for "🚀 Get Started".
    while (screen.queryByText('🚀 Get Started') === null) {
      fireEvent.click(screen.getByText('Next →'));
    }
  }

  it('calls onGetStarted, not onClose, from the final Get Started button', () => {
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

  it('still emits a single completed event when Get Started hands off to onGetStarted', () => {
    jest.clearAllMocks();
    render(<OnboardingTutorial onClose={jest.fn()} onGetStarted={jest.fn()} />);

    advanceToLastStep();
    fireEvent.click(screen.getByText('🚀 Get Started'));

    expect(analytics.trackOnboardingCompleted).toHaveBeenCalledTimes(1);
    expect(analytics.trackOnboardingSkipped).not.toHaveBeenCalled();
  });

  it('falls back to onClose on Get Started when onGetStarted is omitted', () => {
    const onClose = jest.fn();
    render(<OnboardingTutorial onClose={onClose} />);

    advanceToLastStep();
    fireEvent.click(screen.getByText('🚀 Get Started'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose, not onGetStarted, when the tutorial is skipped', () => {
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
  beforeEach(() => jest.clearAllMocks());

  it('emits started and the first step view on mount', () => {
    render(<OnboardingTutorial onClose={jest.fn()} />);

    expect(analytics.trackOnboardingStarted).toHaveBeenCalledTimes(1);
    expect(analytics.trackOnboardingStepViewed).toHaveBeenCalledTimes(1);
    expect(analytics.trackOnboardingStepViewed).toHaveBeenLastCalledWith(
      expect.any(String),
      0,
    );
  });

  it('emits a step view for each step advanced to, without re-emitting started', () => {
    render(<OnboardingTutorial onClose={jest.fn()} />);

    fireEvent.click(screen.getByText('Next →'));

    expect(analytics.trackOnboardingStepViewed).toHaveBeenCalledTimes(2);
    expect(analytics.trackOnboardingStepViewed).toHaveBeenLastCalledWith(
      expect.any(String),
      1,
    );
    expect(analytics.trackOnboardingStarted).toHaveBeenCalledTimes(1);
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
    render(<OnboardingTutorial onClose={onClose} />);
    const firstStep = (analytics.trackOnboardingStepViewed as jest.Mock).mock
      .calls[0][0];

    act();

    expect(analytics.trackOnboardingSkipped).toHaveBeenCalledWith(
      firstStep,
      method,
    );
    expect(analytics.trackOnboardingCompleted).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('emits completed (not skipped) when finishing from the last step', () => {
    const onClose = jest.fn();
    render(<OnboardingTutorial onClose={onClose} />);
    while (screen.queryByText('Next →')) {
      fireEvent.click(screen.getByText('Next →'));
    }

    fireEvent.click(screen.getByText('🚀 Get Started'));

    expect(analytics.trackOnboardingCompleted).toHaveBeenCalledTimes(1);
    expect(analytics.trackOnboardingSkipped).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('emits only one terminal event if close fires twice', () => {
    render(<OnboardingTutorial onClose={jest.fn()} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByText('Skip tutorial'));

    expect(analytics.trackOnboardingSkipped).toHaveBeenCalledTimes(1);
  });

  it('does not re-emit started when resuming past the first step', () => {
    render(<OnboardingTutorial onClose={jest.fn()} initialStep={2} />);

    expect(analytics.trackOnboardingStarted).not.toHaveBeenCalled();
    expect(analytics.trackOnboardingStepViewed).toHaveBeenCalledWith(
      expect.any(String),
      2,
    );
  });
});

describe('OnboardingTutorial — step resume (LS-6900)', () => {
  it('opens on step 1 by default', () => {
    render(<OnboardingTutorial onClose={jest.fn()} />);

    expect(screen.getByText(/Step\s*1\s*of/)).toBeInTheDocument();
  });

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
