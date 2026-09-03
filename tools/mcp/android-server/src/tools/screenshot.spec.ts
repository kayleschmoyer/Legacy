import { androidScreenshot, formatTimeoutError } from './screenshot.js';
import { TimeoutError } from '../run-command.js';

describe('androidScreenshot', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns a structured error when the Android SDK cannot be found', async () => {
    const result = await androidScreenshot({});
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Android SDK not found');
  });
});

describe('formatTimeoutError', () => {
  it('appends partial output when present', () => {
    const err = new TimeoutError('Process timed out after 120000ms', 'oops');
    expect(formatTimeoutError(err)).toBe(
      'Process timed out after 120000ms. Partial output: oops',
    );
  });

  it('omits the partial-output suffix when there is none', () => {
    const err = new TimeoutError('Process timed out after 120000ms', '');
    expect(formatTimeoutError(err)).toBe('Process timed out after 120000ms');
  });
});
