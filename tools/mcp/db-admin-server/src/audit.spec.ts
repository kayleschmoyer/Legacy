import { extractCaller, extractCallerFromAuthHeader } from './audit.js';

/** Build a JWT-shaped string with the given payload claims (no real signing). */
function jwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString(
    'base64url',
  );
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.signature`;
}

describe('extractCallerFromAuthHeader', () => {
  it('decodes client_id and sub from a Bearer token', () => {
    const header = `Bearer ${jwt({ client_id: 'abc123', sub: 'user-9' })}`;
    expect(extractCallerFromAuthHeader(header)).toEqual({
      clientId: 'abc123',
      sub: 'user-9',
    });
  });

  it('tolerates a missing claim', () => {
    const header = `Bearer ${jwt({ sub: 'only-sub' })}`;
    expect(extractCallerFromAuthHeader(header)).toEqual({
      clientId: null,
      sub: 'only-sub',
    });
  });

  it.each([
    ['undefined header', undefined],
    ['non-bearer header', 'Basic abc'],
    ['malformed token', 'Bearer not-a-jwt'],
    ['empty', ''],
  ])('returns anonymous for %s', (_label, header) => {
    expect(extractCallerFromAuthHeader(header)).toEqual({
      clientId: null,
      sub: null,
    });
  });

  it('never throws on garbage payloads', () => {
    expect(extractCallerFromAuthHeader('Bearer a.b.c')).toEqual({
      clientId: null,
      sub: null,
    });
  });
});

describe('extractCaller', () => {
  it('reads either header casing', () => {
    const token = jwt({ client_id: 'x', sub: 'y' });
    expect(extractCaller({ authorization: `Bearer ${token}` })).toEqual({
      clientId: 'x',
      sub: 'y',
    });
    expect(extractCaller({ Authorization: `Bearer ${token}` })).toEqual({
      clientId: 'x',
      sub: 'y',
    });
  });

  it('returns anonymous when headers are absent', () => {
    expect(extractCaller(undefined)).toEqual({ clientId: null, sub: null });
    expect(extractCaller({})).toEqual({ clientId: null, sub: null });
  });
});
