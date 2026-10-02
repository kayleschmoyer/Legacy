import {
  getOnboardingStepKey,
  LEGACY_ONBOARDING_KEY,
  migrateLegacyOnboardingFlag,
  readOnboardingStep,
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

describe('readOnboardingStep (LS-6900)', () => {
  const STEP_KEY = getOnboardingStepKey(501);

  it('uses a per-user key', () => {
    expect(STEP_KEY).toBe('ls_onboarding_step_501');
  });

  it('returns 0 when nothing is stored', () => {
    expect(readOnboardingStep(makeStorage(), STEP_KEY)).toBe(0);
  });

  it('returns the stored step index', () => {
    expect(readOnboardingStep(makeStorage({ [STEP_KEY]: '4' }), STEP_KEY)).toBe(
      4,
    );
  });

  it.each(['-1', '1.5', 'abc', ''])(
    'falls back to 0 for the invalid value %j',
    (value) => {
      expect(
        readOnboardingStep(makeStorage({ [STEP_KEY]: value }), STEP_KEY),
      ).toBe(0);
    },
  );
});
