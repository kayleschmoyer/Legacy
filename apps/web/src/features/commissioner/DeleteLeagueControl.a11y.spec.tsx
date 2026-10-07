/**
 * LS-10698: Esc did not close the Delete League confirmation dialog while focus
 * was in the "Type the league name" field (where `autoFocus` puts it), but did
 * once the user tabbed to Cancel.
 *
 * Root cause: Tamagui's Dialog dismisses on Escape via a bubble-phase `keydown`
 * listener on `document` (`@tamagui/use-escape-keydown`). Tamagui's `Input` is
 * react-native-web's `TextInput`, whose `handleKeyDown` unconditionally calls
 * `e.stopPropagation()` on every key ("Prevent key events bubbling (see #612)"
 * — node_modules/react-native-web/dist/exports/TextInput/index.js), so Escape
 * never reaches `document` while the input has focus.
 *
 * The real Tamagui `Dialog` can't mount under this project's Jest setup (no
 * `TamaguiProvider` — see BaseModal.spec.tsx), and `@tamagui/*` is
 * moduleNameMapper'd to a stub. So this suite keeps the two pieces the bug
 * lives in faithful: `Input` is the REAL react-native-web `TextInput`, and the
 * Dialog root registers the same document-level Escape listener
 * `useEscapeKeydown` does, calling `onOpenChange(false)` like Dismissable.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { DeleteLeagueControl } from './DeleteLeagueControl';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('@legacy-sports/graphql', () => ({
  useDeleteLeagueMutation: () => [jest.fn(), { loading: false }],
}));

type Children = { children?: React.ReactNode };
type ButtonProps = Children & { onPress?: () => void; disabled?: boolean };
type DialogProps = Children & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

jest.mock('tamagui', () => {
  const ReactActual: typeof React = jest.requireActual('react');
  const { TextInput } = jest.requireActual('react-native-web');

  const PassThrough = ({ children }: Children) => <div>{children}</div>;
  const Button = ({ children, onPress, disabled }: ButtonProps) => (
    <button type="button" onClick={onPress} disabled={!!disabled}>
      {children}
    </button>
  );

  // Mirrors @tamagui/use-escape-keydown: a bubble-phase keydown listener on
  // `document` that dismisses the topmost layer on Escape.
  const DialogRoot = ({ children, open, onOpenChange }: DialogProps) => {
    ReactActual.useEffect(() => {
      if (!open) return undefined;
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') onOpenChange?.(false);
      };
      globalThis.document.addEventListener('keydown', handleKeyDown);
      return () =>
        globalThis.document.removeEventListener('keydown', handleKeyDown);
    }, [open, onOpenChange]);
    return open ? <div role="alertdialog">{children}</div> : null;
  };
  const Dialog = Object.assign(DialogRoot, {
    Portal: PassThrough,
    Overlay: () => null,
    Content: PassThrough,
    Title: ({ children }: Children) => <h2>{children}</h2>,
    Description: ({ children }: Children) => <p>{children}</p>,
    Close: PassThrough,
  });

  return {
    createTokens: (tokens: unknown) => tokens,
    Button,
    Card: PassThrough,
    Dialog,
    Input: TextInput,
    Spinner: () => <span>spinner</span>,
    Text: PassThrough,
    XStack: PassThrough,
    YStack: PassThrough,
  };
});

const openDialog = () => {
  render(<DeleteLeagueControl leagueId={1} leagueName="My League" />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete League' }));
  return screen.getByRole('alertdialog');
};

describe('DeleteLeagueControl — Escape closes the confirmation dialog (LS-10698)', () => {
  it('closes on Escape while focus is in the confirm-name field', () => {
    openDialog();
    const input = screen.getByPlaceholderText('My League');
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('still closes on Escape while focus is on Cancel', () => {
    openDialog();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();

    fireEvent.keyDown(cancel, { key: 'Escape' });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('does not close on other keys typed into the confirm-name field', () => {
    openDialog();
    const input = screen.getByPlaceholderText('My League');
    input.focus();

    fireEvent.keyDown(input, { key: 'a' });

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
