/**
 * LS-6098: every BaseModal consumer (UpgradeModal, PlayerDetailModal) opens the
 * dialog via external boolean state rather than Tamagui's `Dialog.Trigger`.
 * Tamagui's own focus-restore fallback only works when a `Dialog.Trigger` is
 * rendered (it calls `context.triggerRef.current?.focus()` — see
 * node_modules/@tamagui/dialog/src/Dialog.tsx:453-456), so without one, closing
 * the dialog left focus stranded.
 *
 * `tamagui`'s real `Dialog` requires a `TamaguiProvider` (media/animation
 * config) this project's Jest setup does not configure anywhere else in the
 * codebase (every other spec file mocks `tamagui` per-file — see
 * PremiumGate.spec.tsx / DeleteLeagueControl.spec.tsx) — without it, the real
 * `Dialog`'s mount/unmount and FocusScope autofocus timers never resolve in
 * jsdom. This mock instead faithfully reproduces the parts of Tamagui's
 * documented Dialog contract this fix depends on: content mounts only while
 * `open`, focus moves inside on mount, Tab/Shift+Tab cycling is trapped while
 * open (mirrors `FocusScope`'s `trapped + loop` behavior), and closing invokes
 * the real `onCloseAutoFocus` handler `BaseModal.tsx` passes in — so the
 * component code under test (the new `previouslyFocusedElementRef` capture +
 * `onCloseAutoFocus` wiring in BaseModal.tsx) runs unmocked.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { BaseModal } from './BaseModal';
import { UpgradeModal } from './UpgradeModal';

type Children = { children?: React.ReactNode };
type CloseAutoFocusHandler = (event: Event) => void;
type PassThroughProps = Children & Record<string, unknown>;
type ButtonProps = Children & {
  onPress?: () => void;
  [key: string]: unknown;
};
type DialogContentProps = Children & {
  onCloseAutoFocus?: CloseAutoFocusHandler;
  role?: string;
  [key: string]: unknown;
};
type DialogRootProps = Children & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

jest.mock('tamagui', () => {
  const ReactActual: typeof React = jest.requireActual('react');
  const DialogCloseContext = ReactActual.createContext(() => undefined);

  function getFocusable(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  // Tamagui's own style/behavior props (bordered, elevate, animation, etc.)
  // aren't valid DOM attributes — forward only the handful of ARIA/DOM
  // attributes these specs actually assert on, matching the same restraint
  // PremiumGate.spec.tsx / DeleteLeagueControl.spec.tsx already use.
  function domSafeProps(
    props: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(props)) {
      if (
        key === 'role' ||
        key.startsWith('aria-') ||
        key.startsWith('data-')
      ) {
        out[key] = props[key];
      }
    }
    return out;
  }

  const PassThrough = ({ children, ...props }: PassThroughProps) =>
    ReactActual.createElement('div', domSafeProps(props), children);
  const Button = ({ children, onPress, ...props }: ButtonProps) =>
    ReactActual.createElement(
      'button',
      { ...domSafeProps(props), onClick: onPress },
      children,
    );

  const DialogContent = ({
    children,
    onCloseAutoFocus,
    ...props
  }: DialogContentProps) => {
    const contentRef = ReactActual.useRef<HTMLDivElement>(null);

    // Mirrors FocusScope's mount-autofocus: move focus to the first tabbable
    // element inside the content once it mounts (real Dialog.tsx:618-628).
    // Real FocusScope defers this via `idle()` (see
    // node_modules/@tamagui/focus-scope/src/FocusScope.tsx's `useAsyncEffect`)
    // specifically so consumers get a same-commit effect tick to capture
    // "what had focus before open" first — deferring here with `setTimeout`
    // preserves that ordering guarantee instead of racing it.
    ReactActual.useEffect(() => {
      const node = contentRef.current;
      if (!node) return;
      const timer = setTimeout(() => {
        const [first] = getFocusable(node);
        first?.focus();
      }, 0);

      // Mirrors FocusScope's unmount-autofocus: real Tamagui fires
      // `onCloseAutoFocus` when the content unmounts (Dialog.tsx:453-456).
      return () => {
        clearTimeout(timer);
        const event = {
          defaultPrevented: false,
          preventDefault() {
            this.defaultPrevented = true;
          },
        } as unknown as Event;
        onCloseAutoFocus?.(event);
      };
    }, []);

    // Mirrors FocusScope's `trapped + loop` Tab cycling (Dialog.tsx uses
    // `trapFocus={context.open}`, always true while this mock is mounted).
    ReactActual.useEffect(() => {
      const node = contentRef.current;
      if (!node) return;
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Tab') return;
        const focusable = getFocusable(node);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = globalThis.document.activeElement;
        if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        }
      };
      globalThis.document.addEventListener('keydown', handleKeyDown);
      return () =>
        globalThis.document.removeEventListener('keydown', handleKeyDown);
    }, []);

    return ReactActual.createElement(
      'div',
      {
        ...domSafeProps(props),
        ref: contentRef,
        role: props.role ?? 'dialog',
      },
      children,
    );
  };

  const DialogRoot = ({ children, open, onOpenChange }: DialogRootProps) =>
    open
      ? ReactActual.createElement(
          DialogCloseContext.Provider,
          { value: () => onOpenChange?.(false) },
          children,
        )
      : null;

  const Dialog = Object.assign(DialogRoot, {
    Portal: PassThrough,
    Overlay: () => null,
    Content: DialogContent,
    // BaseModal.tsx always renders `<Dialog.Close asChild><Button .../></Dialog.Close>`
    // — clone the single child and wire its onClick, matching Radix's real
    // `asChild` merge instead of wrapping it in an extra <button> (invalid
    // HTML: a <button> can't contain a nested <button>).
    Close: ({ children }: Children) => {
      const close = ReactActual.useContext(DialogCloseContext);
      const child = ReactActual.Children.only(children);
      return ReactActual.cloneElement(child, { onPress: close });
    },
  });

  return {
    createTokens: (tokens: unknown) => tokens,
    Button,
    Dialog,
    H3: PassThrough,
    Text: PassThrough,
    XStack: PassThrough,
    YStack: PassThrough,
  };
});

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('../hooks/useStripePrices', () => ({
  useStripePrices: () => ({
    monthlyPriceDisplay: '$9.99',
    annualPriceDisplay: '$99.99',
    annualSavingsPct: '17%',
    pricesFailed: false,
  }),
}));

function ToggleHarness() {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open modal
      </button>
      <BaseModal open={open} onOpenChange={setOpen} title="Test Modal">
        <button type="button">First field</button>
        <button type="button">Second field</button>
      </BaseModal>
    </div>
  );
}

function SequentialUpgradeModalHarness() {
  const [firstOpen, setFirstOpen] = React.useState(false);
  const [secondOpen, setSecondOpen] = React.useState(false);
  return (
    <div>
      <button type="button" onClick={() => setFirstOpen(true)}>
        Open first
      </button>
      <button type="button" onClick={() => setSecondOpen(true)}>
        Open second
      </button>
      <UpgradeModal
        open={firstOpen}
        onOpenChange={setFirstOpen}
        featureName="Player Comparison"
      />
      <UpgradeModal
        open={secondOpen}
        onOpenChange={setSecondOpen}
        featureName="Mock Draft"
      />
    </div>
  );
}

describe('BaseModal — focus capture/restore (LS-6098)', () => {
  it('moves focus inside the dialog content when opened via external state (no Dialog.Trigger)', async () => {
    render(<ToggleHarness />);

    fireEvent.click(screen.getByText('Open modal'));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  it('restores focus to the element that opened the dialog when it closes, without a Dialog.Trigger', async () => {
    render(<ToggleHarness />);

    const openButton = screen.getByText('Open modal');
    openButton.focus();
    expect(document.activeElement).toBe(openButton);

    fireEvent.click(openButton);
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Close'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(openButton);
  });

  it('traps Tab/Shift+Tab focus cycling within the dialog content while open (no regression)', async () => {
    render(<ToggleHarness />);

    fireEvent.click(screen.getByText('Open modal'));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    for (let i = 0; i < 6; i += 1) {
      fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Tab' });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 6; i += 1) {
      fireEvent.keyDown(document.activeElement ?? dialog, {
        key: 'Tab',
        shiftKey: true,
      });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('sequential UpgradeModal instances: closing the first and opening the second restores/moves focus independently with no leftover dialog nodes', async () => {
    render(<SequentialUpgradeModalHarness />);

    const openFirst = screen.getByText('Open first');
    const openSecond = screen.getByText('Open second');

    // Open the first modal from its opener, then close it — focus returns to
    // that opener, and no dialog is left mounted.
    openFirst.focus();
    fireEvent.click(openFirst);

    let dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    fireEvent.click(screen.getByLabelText('Close'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(openFirst);

    // Open the second modal from its own opener — focus moves into it, and
    // closing it restores to the *second* opener, not the first's.
    openSecond.focus();
    fireEvent.click(openSecond);

    dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    fireEvent.click(screen.getByLabelText('Close'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(openSecond);
  });
});
