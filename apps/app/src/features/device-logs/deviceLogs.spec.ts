import {
  DeviceLogShareError,
  disableDeviceLogging,
  enableDeviceLogging,
  shareCurrentLogFile,
} from './deviceLogs';

// LS-7661: unit coverage for the shareCurrentLogFile throw paths + truncation.

const LOG_PATH = 'file:///logs/today.log';
const mockGetInfoAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockShare = jest.fn();

jest.mock(
  'expo-file-system/legacy',
  () => ({
    getInfoAsync: (...args: unknown[]): unknown => mockGetInfoAsync(...args),
    readAsStringAsync: (...args: unknown[]): unknown =>
      mockReadAsStringAsync(...args),
  }),
  { virtual: true },
);

jest.mock('react-native', () => ({
  Share: { share: (...args: unknown[]): unknown => mockShare(...args) },
}));

jest.mock('@legacy-sports/logging', () => ({
  DeviceFileOutputDestination: jest.fn().mockImplementation(() => ({
    cleanupOldFiles: jest.fn().mockResolvedValue(undefined),
    getCurrentLogFilePath: (): string => LOG_PATH,
  })),
  LOGGER: { addDestination: jest.fn(), removeDestination: jest.fn() },
}));

async function rejection(): Promise<DeviceLogShareError> {
  const error: unknown = await shareCurrentLogFile().then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DeviceLogShareError);
  return error as DeviceLogShareError;
}

describe('shareCurrentLogFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    disableDeviceLogging();
    mockShare.mockResolvedValue({});
  });

  it("rejects with reason 'disabled' when no destination is active", async () => {
    const error = await rejection();
    expect(error.reason).toBe('disabled');
    expect(error.name).toBe('DeviceLogShareError');
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
  });

  it("rejects with reason 'missing-file' when the log file does not exist", async () => {
    await enableDeviceLogging();
    mockGetInfoAsync.mockResolvedValue({ exists: false });

    const error = await rejection();
    expect(error.reason).toBe('missing-file');
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('shares the full contents when under the size cap', async () => {
    await enableDeviceLogging();
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockReadAsStringAsync.mockResolvedValue('short log');

    await shareCurrentLogFile();

    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'short log' }),
    );
  });

  it('shares only the last 200000 chars when the file is longer', async () => {
    await enableDeviceLogging();
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockReadAsStringAsync.mockResolvedValue(
      'A'.repeat(50) + 'B'.repeat(200_000),
    );

    await shareCurrentLogFile();

    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'B'.repeat(200_000) }),
    );
  });
});
