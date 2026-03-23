import {
  _resetCache,
  getAccessToken,
  getApiBaseUrl,
  getSiteUrl,
} from './oauth';

const VALID_CREDS = {
  client_id: 'test-client-id',
  client_secret: 'test-client-secret',
  cloud_id: 'test-cloud-id',
  site_url: 'https://test.atlassian.net',
};

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      SecretString: JSON.stringify(VALID_CREDS),
    }),
  })),
  GetSecretValueCommand: jest.fn(),
}));

let fetchSpy: jest.MockedFunction<typeof fetch>;

function makeTokenResponse(expiresIn = 3600): Response {
  return new Response(
    JSON.stringify({
      access_token: 'mock-access-token',
      expires_in: expiresIn,
      token_type: 'Bearer',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

beforeEach(() => {
  _resetCache();
  fetchSpy = jest.spyOn(global, 'fetch') as jest.MockedFunction<typeof fetch>;
});

afterEach(() => {
  fetchSpy.mockRestore();
  jest.clearAllMocks();
});

describe('getAccessToken', () => {
  it('requests a token from Atlassian OAuth endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(makeTokenResponse());

    const token = await getAccessToken('jira-secret');

    expect(token).toBe('mock-access-token');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://auth.atlassian.com/oauth/token');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init?.body as string) as Record<string, string>;
    expect(body.grant_type).toBe('client_credentials');
    expect(body.client_id).toBe('test-client-id');
    expect(body.client_secret).toBe('test-client-secret');
  });

  it('returns cached token on subsequent calls within expiry window', async () => {
    fetchSpy.mockResolvedValueOnce(makeTokenResponse());

    const token1 = await getAccessToken('jira-secret');
    const token2 = await getAccessToken('jira-secret');

    expect(token1).toBe('mock-access-token');
    expect(token2).toBe('mock-access-token');
    // Only one fetch call — second used the cache
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refreshes token after expiry', async () => {
    // First token expires in 1 second (minus 60s buffer = already expired)
    fetchSpy.mockResolvedValueOnce(makeTokenResponse(0)).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'refreshed-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const token1 = await getAccessToken('jira-secret');
    expect(token1).toBe('mock-access-token');

    // Second call should fetch a new token since the first expired immediately
    const token2 = await getAccessToken('jira-secret');
    expect(token2).toBe('refreshed-token');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws when token request fails', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    await expect(getAccessToken('jira-secret')).rejects.toThrow(
      'OAuth token request failed (401)',
    );
  });
});

describe('getApiBaseUrl', () => {
  it('returns the cloud API base URL', async () => {
    const url = await getApiBaseUrl('jira-secret');
    expect(url).toBe('https://api.atlassian.com/ex/jira/test-cloud-id');
  });
});

describe('getSiteUrl', () => {
  it('returns the site URL for browse links', async () => {
    const url = await getSiteUrl('jira-secret');
    expect(url).toBe('https://test.atlassian.net');
  });
});

describe('credential validation', () => {
  it('throws when secret is missing required fields', async () => {
    const { SecretsManagerClient }: { SecretsManagerClient: jest.Mock } =
      jest.requireMock('@aws-sdk/client-secrets-manager');
    SecretsManagerClient.mockImplementationOnce(() => ({
      send: jest.fn().mockResolvedValue({
        SecretString: JSON.stringify({ client_id: 'only-id' }),
      }),
    }));

    _resetCache();
    fetchSpy.mockResolvedValueOnce(makeTokenResponse());

    await expect(getAccessToken('jira-secret')).rejects.toThrow(
      'missing required OAuth fields',
    );
  });

  it('throws when secret has no string value', async () => {
    const { SecretsManagerClient }: { SecretsManagerClient: jest.Mock } =
      jest.requireMock('@aws-sdk/client-secrets-manager');
    SecretsManagerClient.mockImplementationOnce(() => ({
      send: jest.fn().mockResolvedValue({}),
    }));

    _resetCache();

    await expect(getAccessToken('jira-secret')).rejects.toThrow(
      'has no string value',
    );
  });
});

describe('_resetCache', () => {
  it('clears cached credentials and token', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeTokenResponse())
      .mockResolvedValueOnce(makeTokenResponse());

    await getAccessToken('jira-secret');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    _resetCache();

    // After reset, should fetch a new token (and re-read credentials)
    await getAccessToken('jira-secret');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
