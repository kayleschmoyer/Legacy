import { exchangeDiscordCode } from './discordAuthExchange';
import { OAuthServiceError } from './googleAuthExchange';

describe('exchangeDiscordCode', () => {
  const PROXY = 'https://oauth-proxy.example.com';
  const PAYLOAD = {
    code: 'auth-code-123',
    code_verifier: 'verifier-abc',
    redirect_uri: 'legacysports://auth/discord/callback',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockFetchOnce(impl: Partial<Response> & { status: number }): void {
    global.fetch = jest.fn().mockResolvedValue(impl);
  }

  it('POSTs the PKCE payload to the /discord endpoint and returns the parsed body', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({ jwt: 'jwt-token', csrfToken: 'csrf-123' }),
        ),
    });
    global.fetch = fetchMock;

    const result = await exchangeDiscordCode(PROXY, PAYLOAD);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth-proxy.example.com/discord',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(PAYLOAD),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(result).toEqual({ jwt: 'jwt-token', csrfToken: 'csrf-123' });
  });

  it('forwards caller fetch options to fetch', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ jwt: 'jwt-token' })),
    });
    global.fetch = fetchMock;

    await exchangeDiscordCode(PROXY, PAYLOAD, { signal: undefined });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth-proxy.example.com/discord',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws OAuthServiceError prefixed with the HTTP status and proxy message on non-2xx responses', async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      text: () =>
        Promise.resolve(
          JSON.stringify({ error: 'Discord authentication failed' }),
        ),
    });

    const error = await exchangeDiscordCode(PROXY, PAYLOAD).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(OAuthServiceError);
    expect((error as OAuthServiceError).statusCode).toBe(401);
    expect((error as OAuthServiceError).message).toBe(
      'Discord OAuth failed: 401 - Discord authentication failed',
    );
  });

  it('throws OAuthServiceError with a bare status when the body is empty', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve(''),
    });

    const error = await exchangeDiscordCode(PROXY, PAYLOAD).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(OAuthServiceError);
    expect((error as OAuthServiceError).message).toBe(
      'Discord OAuth failed: 400',
    );
  });

  it('throws when the response is missing a jwt', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ csrfToken: 'csrf-123' })),
    });

    await expect(exchangeDiscordCode(PROXY, PAYLOAD)).rejects.toThrow(
      'Discord OAuth did not return JWT',
    );
  });
});
