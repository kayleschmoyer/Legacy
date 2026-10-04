import {
  getOnboardingKey,
  LEGACY_ONBOARDING_KEY,
  migrateLegacyOnboardingFlag,
  parseOnboardingComplete,
  serializeOnboardingComplete,
} from './onboardingCompletion';

function makeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const USER_KEY = 'ls_onboarding_complete_501';

describe('getOnboardingKey', () => {
  it('builds the per-user key', () => {
    expect(getOnboardingKey(501)).toBe(USER_KEY);
  });

  it('is prefixed by the legacy global key', () => {
    expect(getOnboardingKey(7).startsWith(`${LEGACY_ONBOARDING_KEY}_`)).toBe(
      true,
    );
  });
});

describe('serializeOnboardingComplete / parseOnboardingComplete', () => {
  it('round-trips true and false', () => {
    expect(parseOnboardingComplete(serializeOnboardingComplete(true))).toBe(
      true,
    );
    expect(parseOnboardingComplete(serializeOnboardingComplete(false))).toBe(
      false,
    );
  });

  it('serializes to JSON booleans', () => {
    expect(serializeOnboardingComplete(true)).toBe('true');
  });

  it('treats a missing value as not completed', () => {
    expect(parseOnboardingComplete(null)).toBe(false);
  });

  it('throws on corrupt JSON so callers can surface it', () => {
    expect(() => parseOnboardingComplete('not-json{')).toThrow();
  });
});

describe('migrateLegacyOnboardingFlag', () => {
  it('returns false and changes nothing when there is no legacy key', () => {
    const storage = makeStorage();
    expect(migrateLegacyOnboardingFlag(storage, USER_KEY)).toBe(false);
    expect(storage.data.size).toBe(0);
  });

  it('migrates a legacy "true" to the per-user key and removes the legacy key', () => {
    const storage = makeStorage({ [LEGACY_ONBOARDING_KEY]: 'true' });
    expect(migrateLegacyOnboardingFlag(storage, USER_KEY)).toBe(true);
    expect(storage.data.get(USER_KEY)).toBe('true');
    expect(storage.data.has(LEGACY_ONBOARDING_KEY)).toBe(false);
  });

  it('treats an unparseable legacy value as completed and migrates it', () => {
    const storage = makeStorage({ [LEGACY_ONBOARDING_KEY]: 'not-json{' });
    expect(migrateLegacyOnboardingFlag(storage, USER_KEY)).toBe(true);
    expect(storage.data.get(USER_KEY)).toBe('true');
    expect(storage.data.has(LEGACY_ONBOARDING_KEY)).toBe(false);
  });

  it('leaves storage untouched when the legacy value is "false"', () => {
    const storage = makeStorage({ [LEGACY_ONBOARDING_KEY]: 'false' });
    expect(migrateLegacyOnboardingFlag(storage, USER_KEY)).toBe(false);
    expect(storage.data.get(LEGACY_ONBOARDING_KEY)).toBe('false');
    expect(storage.data.has(USER_KEY)).toBe(false);
  });
});
