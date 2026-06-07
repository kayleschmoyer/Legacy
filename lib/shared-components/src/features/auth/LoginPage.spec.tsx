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
  return {
    Theme: PassThrough,
    Card: View,
    YStack: View,
    XStack: View,
    Text: ({ children }: Children) => <span>{children}</span>,
    Spinner: () => <span>spinner</span>,
    Button,
  };
});

jest.mock('../../components/icons', () => ({
  BrandIcon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

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
