import { act, renderHook } from '@testing-library/react';
import { useBrowserNotificationPermission } from './useBrowserNotificationPermission';

type MockNotification = {
  permission: NotificationPermission;
  requestPermission: jest.Mock;
};

function installNotification(mock: MockNotification): void {
  Object.defineProperty(window, 'Notification', {
    value: mock,
    configurable: true,
    writable: true,
  });
}

describe('useBrowserNotificationPermission (LS-7089)', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'Notification');

  afterEach(() => {
    if (original) Object.defineProperty(window, 'Notification', original);
    else delete (window as { Notification?: unknown }).Notification;
  });

  it("reports 'unsupported' when the Notification API is missing", () => {
    delete (window as { Notification?: unknown }).Notification;
    const { result } = renderHook(() => useBrowserNotificationPermission());
    expect(result.current.permission).toBe('unsupported');
  });

  it('reads the current permission', () => {
    installNotification({ permission: 'denied', requestPermission: jest.fn() });
    const { result } = renderHook(() => useBrowserNotificationPermission());
    expect(result.current.permission).toBe('denied');
  });

  it('request() prompts and returns the resulting permission', async () => {
    const mock: MockNotification = {
      permission: 'default',
      requestPermission: jest.fn().mockImplementation(() => {
        mock.permission = 'granted';
        return Promise.resolve('granted');
      }),
    };
    installNotification(mock);
    const { result } = renderHook(() => useBrowserNotificationPermission());

    let next: string | undefined;
    await act(async () => {
      next = await result.current.request();
    });

    expect(mock.requestPermission).toHaveBeenCalledTimes(1);
    expect(next).toBe('granted');
    expect(result.current.permission).toBe('granted');
  });

  it('re-reads the permission when the window regains focus', () => {
    const mock: MockNotification = {
      permission: 'denied',
      requestPermission: jest.fn(),
    };
    installNotification(mock);
    const { result } = renderHook(() => useBrowserNotificationPermission());

    mock.permission = 'granted';
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(result.current.permission).toBe('granted');
  });
});
