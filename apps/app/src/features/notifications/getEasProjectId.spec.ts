import Constants from 'expo-constants';
import { getEasProjectId } from './getEasProjectId';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

const mockedConstants = Constants as unknown as {
  expoConfig: { extra: Record<string, unknown> } | null;
};

describe('getEasProjectId', () => {
  it('returns the projectId from extra.eas.projectId when configured', () => {
    mockedConstants.expoConfig = {
      extra: { eas: { projectId: 'abcd-1234' } },
    };
    expect(getEasProjectId()).toBe('abcd-1234');
  });

  it('returns undefined when extra.eas is absent', () => {
    mockedConstants.expoConfig = { extra: { oauthProxy: 'x' } };
    expect(getEasProjectId()).toBeUndefined();
  });

  it('returns undefined when projectId is an empty string', () => {
    mockedConstants.expoConfig = { extra: { eas: { projectId: '' } } };
    expect(getEasProjectId()).toBeUndefined();
  });

  it('returns undefined when expoConfig is null', () => {
    mockedConstants.expoConfig = null;
    expect(getEasProjectId()).toBeUndefined();
  });
});
