import { androidLogcat } from './logcat.js';

describe('androidLogcat', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns a structured error when the Android SDK cannot be found', async () => {
    const result = await androidLogcat({});
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Android SDK not found');
  });
});
