/**
 * LGN-027: the login error banner must offer a dismiss (×) control and
 * auto-dismiss after a timer, instead of persisting until the next sign-in
 * attempt. These tests render the presentational LoginPage card with tamagui
 * stubbed to plain DOM so the dismiss/auto-dismiss behaviour can be asserted.
 */
import React from 'react';
import { LoginPage } from './LoginPage';
import { act, fireEvent, render, screen } from '../../test-utils';

type Children = { children?: React.ReactNode };
type ButtonProps = Children & {
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
  ['aria-label']?: string;
};
type ViewProps = Children & { testID?: string };
type InputProps = {
  value?: string;
  onChangeText?: (text: string) => void;
  onSubmitEditing?: () => void;
  disabled?: boolean;
  testID?: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  ['aria-label']?: string;
};

jest.mock('tamagui', () => {
  const PassThrough = ({ children }: Children) => <div>{children}</div>;
  const View = ({ children, testID }: ViewProps) => (
    <div data-testid={testID}>{children}</div>
  );
  const Button = ({
    children,
    onPress,
    disabled,
    testID,
    'aria-label': ariaLabel,
  }: ButtonProps) => (
    <button
      type="button"
      onClick={onPress}
      disabled={!!disabled}
      data-testid={testID}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
  const Input = ({
    value,
    onChangeText,
    onSubmitEditing,
    disabled,
    testID,
    placeholder,
    secureTextEntry,
    'aria-label': ariaLabel,
  }: InputProps) => (
    <input
      data-testid={testID}
      aria-label={ariaLabel}
      placeholder={placeholder}
      disabled={!!disabled}
      type={secureTextEntry ? 'password' : 'text'}
      value={value ?? ''}
      onChange={(e) => onChangeText?.(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmitEditing?.();
      }}
    />
  );
  return {
    createTokens: (tokens: unknown) => tokens,
    Theme: PassThrough,
    Card: View,
    YStack: View,
    XStack: View,
    Text: ({ children }: Children) => <span>{children}</span>,
    Spinner: () => <span>spinner</span>,
    Button,
    Input,
  };
});

jest.mock('../../components/icons', () => ({
  BrandIcon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

describe('LoginPage email/password form (LGN-017)', () => {
  it('renders the email/password form when onEmailPasswordSignIn is provided', () => {
    render(
      <LoginPage
        onGoogleSignIn={jest.fn()}
        onEmailPasswordSignIn={jest.fn()}
      />,
    );

    expect(screen.getByTestId('login-email-input')).toBeTruthy();
    expect(screen.getByTestId('login-password-input')).toBeTruthy();
    expect(screen.getByTestId('login-email-password-submit')).toBeTruthy();
  });

  it('does not render the form when onEmailPasswordSignIn is omitted', () => {
    render(<LoginPage onGoogleSignIn={jest.fn()} />);

    expect(screen.queryByTestId('login-email-input')).toBeNull();
    expect(screen.queryByTestId('login-password-input')).toBeNull();
    expect(screen.queryByTestId('login-email-password-submit')).toBeNull();
  });

  it('disables the submit button until both fields are filled', () => {
    render(
      <LoginPage
        onGoogleSignIn={jest.fn()}
        onEmailPasswordSignIn={jest.fn()}
      />,
    );

    const submit = screen.getByTestId('login-email-password-submit');
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('login-email-input'), {
      target: { value: 'mgr@test.ls' },
    });
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('login-password-input'), {
      target: { value: 'secret-pass' },
    });
    expect(submit.disabled).toBe(false);
  });

  it('calls onEmailPasswordSignIn with the trimmed email and password on submit', () => {
    const onEmailPasswordSignIn = jest.fn();
    render(
      <LoginPage
        onGoogleSignIn={jest.fn()}
        onEmailPasswordSignIn={onEmailPasswordSignIn}
      />,
    );

    fireEvent.change(screen.getByTestId('login-email-input'), {
      target: { value: '  mgr@test.ls  ' },
    });
    fireEvent.change(screen.getByTestId('login-password-input'), {
      target: { value: 'secret-pass' },
    });
    fireEvent.click(screen.getByTestId('login-email-password-submit'));

    expect(onEmailPasswordSignIn).toHaveBeenCalledTimes(1);
    expect(onEmailPasswordSignIn).toHaveBeenCalledWith(
      'mgr@test.ls',
      'secret-pass',
    );
  });

  it('submits when Enter is pressed in the password field', () => {
    const onEmailPasswordSignIn = jest.fn();
    render(
      <LoginPage
        onGoogleSignIn={jest.fn()}
        onEmailPasswordSignIn={onEmailPasswordSignIn}
      />,
    );

    fireEvent.change(screen.getByTestId('login-email-input'), {
      target: { value: 'mgr@test.ls' },
    });
    fireEvent.change(screen.getByTestId('login-password-input'), {
      target: { value: 'secret-pass' },
    });
    fireEvent.keyDown(screen.getByTestId('login-password-input'), {
      key: 'Enter',
    });

    expect(onEmailPasswordSignIn).toHaveBeenCalledWith(
      'mgr@test.ls',
      'secret-pass',
    );
  });

  it('does not submit when the email is only whitespace', () => {
    const onEmailPasswordSignIn = jest.fn();
    render(
      <LoginPage
        onGoogleSignIn={jest.fn()}
        onEmailPasswordSignIn={onEmailPasswordSignIn}
      />,
    );

    fireEvent.change(screen.getByTestId('login-email-input'), {
      target: { value: '   ' },
    });
    fireEvent.change(screen.getByTestId('login-password-input'), {
      target: { value: 'secret-pass' },
    });
    fireEvent.keyDown(screen.getByTestId('login-password-input'), {
      key: 'Enter',
    });

    expect(onEmailPasswordSignIn).not.toHaveBeenCalled();
  });
});

describe('LoginPage forgot-password link (LS-5521)', () => {
  it('renders "Forgot password?" when both onEmailPasswordSignIn and onForgotPassword are provided', () => {
    render(
      <LoginPage
        onGoogleSignIn={jest.fn()}
        onEmailPasswordSignIn={jest.fn()}
        onForgotPassword={jest.fn()}
      />,
    );
    expect(screen.getByTestId('login-forgot-password')).toBeTruthy();
  });

  it('does not render "Forgot password?" when onForgotPassword is omitted', () => {
    render(
      <LoginPage
        onGoogleSignIn={jest.fn()}
        onEmailPasswordSignIn={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('login-forgot-password')).toBeNull();
  });

  it('does not render "Forgot password?" when onEmailPasswordSignIn is omitted', () => {
    render(
      <LoginPage onGoogleSignIn={jest.fn()} onForgotPassword={jest.fn()} />,
    );
    expect(screen.queryByTestId('login-forgot-password')).toBeNull();
  });

  it('calls onForgotPassword when the link is pressed', () => {
    const onForgotPassword = jest.fn();
    render(
      <LoginPage
        onGoogleSignIn={jest.fn()}
        onEmailPasswordSignIn={jest.fn()}
        onForgotPassword={onForgotPassword}
      />,
    );
    fireEvent.click(screen.getByTestId('login-forgot-password'));
    expect(onForgotPassword).toHaveBeenCalledTimes(1);
  });
});

describe('LoginPage error banner (LGN-027)', () => {
  it('shows a dismiss control that clears the error when onDismissError is provided', () => {
    const onDismissError = jest.fn();
    render(
      <LoginPage
        onGoogleSignIn={jest.fn()}
        errorMessage="Sign-in failed."
        onDismissError={onDismissError}
      />,
    );

    const dismiss = screen.getByTestId('login-error-dismiss');
    fireEvent.click(dismiss);
    expect(onDismissError).toHaveBeenCalledTimes(1);
  });

  it('does not render a dismiss control when onDismissError is omitted', () => {
    render(
      <LoginPage onGoogleSignIn={jest.fn()} errorMessage="Sign-in failed." />,
    );

    expect(screen.getByTestId('login-error')).toBeTruthy();
    expect(screen.queryByTestId('login-error-dismiss')).toBeNull();
  });

  it('auto-dismisses the error after the timer elapses', () => {
    jest.useFakeTimers();
    try {
      const onDismissError = jest.fn();
      render(
        <LoginPage
          onGoogleSignIn={jest.fn()}
          errorMessage="Sign-in failed."
          onDismissError={onDismissError}
        />,
      );

      expect(onDismissError).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(8000);
      });
      expect(onDismissError).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not start an auto-dismiss timer when onDismissError is omitted', () => {
    jest.useFakeTimers();
    try {
      render(
        <LoginPage onGoogleSignIn={jest.fn()} errorMessage="Sign-in failed." />,
      );
      // No callback to fire; advancing timers must not throw and the banner stays.
      act(() => {
        jest.advanceTimersByTime(8000);
      });
      expect(screen.getByTestId('login-error')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
