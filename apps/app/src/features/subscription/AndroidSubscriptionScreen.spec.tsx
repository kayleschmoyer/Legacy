import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';

// ── Component under test ─────────────────────────────────────────────────────
import { AndroidSubscriptionScreen } from './AndroidSubscriptionScreen';

// ── Mocks ────────────────────────────────────────────────────────────────────

type MockProps = { children?: React.ReactNode; [key: string]: unknown };

// Mock tamagui to plain React Native primitives so the component renders
// without a TamaguiProvider/theme in the test environment (mirrors
// PremiumGate.spec.tsx).
jest.mock('tamagui', () => {
  const { View, Text, Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const container = ({ children }: MockProps) =>
    ReactActual.createElement(View, null, children);
  return {
    YStack: container,
    XStack: container,
    Text: ({ children }: MockProps) =>
      ReactActual.createElement(Text, null, children),
    Card: ({ children, onPress }: MockProps & { onPress?: () => void }) =>
      ReactActual.createElement(Pressable, { onPress }, children),
    Button: ({ children, onPress }: MockProps & { onPress?: () => void }) =>
      ReactActual.createElement(
        Pressable,
        { onPress },
        ReactActual.createElement(Text, null, children),
      ),
  };
});

const mockPurchase = jest.fn();
const mockRestorePurchases = jest.fn();
const mockClearError = jest.fn();
let mockIsSubscribed = false;
let mockError: string | null = null;

jest.mock('./useGooglePlayBilling', () => ({
  useGooglePlayBilling: () => ({
    products: [
      {
        productId: 'com.legacysports.app.premium.monthly',
        localizedPrice: '$4.99',
        description: '',
      },
    ],
    loading: false,
    error: mockError,
    isSubscribed: mockIsSubscribed,
    purchase: mockPurchase,
    restorePurchases: mockRestorePurchases,
    clearError: mockClearError,
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSubscribed = false;
  mockError = null;
  mockPurchase.mockResolvedValue(undefined);
  mockRestorePurchases.mockResolvedValue(undefined);
  Object.defineProperty(Platform, 'OS', { get: () => 'android' });
});

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS });
});

describe('AndroidSubscriptionScreen', () => {
  it('fires onSubscriptionComplete once when isSubscribed flips after a purchase', async () => {
    const onComplete = jest.fn();
    const { rerender } = render(
      <AndroidSubscriptionScreen onSubscriptionComplete={onComplete} />,
    );

    fireEvent.press(screen.getByText('Monthly Plan'));
    await act(() => Promise.resolve());
    expect(mockPurchase).toHaveBeenCalledWith(
      'com.legacysports.app.premium.monthly',
    );
    // Awaiting purchase() alone must not fire the callback (stale closure).
    expect(onComplete).not.toHaveBeenCalled();

    mockIsSubscribed = true;
    rerender(<AndroidSubscriptionScreen onSubscriptionComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalledTimes(1);

    rerender(<AndroidSubscriptionScreen onSubscriptionComplete={onComplete} />);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('shows the restored alert and fires onSubscriptionComplete on OK after a restore', async () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const onComplete = jest.fn();
    const { rerender } = render(
      <AndroidSubscriptionScreen onSubscriptionComplete={onComplete} />,
    );

    fireEvent.press(screen.getByText('Restore Purchases'));
    await act(() => Promise.resolve());
    expect(mockRestorePurchases).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();

    mockIsSubscribed = true;
    rerender(<AndroidSubscriptionScreen onSubscriptionComplete={onComplete} />);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('Purchases Restored');
    expect(onComplete).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0][2];
    buttons?.[0].onPress?.();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('drops a failed purchase intent so a later restore shows the alert', async () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const onComplete = jest.fn();
    const { rerender } = render(
      <AndroidSubscriptionScreen onSubscriptionComplete={onComplete} />,
    );

    fireEvent.press(screen.getByText('Monthly Plan'));
    await act(() => Promise.resolve());
    mockError = 'Purchase failed';
    rerender(<AndroidSubscriptionScreen onSubscriptionComplete={onComplete} />);

    fireEvent.press(screen.getByText('Restore Purchases'));
    await act(() => Promise.resolve());
    mockError = null;
    mockIsSubscribed = true;
    rerender(<AndroidSubscriptionScreen onSubscriptionComplete={onComplete} />);

    expect(onComplete).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fire anything when already subscribed on mount', () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const onComplete = jest.fn();
    mockIsSubscribed = true;

    render(<AndroidSubscriptionScreen onSubscriptionComplete={onComplete} />);

    expect(onComplete).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.getByText("You're subscribed!")).toBeTruthy();
  });

  it('renders nothing when not on Android', () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios' });
    render(<AndroidSubscriptionScreen />);
    expect(screen.queryByText('Restore Purchases')).toBeNull();
  });
});
