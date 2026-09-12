import {
  _resetCallerEmailCache,
  type AssigneeCaller,
  resolveCallerEmail,
} from './caller-email';

jest.mock('@legacy-sports/logging/server', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const COGNITO_DOMAIN = 'https://auth.example.com';

const USER_CALLER: AssigneeCaller = {
  kind: 'user',
  token: 'user-access-token',
  sub: 'sub-1',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('resolveCallerEmail (LS-10069)', () => {
  let fetchSpy: jest.SpyInstance<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >;
  const originalDomain = process.env['MCP_COGNITO_DOMAIN'];

  beforeEach(() => {
    _resetCallerEmailCache();
    process.env['MCP_COGNITO_DOMAIN'] = COGNITO_DOMAIN;
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ email: 'person@example.com' }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    if (originalDomain === undefined) {
      delete process.env['MCP_COGNITO_DOMAIN'];
    } else {
      process.env['MCP_COGNITO_DOMAIN'] = originalDomain;
    }
  });

  it('returns undefined for a machine caller without calling userInfo', async () => {
    await expect(
      resolveCallerEmail({ kind: 'machine', token: 't', sub: 'client-1' }),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns an email already on the caller (legacy ID token) without calling userInfo', async () => {
    await expect(
      resolveCallerEmail({ ...USER_CALLER, email: 'from-token@example.com' }),
    ).resolves.toBe('from-token@example.com');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("asks Cognito userInfo with the caller's own bearer token", async () => {
    await expect(resolveCallerEmail(USER_CALLER)).resolves.toBe(
      'person@example.com',
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(`${COGNITO_DOMAIN}/oauth2/userInfo`);
    expect(init?.headers).toEqual({
      Authorization: 'Bearer user-access-token',
    });
  });

  it('caches the resolved email by sub so a repeat caller does not fetch again', async () => {
    await resolveCallerEmail(USER_CALLER);
    // A fresh token for the same person still hits the cache.
    await expect(
      resolveCallerEmail({ ...USER_CALLER, token: 'refreshed-token' }),
    ).resolves.toBe('person@example.com');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not share the cache across different subs', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ email: 'a@example.com' }))
      .mockResolvedValueOnce(jsonResponse({ email: 'b@example.com' }));

    await expect(resolveCallerEmail(USER_CALLER)).resolves.toBe(
      'a@example.com',
    );
    await expect(
      resolveCallerEmail({ ...USER_CALLER, sub: 'sub-2' }),
    ).resolves.toBe('b@example.com');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns undefined on a non-OK userInfo response', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ error: 'invalid_token' }, 401));

    await expect(resolveCallerEmail(USER_CALLER)).resolves.toBeUndefined();
  });

  it('returns undefined when userInfo returns no email claim', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ sub: 'sub-1' }));

    await expect(resolveCallerEmail(USER_CALLER)).resolves.toBeUndefined();
  });

  it('returns undefined (never throws) when fetch itself rejects', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));

    await expect(resolveCallerEmail(USER_CALLER)).resolves.toBeUndefined();
  });

  it('does not cache a failed lookup', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ email: 'later@example.com' }));

    await expect(resolveCallerEmail(USER_CALLER)).resolves.toBeUndefined();
    await expect(resolveCallerEmail(USER_CALLER)).resolves.toBe(
      'later@example.com',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns undefined without calling fetch when MCP_COGNITO_DOMAIN is unset', async () => {
    delete process.env['MCP_COGNITO_DOMAIN'];

    await expect(resolveCallerEmail(USER_CALLER)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('strips trailing slashes from MCP_COGNITO_DOMAIN', async () => {
    process.env['MCP_COGNITO_DOMAIN'] = `${COGNITO_DOMAIN}//`;

    await resolveCallerEmail(USER_CALLER);

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      `${COGNITO_DOMAIN}/oauth2/userInfo`,
    );
  });
});
