/**
 * Regression guard for LS-4042 / LS-4030: the outer "Delete League" button
 * must remain disabled after the mutation resolves until the parent navigates
 * away (via onDeleted). Previously setLoading(false) ran before onDeleted,
 * re-enabling the button and allowing a second delete tap.
 */
import React from 'react';
import { DeleteLeagueControl } from './DeleteLeagueControl';
import { act, fireEvent, render, screen } from '../../test-utils';

let mockResolveMutation: (() => void) | null = null;
const mockDeleteLeague = jest.fn(
  () =>
    new Promise<{ data: { deleteLeague: boolean } }>((resolve) => {
      mockResolveMutation = () => resolve({ data: { deleteLeague: true } });
    }),
);
jest.mock('../../api/db/graphql.generated', () => ({
  useDeleteLeagueMutation: () => [mockDeleteLeague, { loading: false }],
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn() },
}));

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
  const Separator = () => <hr />;

  const DialogRoot = ({ children, open }: DialogProps) =>
    open ? <div>{children}</div> : null;
  const Dialog = Object.assign(DialogRoot, {
    Portal: PassThrough,
    Overlay: () => null,
    Content: PassThrough,
    Title: ({ children }: Children) => <h2>{children}</h2>,
    Description: ({ children }: Children) => <p>{children}</p>,
    Close: PassThrough,
  });

  return {
    Button,
    Card: PassThrough,
    Dialog,
    H4: PassThrough,
    Input,
    Separator,
    Spinner,
    Text: PassThrough,
    XStack: PassThrough,
    YStack: PassThrough,
  };
});

const labelMatch = /^(Delete League|Deleting\.\.\.)$/;

const getOuterDeleteButton = (): HTMLButtonElement => {
  const found = screen
    .getAllByRole('button')
    .find((el) => labelMatch.test(el.textContent ?? ''));
  if (!found) throw new Error('outer Delete League button not found');
  return found as HTMLButtonElement;
};

const getConfirmDeleteButton = (): HTMLButtonElement => {
  const matches = screen
    .getAllByRole('button')
    .filter((el) => labelMatch.test(el.textContent ?? ''));
  if (matches.length === 0)
    throw new Error('confirm Delete League button not found');
  return matches[matches.length - 1] as HTMLButtonElement;
};

const resolveMutation = async () => {
  const resolve = mockResolveMutation;
  if (resolve === null) throw new Error('mutation never invoked');
  await act(async () => {
    resolve();
    await Promise.resolve();
  });
};

describe('DeleteLeagueControl — LS-4042 double-delete guard', () => {
  beforeEach(() => {
    mockDeleteLeague.mockClear();
    mockResolveMutation = null;
  });

  it('keeps the outer button disabled after mutation resolves until onDeleted fires', async () => {
    const onDeleted = jest.fn();
    render(
      <DeleteLeagueControl
        leagueId={42}
        leagueName="Test League"
        onDeleted={onDeleted}
      />,
    );

    expect(getOuterDeleteButton()).not.toBeDisabled();

    fireEvent.click(getOuterDeleteButton());
    fireEvent.change(screen.getByPlaceholderText('Test League'), {
      target: { value: 'Test League' },
    });
    fireEvent.click(getConfirmDeleteButton());

    // Mutation in-flight — button disabled.
    expect(getOuterDeleteButton()).toBeDisabled();

    // Resolve the mutation — button must stay disabled until onDeleted unmounts.
    await resolveMutation();

    expect(getOuterDeleteButton()).toBeDisabled();
    expect(getOuterDeleteButton().textContent).toBe('Deleting...');
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('does not fire a second delete if the outer button is clicked after mutation resolves', async () => {
    const onDeleted = jest.fn();
    render(
      <DeleteLeagueControl
        leagueId={42}
        leagueName="Test League"
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(getOuterDeleteButton());
    fireEvent.change(screen.getByPlaceholderText('Test League'), {
      target: { value: 'Test League' },
    });
    fireEvent.click(getConfirmDeleteButton());
    await resolveMutation();

    // Outer button is disabled — clicking it is a no-op.
    fireEvent.click(getOuterDeleteButton());

    expect(mockDeleteLeague).toHaveBeenCalledTimes(1);
  });

  it('re-enables the button on mutation error so the user can retry', async () => {
    const mockDeleteLeagueError = jest
      .fn()
      .mockRejectedValue(new Error('fail'));
    jest
      .mocked(mockDeleteLeague)
      .mockImplementationOnce(mockDeleteLeagueError as typeof mockDeleteLeague);

    const onError = jest.fn();
    render(
      <DeleteLeagueControl
        leagueId={42}
        leagueName="Test League"
        onError={onError}
      />,
    );

    fireEvent.click(getOuterDeleteButton());
    fireEvent.change(screen.getByPlaceholderText('Test League'), {
      target: { value: 'Test League' },
    });
    await act(async () => {
      fireEvent.click(getConfirmDeleteButton());
      await Promise.resolve();
    });

    // Button must be re-enabled after an error so the user can retry.
    expect(getOuterDeleteButton()).not.toBeDisabled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('re-enables the button when mutation resolves false so the user can retry', async () => {
    jest
      .mocked(mockDeleteLeague)
      .mockImplementationOnce(() =>
        Promise.resolve({ data: { deleteLeague: false } }),
      );

    const onError = jest.fn();
    render(
      <DeleteLeagueControl
        leagueId={42}
        leagueName="Test League"
        onError={onError}
      />,
    );

    fireEvent.click(getOuterDeleteButton());
    fireEvent.change(screen.getByPlaceholderText('Test League'), {
      target: { value: 'Test League' },
    });
    await act(async () => {
      fireEvent.click(getConfirmDeleteButton());
      await Promise.resolve();
    });

    // setLoading(false) in the else branch re-enables the button.
    expect(getOuterDeleteButton()).not.toBeDisabled();
    expect(onError).toHaveBeenCalledWith(new Error('Failed to delete league'));
  });
});
