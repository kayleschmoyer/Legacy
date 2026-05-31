import {
  buildGoogleAuthPayload,
  exchangeGoogleCode,
  OAuthServiceError,
} from './googleAuthExchange';
import type { OAuthResponse } from '../../../platform-components/types';

describe('buildGoogleAuthPayload', () => {
  it('maps a web One Tap credential to { credential } with no redirect_uri', () => {
    const response: OAuthResponse = { credential: 'google-id-token' };

    const payload = buildGoogleAuthPayload(response);

    expect(payload).toEqual({ credential: 'google-id-token' });
    expect(payload.redirect_uri).toBeUndefined();
  });

  it('maps a bare web authorization code to { code } with no redirect_uri', () => {
    const response: OAuthResponse = { code: 'web-auth-code' };

    const payload = buildGoogleAuthPayload(response);

    expect(payload).toEqual({ code: 'web-auth-code' });
    // redirect_uri must stay unset so the proxy applies its 'postmessage'
    // default for the web popup/redirect flow.
    expect(payload.redirect_uri).toBeUndefined();
  });

  it('maps a native serverAuthCode to { code } with an explicit empty redirect_uri', () => {
    const response: OAuthResponse = { serverAuthCode: 'native-server-code' };

    const payload = buildGoogleAuthPayload(response);

    expect(payload.code).toBe('native-server-code');
    // The crux of LS-5082: native serverAuthCode MUST carry redirect_uri === ''
    // so the proxy does not fall back to the web 'postmessage' default and get
    // an invalid_grant from Google.
    expect(payload.redirect_uri).toBe('');
  });

  it('prefers serverAuthCode over a co-present code or credential', () => {
    const response: OAuthResponse = {
      serverAuthCode: 'native-server-code',
      code: 'ignored-code',
      credential: 'ignored-credential',
    };

    const payload = buildGoogleAuthPayload(response);

    expect(payload).toEqual({
      code: 'native-server-code',
      redirect_uri: '',
    });
  });

  it('throws when no code, serverAuthCode, or credential is present', () => {
    expect(() => buildGoogleAuthPayload({})).toThrow(
      'No valid authentication code or credential received',
    );
  });
});

describe('exchangeGoogleCode', () => {
  const PROXY = 'https://oauth-proxy.example.com';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockFetchOnce(impl: Partial<Response> & { status: number }): void {
    global.fetch = jest.fn().mockResolvedValue(impl);
  }

  it('POSTs the payload to the /google endpoint and returns the parsed body', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({ jwt: 'jwt-token', csrfToken: 'csrf-123' }),
        ),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await exchangeGoogleCode(PROXY, { code: 'abc' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth-proxy.example.com/google',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: 'abc' }),
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

    await exchangeGoogleCode(
      PROXY,
      { credential: 'id-token' },
      {
        credentials: 'include',
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth-proxy.example.com/google',
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
      exchangeGoogleCode(PROXY, { code: 'abc' }),
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

    const error = await exchangeGoogleCode(PROXY, { code: 'abc' }).catch(
      (e: unknown) => e,
    );

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

    await expect(exchangeGoogleCode(PROXY, { code: 'abc' })).rejects.toThrow(
      'Secure OAuth did not return JWT',
    );
  });
});
