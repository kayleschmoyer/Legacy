import {
  LEGACY_ONBOARDING_KEY,
  migrateLegacyOnboardingFlag,
} from './onboardingStorage';

const USER_KEY = 'ls_onboarding_complete_501';

function makeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

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
