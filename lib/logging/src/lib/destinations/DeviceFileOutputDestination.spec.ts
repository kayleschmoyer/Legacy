type FileInfo = { exists: boolean };

const writeAsStringAsync = jest.fn<Promise<void>, [string, string]>();
const readAsStringAsync = jest.fn<Promise<string>, [string]>();
const getInfoAsync = jest.fn<Promise<FileInfo>, [string]>();
const makeDirectoryAsync = jest.fn<
  Promise<void>,
  [string, { intermediates: boolean }]
>();
const readDirectoryAsync = jest.fn<Promise<string[]>, [string]>();
const deleteAsync = jest.fn<Promise<void>, [string, { idempotent: boolean }]>();

jest.mock(
  'expo-file-system/legacy',
  () => ({
    get documentDirectory() {
      return 'file:///docs/';
    },
    writeAsStringAsync,
    readAsStringAsync,
    getInfoAsync,
    makeDirectoryAsync,
    readDirectoryAsync,
    deleteAsync,
  }),
  { virtual: true },
);

import { DeviceFileOutputDestination } from './DeviceFileOutputDestination.native';
import type { LogEntry } from '../types';

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    level: 'info',
    message: 'hello',
    args: [],
    timestamp: new Date('2026-05-22T10:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  writeAsStringAsync.mockReset().mockResolvedValue();
  readAsStringAsync.mockReset().mockResolvedValue('');
  getInfoAsync.mockReset().mockResolvedValue({ exists: false });
  makeDirectoryAsync.mockReset().mockResolvedValue();
  readDirectoryAsync.mockReset().mockResolvedValue([]);
  deleteAsync.mockReset().mockResolvedValue();
});

describe('DeviceFileOutputDestination', () => {
  it('writes NDJSON lines to the dated file under documentDirectory/logs', async () => {
    const dest = new DeviceFileOutputDestination({
      now: () => new Date('2026-05-22T10:00:00Z'),
    });

    dest.write(entry({ message: 'first', args: ['a', 1] }));
    await new Promise((r) => setImmediate(r));

    expect(makeDirectoryAsync).toHaveBeenCalledWith('file:///docs/logs/', {
      intermediates: true,
    });
    expect(writeAsStringAsync).toHaveBeenCalledTimes(1);
    const [path, contents] = writeAsStringAsync.mock.calls[0];
    expect(path).toBe('file:///docs/logs/legacy-sports-2026-05-22.log');
    expect(contents.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(contents.trim()) as Record<string, unknown>;
    expect(parsed).toEqual({
      level: 'info',
      timestamp: '2026-05-22T10:00:00.000Z',
      message: 'first',
      args: ['a', 1],
    });
  });

  it('appends to existing file by read+rewrite', async () => {
    getInfoAsync.mockResolvedValue({ exists: true });
    readAsStringAsync.mockResolvedValue('{"level":"info"}\n');

    const dest = new DeviceFileOutputDestination({
      now: () => new Date('2026-05-22T10:00:00Z'),
    });
    dest.write(entry({ message: 'second' }));
    await new Promise((r) => setImmediate(r));

    expect(writeAsStringAsync).toHaveBeenCalledTimes(1);
    const [, contents] = writeAsStringAsync.mock.calls[0];
    expect(contents.startsWith('{"level":"info"}\n')).toBe(true);
    expect(contents).toContain('"message":"second"');
  });

  it('rotates filenames across the day boundary', async () => {
    let day = 22;
    const dest = new DeviceFileOutputDestination({
      now: () => new Date(`2026-05-${String(day).padStart(2, '0')}T23:59:59Z`),
    });

    dest.write(entry());
    await new Promise((r) => setImmediate(r));
    day = 23;
    dest.write(entry());
    await new Promise((r) => setImmediate(r));

    const paths = writeAsStringAsync.mock.calls.map((c) => c[0]);
    expect(paths).toEqual([
      'file:///docs/logs/legacy-sports-2026-05-22.log',
      'file:///docs/logs/legacy-sports-2026-05-23.log',
    ]);
  });

  it('cleanupOldFiles deletes files older than retentionDays', async () => {
    getInfoAsync.mockResolvedValue({ exists: true });
    readDirectoryAsync.mockResolvedValue([
      'legacy-sports-2026-05-14.log', // outside window — delete
      'legacy-sports-2026-05-15.log', // outside window — delete
      'legacy-sports-2026-05-16.log', // boundary (today − 6) — keep
      'legacy-sports-2026-05-22.log', // today — keep
      'other-file.txt', // ignored
    ]);

    const dest = new DeviceFileOutputDestination({
      now: () => new Date('2026-05-22T10:00:00Z'),
      retentionDays: 7,
    });
    await dest.cleanupOldFiles();

    const deleted = deleteAsync.mock.calls.map((c) => c[0]).sort();
    expect(deleted).toEqual([
      'file:///docs/logs/legacy-sports-2026-05-14.log',
      'file:///docs/logs/legacy-sports-2026-05-15.log',
    ]);
  });

  it('does not write when documentDirectory is unavailable', async () => {
    const dest = new DeviceFileOutputDestination({ documentDirectory: null });
    dest.write(entry());
    await new Promise((r) => setImmediate(r));

    expect(writeAsStringAsync).not.toHaveBeenCalled();
    expect(dest.getCurrentLogFilePath()).toBeNull();
    expect(dest.shouldLog?.('info')).toBe(false);
  });

  it('swallows filesystem errors silently', async () => {
    writeAsStringAsync.mockRejectedValue(new Error('disk full'));
    const dest = new DeviceFileOutputDestination({
      now: () => new Date('2026-05-22T10:00:00Z'),
    });
    expect(() => dest.write(entry())).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });
});
