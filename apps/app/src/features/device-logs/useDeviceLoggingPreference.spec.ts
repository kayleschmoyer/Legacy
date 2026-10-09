import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDeviceLoggingPreference } from './useDeviceLoggingPreference';

// LS-7661: the non-admin guard must hold even when storage says 'true'.

const mockHasItem = jest.fn();
const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockEnableDeviceLogging = jest.fn();
const mockDisableDeviceLogging = jest.fn();

jest.mock('@legacy-sports/shared-components', () => ({
  secureStorage: {
    hasItem: (...args: unknown[]): unknown => mockHasItem(...args),
    getItem: (...args: unknown[]): unknown => mockGetItem(...args),
    setItem: (...args: unknown[]): unknown => mockSetItem(...args),
  },
}));

jest.mock('./deviceLogs', () => ({
  DEVICE_LOGS_PREF_KEY: 'enable_device_logs',
  enableDeviceLogging: (...args: unknown[]): unknown =>
    mockEnableDeviceLogging(...args),
  disableDeviceLogging: (...args: unknown[]): unknown =>
    mockDisableDeviceLogging(...args),
}));

describe('useDeviceLoggingPreference', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasItem.mockResolvedValue(false);
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockEnableDeviceLogging.mockResolvedValue(undefined);
  });

  it('keeps enabled false and does not enable logging when a non-admin calls setEnabled(true)', async () => {
    const { result } = renderHook(() => useDeviceLoggingPreference(false));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.enabled).toBe(false);
    expect(mockSetItem).toHaveBeenCalledWith('enable_device_logs', 'false');
    expect(mockEnableDeviceLogging).not.toHaveBeenCalled();
  });

  it('loads as disabled and disables logging for a non-admin with a stored true', async () => {
    mockHasItem.mockResolvedValue(true);
    mockGetItem.mockResolvedValue('true');

    const { result } = renderHook(() => useDeviceLoggingPreference(false));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.enabled).toBe(false);
    expect(mockDisableDeviceLogging).toHaveBeenCalled();
    expect(mockEnableDeviceLogging).not.toHaveBeenCalled();
  });

  it('enables logging for an admin with a stored true', async () => {
    mockHasItem.mockResolvedValue(true);
    mockGetItem.mockResolvedValue('true');

    const { result } = renderHook(() => useDeviceLoggingPreference(true));
    await waitFor(() => expect(result.current.enabled).toBe(true));

    expect(mockEnableDeviceLogging).toHaveBeenCalled();
  });
});
