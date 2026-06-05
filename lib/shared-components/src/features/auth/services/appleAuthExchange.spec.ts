import { exchangeAppleCode } from './appleAuthExchange';
import { OAuthServiceError } from './googleAuthExchange';

describe('exchangeAppleCode', () => {
  const PROXY = 'https://oauth-proxy.example.com';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockFetchOnce(impl: Partial<Response> & { status: number }): void {
    global.fetch = jest.fn().mockResolvedValue(impl);
  }

  it('POSTs the payload to the /apple endpoint and returns the parsed body', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({ jwt: 'jwt-token', csrfToken: 'csrf-123' }),
        ),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await exchangeAppleCode(PROXY, {
      identityToken: 'apple-id-token',
      fullName: 'Jane Doe',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth-proxy.example.com/apple',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          identityToken: 'apple-id-token',
          fullName: 'Jane Doe',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(result).toEqual({ jwt: 'jwt-token', csrfToken: 'csrf-123' });
  });

  it('forwards caller fetch options (e.g. credentials: "include") to fetch', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ jwt: 'jwt-token' })),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await exchangeAppleCode(
      PROXY,
      { identityToken: 'apple-id-token' },
      { credentials: 'include' },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth-proxy.example.com/apple',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('throws OAuthServiceError with status 403 when the user is not authorized', async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({ error: 'forbidden', message: 'Not authorized' }),
    } as unknown as Partial<Response> & { status: number });

    await expect(
      exchangeAppleCode(PROXY, { identityToken: 'apple-id-token' }),
    ).rejects.toMatchObject({
      name: 'OAuthServiceError',
      statusCode: 403,
      message: 'Not authorized',
    });
  });

  it('throws OAuthServiceError prefixed with the HTTP status on other non-2xx responses', async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve(''),
    } as unknown as Partial<Response> & { status: number });

    const error = await exchangeAppleCode(PROXY, {
      identityToken: 'apple-id-token',
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OAuthServiceError);
    expect((error as OAuthServiceError).statusCode).toBe(500);
    expect((error as OAuthServiceError).message).toBe(
      'Secure OAuth failed: 500',
    );
  });

  it('throws when the response is missing a jwt', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ csrfToken: 'csrf-123' })),
    } as unknown as Partial<Response> & { status: number });

    await expect(
      exchangeAppleCode(PROXY, { identityToken: 'apple-id-token' }),
    ).rejects.toThrow('Secure OAuth did not return JWT');
  });
});
