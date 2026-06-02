import { CONFIG_KEYS } from './registry';

describe('CONFIG_KEYS registry', () => {
  it('seeds all v1 expected keys', () => {
    const expected = [
      'statsApiUrl',
      'websocketUrl',
      'rollbarToken',
      'giphyApiKey',
      'growthbookClientKey',
      'oauthProxy',
      'graphqlHost',
      'googleClientId',
      'appBaseUrl',
      // Web-only keys (no mobile counterpart)
      'environmentName',
      'authTestMode',
      'discordClientId',
      'appVersion',
      'commitSha',
      'buildDate',
      'branch',
      'rollbarCaptureRate',
      'googleAnalyticsMeasurementId',
      'jiraProxyUrl',
      'stripeMonthlyPriceId',
      'stripeAnnualPriceId',
      'vapidPublicKey',
      'imageUploadUrl',
      'repoUrl',
    ];
    for (const key of expected) {
      expect(Object.keys(CONFIG_KEYS)).toContain(key);
    }
  });

  it('clientSafe:false keys must not declare web or mobile names (AC5)', () => {
    const violations = (
      Object.entries(CONFIG_KEYS) as [
        string,
        { clientSafe: boolean; required: boolean },
      ][]
    )
      .filter(([, entry]) => !entry.clientSafe)
      .flatMap(([key, entry]) => {
        const v: string[] = [];
        if ('web' in entry) v.push(`${key}.web`);
        if ('mobile' in entry) v.push(`${key}.mobile`);
        return v;
      });

    expect(violations).toEqual([]);
  });

  it('all v1 keys are clientSafe:true', () => {
    for (const [, entry] of Object.entries(CONFIG_KEYS)) {
      expect(entry.clientSafe).toBe(true);
    }
  });

  it('rollbarToken has a node env var name', () => {
    expect('node' in CONFIG_KEYS.rollbarToken).toBe(true);
    expect(CONFIG_KEYS.rollbarToken.node).toBe('ROLLBAR_ACCESS_TOKEN');
  });
});
