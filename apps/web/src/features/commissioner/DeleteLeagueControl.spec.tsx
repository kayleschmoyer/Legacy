/**
 * Regression guard for LS-4030: the outer "Delete League" button must remain
 * disabled through the 2-second post-delete redirect window. Previously,
 * `setLoading(false)` ran immediately after the mutation resolved (before the
 * navigate-to-home timer fired), re-enabling the outer button. A user could
 * click it again, re-open the confirmation dialog, and fire a second delete.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { DeleteLeagueControl } from './DeleteLeagueControl';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Capture a controllable mutation promise so the test decides when the
// mutation resolves — that's when the button-re-enable race window opens.
let mockResolveMutation: (() => void) | null = null;
const mockDeleteLeague = jest.fn(
  () =>
    new Promise<void>((resolve) => {
      mockResolveMutation = () => resolve();
    }),
);
// The `loading: false` field on the second tuple element is intentionally
// inert — DeleteLeagueControl ignores Apollo's mutation `loading` state and
// drives the button-disabled state from its own `useState` local. The test's
// disabled-button assertion therefore reads the local React state directly,
// not this mock field.
jest.mock('../../api/db/graphql.generated', () => ({
  useDeleteLeagueMutation: () => [mockDeleteLeague, { loading: false }],
}));

// Tamagui — swap heavy primitives for plain DOM equivalents so jsdom can
// render and the `disabled` prop reaches the underlying <button>.
type Children = { children?: React.ReactNode };
type ButtonProps = Children & { onPress?: () => void; disabled?: boolean };
type InputProps = {
  value?: string;
  onChangeText?: (next: string) => void;
  placeholder?: string;
};
type DialogProps = Children & { open?: boolean };

jest.mock('tamagui', () => {
  const PassThrough = ({ children }: Children) => <div>{children}</div>;
  const Button = ({ children, onPress, disabled }: ButtonProps) => (
    <button type="button" onClick={onPress} disabled={!!disabled}>
      {children}
    </button>
  );
  const Input = ({ value, onChangeText, placeholder }: InputProps) => (
    <input
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChangeText?.(e.target.value)}
    />
  );
  const Spinner = () => <span>spinner</span>;

  const DialogRoot = ({ children, open }: DialogProps) =>
    open ? <div>{children}</div> : null;
  const Dialog = Object.assign(DialogRoot, {
    Portal: PassThrough,
    Overlay: () => null,
    Content: PassThrough,
    Title: ({ children }: Children) => <h2>{children}</h2>,
    Description: ({ children }: Children) => <p>{children}</p>,
    Close: ({ children }: Children) => <>{children}</>,
  });

  return {
    Button,
    Card: PassThrough,
    Dialog,
    H4: PassThrough,
    Input,
    Spinner,
    Text: PassThrough,
    XStack: PassThrough,
    YStack: PassThrough,
  };
});

const labelMatch = /^(Delete League|Deleting\.\.\.)$/;

const getOuterDeleteButton = (): HTMLButtonElement => {
  // Both the outer trigger and the dialog confirm button render the same
  // "Delete League" / "Deleting..." label. The outer button is the *first*
  // such button in DOM order (it sits above the dialog in the JSX tree).
  const found = screen
    .getAllByRole('button')
    .find((el) => labelMatch.test(el.textContent ?? ''));
  if (!found) throw new Error('outer Delete League button not found');
  return found as HTMLButtonElement;
};

const getConfirmDeleteButton = (): HTMLButtonElement => {
  // The dialog's confirm button is the *last* matching button in DOM order.
  const matches = screen
    .getAllByRole('button')
    .filter((el) => labelMatch.test(el.textContent ?? ''));
  if (matches.length === 0) {
    throw new Error('confirm Delete League button not found');
  }
  return matches[matches.length - 1] as HTMLButtonElement;
};

const resolveMutation = async () => {
  if (!mockResolveMutation) {
    throw new Error('mutation never invoked');
  }
  await act(async () => {
    mockResolveMutation!();
    // Flush the awaited mutation promise so the post-await branch of
    // handleConfirm runs before we make assertions.
    await Promise.resolve();
  });
};

describe('DeleteLeagueControl — LS-4030 double-delete guard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockNavigate.mockClear();
    mockDeleteLeague.mockClear();
    mockResolveMutation = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the outer Delete League button disabled through the 2s redirect window', async () => {
    render(<DeleteLeagueControl leagueId={42} leagueName="Test League" />);

    const outerBefore = getOuterDeleteButton();
    expect(outerBefore).not.toBeDisabled();

    fireEvent.click(outerBefore);

    fireEvent.change(screen.getByPlaceholderText('Test League'), {
      target: { value: 'Test League' },
    });

    fireEvent.click(getConfirmDeleteButton());

    // Mutation is in flight — outer button is disabled.
    expect(getOuterDeleteButton()).toBeDisabled();
    expect(mockDeleteLeague).toHaveBeenCalledTimes(1);

    // Resolve the mutation. After this, the dialog closes but the 2s redirect
    // timer is still pending — the outer button MUST stay disabled.
    await resolveMutation();

    const outerAfter = getOuterDeleteButton();
    expect(outerAfter).toBeDisabled();
    expect(outerAfter.textContent).toBe('Deleting...');
    expect(mockNavigate).not.toHaveBeenCalled();

    // Fast-forward the 2s redirect window.
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('does not fire a second delete if the outer button is clicked during the redirect window', async () => {
    render(<DeleteLeagueControl leagueId={42} leagueName="Test League" />);

    fireEvent.click(getOuterDeleteButton());
    fireEvent.change(screen.getByPlaceholderText('Test League'), {
      target: { value: 'Test League' },
    });
    fireEvent.click(getConfirmDeleteButton());

    await resolveMutation();

    // Simulate a user clicking the outer button again during the 2s window.
    // Because the button is disabled, fireEvent.click is a no-op for the
    // onPress handler — no dialog re-opens, no mutation re-fires.
    fireEvent.click(getOuterDeleteButton());

    expect(mockDeleteLeague).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });
});
