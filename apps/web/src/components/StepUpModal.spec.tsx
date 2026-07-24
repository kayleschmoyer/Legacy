/**
 * Regression guard: OAuth-only accounts (Google/Discord) have no password and
 * no MFA, so the step-up challenge must not dead-end them on a password prompt
 * they can never satisfy. Instead the modal confirms the active session with
 * the server (the "checking" mode) and resolves via /step-up/verify with an
 * empty body.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { StepUpModal } from './StepUpModal';

let mockUser: {
  mfaEnabled?: boolean;
  hasPassword?: boolean;
} | null = null;

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({
    config: { oauthProxyUrl: 'https://proxy.test' },
    user: mockUser,
  }),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@tamagui/lucide-icons', () => {
  const Icon = () => <span />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('tamagui', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  const Input = ({
    value,
    onChangeText,
    accessibilityLabel,
    placeholder,
  }: {
    value?: string;
    onChangeText?: (v: string) => void;
    accessibilityLabel?: string;
    placeholder?: string;
  }) => (
    <input
      aria-label={accessibilityLabel}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChangeText?.(e.target.value)}
    />
  );
  const Button = ({
    children,
    onPress,
    disabled,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onPress} disabled={disabled}>
      {children}
    </button>
  );
  const Spinner = () => <span data-testid="spinner" />;
  return new Proxy(
    { Input, Button, Spinner },
    {
      get: (target, prop) =>
        (target as Record<string | symbol, unknown>)[prop] ?? Passthrough,
    },
  );
});

const mockFetch = jest.fn();

beforeEach(() => {
  mockUser = null;
  mockFetch.mockReset();
  global.fetch = mockFetch;
});

describe('StepUpModal — OAuth-only session confirmation', () => {
  it('confirms the session (no password prompt) for a user with no password and no MFA', async () => {
    mockUser = { mfaEnabled: false, hasPassword: false };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, validUntil: 1234 }),
    });
    const onSuccess = jest.fn();

    render(<StepUpModal onSuccess={onSuccess} onDismiss={jest.fn()} />);

    // The server is probed with an empty body — no credential is requested.
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(1234));
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({}));
    // No password input is ever shown to the user.
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('falls back to a password prompt when the server reports a password exists', async () => {
    mockUser = { mfaEnabled: false, hasPassword: false };
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'password_required' }),
    });

    render(<StepUpModal onSuccess={jest.fn()} onDismiss={jest.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Password')).toBeTruthy());
  });

  it('prompts for a password directly when the account has one', () => {
    mockUser = { mfaEnabled: false, hasPassword: true };

    render(<StepUpModal onSuccess={jest.fn()} onDismiss={jest.fn()} />);

    // Straight to the password prompt — no session probe round-trip.
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('recovers to a session probe when a password submit returns no_password', async () => {
    mockUser = { mfaEnabled: false, hasPassword: true };
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'no_password' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, validUntil: 999 }),
      });
    const onSuccess = jest.fn();

    render(<StepUpModal onSuccess={onSuccess} onDismiss={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'whatever' },
    });
    fireEvent.click(screen.getByText('Verify'));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(999));
    // Second call is the empty-body session probe.
    const [, init] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({}));
  });
});
