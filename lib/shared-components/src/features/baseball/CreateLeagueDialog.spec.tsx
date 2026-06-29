import React from 'react';
import { CreateLeagueDialog } from './CreateLeagueDialog';
import { act, fireEvent, render, screen, waitFor } from '../../test-utils';

type Children = { children?: React.ReactNode };
type ButtonProps = Children & {
  onPress?: () => void;
  disabled?: boolean;
  ['aria-label']?: string;
};
type InputProps = {
  value?: string;
  onChangeText?: (next: string) => void;
  onSubmitEditing?: () => void;
  placeholder?: string;
  ['aria-label']?: string;
};
type DialogProps = Children & { open?: boolean };
type TextProps = Children & { onPress?: () => void; role?: string };
type StackProps = Children & { role?: string };

jest.mock('@tamagui/lucide-icons', () => ({
  AlertTriangle: () => <span data-testid="alert-icon" />,
}));

jest.mock('tamagui', () => {
  const PassThrough = ({ children }: Children) => <div>{children}</div>;
  const Stack = ({ children, role }: StackProps) => (
    <div role={role}>{children}</div>
  );
  const Button = ({
    children,
    onPress,
    disabled,
    'aria-label': ariaLabel,
  }: ButtonProps) => (
    <button
      type="button"
      onClick={onPress}
      disabled={!!disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
  const Input = ({
    value,
    onChangeText,
    onSubmitEditing,
    placeholder,
    'aria-label': ariaLabel,
  }: InputProps) => (
    <input
      value={value ?? ''}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChangeText?.(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmitEditing?.();
      }}
    />
  );
  const Text = ({ children, onPress, role }: TextProps) => (
    <span onClick={onPress} role={role}>
      {children}
    </span>
  );
  const DialogRoot = ({ children, open }: DialogProps) =>
    open ? <div>{children}</div> : null;
  const Dialog = Object.assign(DialogRoot, {
    Portal: PassThrough,
    Overlay: () => null,
    Content: ({ children }: Children) => <div role="dialog">{children}</div>,
    Close: PassThrough,
  });
  return {
    Button,
    Dialog,
    H2: ({ children }: Children) => <h2>{children}</h2>,
    Input,
    Paragraph: ({ children }: Children) => <p>{children}</p>,
    Separator: () => <hr />,
    Text,
    XStack: Stack,
    YStack: Stack,
  };
});

const baseProps = {
  open: true,
  onOpenChange: jest.fn(),
  onSubmit: jest.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CreateLeagueDialog', () => {
  it('renders the settings form when open', () => {
    render(<CreateLeagueDialog {...baseProps} />);
    expect(
      screen.getByText(/Configure your league settings/i),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Saturday Sluggers/i),
    ).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(<CreateLeagueDialog {...baseProps} open={false} />);
    expect(
      screen.queryByText(/Configure your league settings/i),
    ).not.toBeInTheDocument();
  });

  it('labels the one-division option as 1 (not None)', () => {
    render(<CreateLeagueDialog {...baseProps} />);
    expect(
      screen.getByRole('button', { name: '1 division' }),
    ).toHaveTextContent('1');
    expect(screen.queryByText('None')).not.toBeInTheDocument();
  });

  it('disables submit until the league name is valid', () => {
    render(<CreateLeagueDialog {...baseProps} />);
    const submit = screen.getByRole('button', { name: 'Create League' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Saturday Sluggers/i), {
      target: { value: 'ab' },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Saturday Sluggers/i), {
      target: { value: 'My League' },
    });
    expect(submit).not.toBeDisabled();
  });

  it('submits the form payload and closes on success', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const onOpenChange = jest.fn();
    render(
      <CreateLeagueDialog
        {...baseProps}
        onSubmit={onSubmit}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Saturday Sluggers/i), {
      target: { value: 'My League' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create League' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ leagueName: 'My League', numberOfTeams: 12 }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows an inline error and stays open when creation fails', async () => {
    const onSubmit = jest
      .fn()
      .mockRejectedValue(new Error('Network error: request failed'));
    const onOpenChange = jest.fn();
    render(
      <CreateLeagueDialog
        {...baseProps}
        onSubmit={onSubmit}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Saturday Sluggers/i), {
      target: { value: 'My League' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create League' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Network error: request failed');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('league name input has no autoFocus (prevents Android keyboard timing race with dialog animation)', () => {
    render(<CreateLeagueDialog {...baseProps} />);
    const input = screen.getByPlaceholderText(/Saturday Sluggers/i);
    expect(input).not.toHaveAttribute('autoFocus');
    expect(input).not.toHaveAttribute('autofocus');
  });

  it('submits when Enter is pressed in the league name input', () => {
    const onSubmit = jest.fn().mockReturnValue(new Promise(() => undefined));
    render(<CreateLeagueDialog {...baseProps} onSubmit={onSubmit} />);
    const nameInput = screen.getByPlaceholderText(/e\.g\., Saturday Sluggers/i);
    fireEvent.change(nameInput, { target: { value: 'Test League' } });
    act(() => {
      fireEvent.keyDown(nameInput, { key: 'Enter', code: 'Enter' });
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ leagueName: 'Test League' }),
    );
  });
});
