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

jest.mock('./ConceptTooltip', () => ({
  ConceptTooltip: ({ term }: { term: string }) => <span>{term}</span>,
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
