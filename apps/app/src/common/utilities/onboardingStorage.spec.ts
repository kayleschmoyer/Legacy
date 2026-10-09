/**
 * Coverage for the mobile onboarding-completion AsyncStorage adapter (LS-10383).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadOnboardingStorage } from './onboardingStorage';

describe('loadOnboardingStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('serves persisted flags synchronously once hydrated', async () => {
    await AsyncStorage.setItem('ls_onboarding_complete_7', 'true');
    const storage = await loadOnboardingStorage(7);
    expect(storage?.getItem('ls_onboarding_complete_7')).toBe('true');
    expect(storage?.getItem('ls_onboarding_complete_8')).toBeNull();
  });

  it('writes through to AsyncStorage', async () => {
    const storage = await loadOnboardingStorage(7);
    storage?.setItem('ls_onboarding_complete_7', 'true');
    expect(storage?.getItem('ls_onboarding_complete_7')).toBe('true');
    expect(await AsyncStorage.getItem('ls_onboarding_complete_7')).toBe('true');

    storage?.removeItem('ls_onboarding_complete_7');
    expect(storage?.getItem('ls_onboarding_complete_7')).toBeNull();
    expect(await AsyncStorage.getItem('ls_onboarding_complete_7')).toBeNull();
  });

  it('resolves null when the read fails, so callers never trust a partial cache', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error('disk'),
    );
    expect(await loadOnboardingStorage(7)).toBeNull();
  });
});
