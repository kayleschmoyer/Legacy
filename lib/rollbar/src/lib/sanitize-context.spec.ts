import { sanitizeContext } from './sanitize-context';

describe('sanitizeContext', () => {
  describe('key redaction', () => {
    it('redacts exact sensitive keys', () => {
      const result = sanitizeContext({
        email: 'user@example.com',
        password: 'hunter2',
        token: 'abc123',
        cookie: 'session=xyz',
        authorization: 'Bearer tok',
        secret: 'shh',
        ssn: '123-45-6789',
        phone: '555-1234',
        address: '123 Main St',
        session: 'sess_abc',
        jwt: 'eyJ...',
      });

      expect(result['email']).toBe('[REDACTED]');
      expect(result['password']).toBe('[REDACTED]');
      expect(result['token']).toBe('[REDACTED]');
      expect(result['cookie']).toBe('[REDACTED]');
      expect(result['authorization']).toBe('[REDACTED]');
      expect(result['secret']).toBe('[REDACTED]');
      expect(result['ssn']).toBe('[REDACTED]');
      expect(result['phone']).toBe('[REDACTED]');
      expect(result['address']).toBe('[REDACTED]');
      expect(result['session']).toBe('[REDACTED]');
      expect(result['jwt']).toBe('[REDACTED]');
    });

    it('redacts keys that end with a sensitive suffix (e.g. access_token)', () => {
      const result = sanitizeContext({
        access_token: 'tok1',
        refresh_token: 'tok2',
        id_token: 'tok3',
      });

      expect(result['access_token']).toBe('[REDACTED]');
      expect(result['refresh_token']).toBe('[REDACTED]');
      expect(result['id_token']).toBe('[REDACTED]');
    });

    it('redacts keys that contain a sensitive substring (e.g. accessToken, userEmail)', () => {
      const result = sanitizeContext({
        accessToken: 'tok',
        refreshToken: 'ref',
        userEmail: 'user@example.com',
        userPassword: 'pw',
      });

      expect(result['accessToken']).toBe('[REDACTED]');
      expect(result['refreshToken']).toBe('[REDACTED]');
      expect(result['userEmail']).toBe('[REDACTED]');
      expect(result['userPassword']).toBe('[REDACTED]');
    });

    it('does not redact unrelated keys (e.g. teamId, gameCount, userId)', () => {
      const result = sanitizeContext({
        teamId: 42,
        gameCount: 10,
        userId: 'u-123',
        requestId: 'req-abc',
        leagueId: 7,
        status: 'active',
      });

      expect(result['teamId']).toBe(42);
      expect(result['gameCount']).toBe(10);
      expect(result['userId']).toBe('u-123');
      expect(result['requestId']).toBe('req-abc');
      expect(result['leagueId']).toBe(7);
      expect(result['status']).toBe('active');
    });

    it('redacts keys case-insensitively', () => {
      const result = sanitizeContext({
        EMAIL: 'user@example.com',
        Password: 'secret123',
        TOKEN: 'abc',
      });

      expect(result['EMAIL']).toBe('[REDACTED]');
      expect(result['Password']).toBe('[REDACTED]');
      expect(result['TOKEN']).toBe('[REDACTED]');
    });

    it('flags keys containing "name" or "ip" as redacted due to substring match', () => {
      // These are known false-positive behaviors documented in LS-2810 — test
      // verifies current behavior so a change is detected as a breaking diff.
      const result = sanitizeContext({
        teamName: 'Cubs',
        zipCode: '60601',
        description: 'league desc',
        clientIp: '1.2.3.4',
      });

      // 'name' is in DEFAULT_SENSITIVE_KEYS and 'teamname'.includes('name') => true
      expect(result['teamName']).toBe('[REDACTED]');
      // 'ip' is in DEFAULT_SENSITIVE_KEYS and 'descr_ip_tion'.includes('ip') => true
      expect(result['description']).toBe('[REDACTED]');
      // 'ip' is in DEFAULT_SENSITIVE_KEYS and 'z_ip_code'.includes('ip') => true
      expect(result['zipCode']).toBe('[REDACTED]');
      // 'clientip'.includes('ip') => true
      expect(result['clientIp']).toBe('[REDACTED]');
    });
  });

  describe('depth truncation', () => {
    it('truncates objects nested beyond default maxDepth (6)', () => {
      const deep = { a: { b: { c: { d: { e: { f: { g: 'deep' } } } } } } };
      const result = sanitizeContext(deep);
      // At depth 6, we reach key f; its value { g: 'deep' } is sanitized at depth 1,
      // and 'g': 'deep' is sanitized at depth 0 which returns '[Truncated]'
      const f = (result['a'] as Record<string, unknown>)['b'];
      expect(f).not.toBeUndefined();
      // The value at exactly depth 0 is '[Truncated]'
      const atLimit = (
        (
          (
            (
              (result['a'] as Record<string, unknown>)['b'] as Record<
                string,
                unknown
              >
            )['c'] as Record<string, unknown>
          )['d'] as Record<string, unknown>
        )['e'] as Record<string, unknown>
      )['f'];
      expect(atLimit).toBe('[Truncated]');
    });

    it('respects custom maxDepth option', () => {
      const nested = { a: { b: { c: 'value' } } };
      const result = sanitizeContext(nested, { maxDepth: 2 });
      // depth 2: process 'a' (depth 1), process 'b' (depth 0 => '[Truncated]')
      const aVal = result['a'] as Record<string, unknown>;
      expect(aVal['b']).toBe('[Truncated]');
    });

    it('returns [Truncated] at maxDepth 1 for nested objects', () => {
      const result = sanitizeContext(
        { top: { nested: 'value' } },
        { maxDepth: 1 },
      );
      expect(result['top']).toBe('[Truncated]');
    });
  });

  describe('circular references', () => {
    it('replaces circular references with [Circular] instead of throwing', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj['self'] = obj;
      const result = sanitizeContext(obj);
      expect(result['a']).toBe(1);
      expect(result['self']).toBe('[Circular]');
    });

    it('handles circular references in nested objects', () => {
      const child: Record<string, unknown> = { value: 42 };
      const parent: Record<string, unknown> = { child };
      child['parent'] = parent;
      const result = sanitizeContext(parent);
      const resultChild = result['child'] as Record<string, unknown>;
      expect(resultChild['value']).toBe(42);
      expect(resultChild['parent']).toBe('[Circular]');
    });
  });

  describe('primitive type passthrough', () => {
    it('passes strings, numbers, and booleans through unchanged', () => {
      const result = sanitizeContext({
        str: 'hello',
        num: 42,
        float: 3.14,
        bool: true,
        boolFalse: false,
        zero: 0,
        empty: '',
      });

      expect(result['str']).toBe('hello');
      expect(result['num']).toBe(42);
      expect(result['float']).toBe(3.14);
      expect(result['bool']).toBe(true);
      expect(result['boolFalse']).toBe(false);
      expect(result['zero']).toBe(0);
      expect(result['empty']).toBe('');
    });

    it('returns null and undefined values unchanged', () => {
      const result = sanitizeContext({ n: null, u: undefined });
      expect(result['n']).toBeNull();
      expect(result['u']).toBeUndefined();
    });
  });

  describe('special types', () => {
    it('extracts message from Error instances', () => {
      const err = new Error('something went wrong');
      const result = sanitizeContext({ err });
      expect(result['err']).toBe('something went wrong');
    });

    it('converts Date instances to ISO strings', () => {
      const date = new Date('2024-01-15T00:00:00.000Z');
      const result = sanitizeContext({ createdAt: date });
      expect(result['createdAt']).toBe('2024-01-15T00:00:00.000Z');
    });

    it('handles symbols by converting to string', () => {
      const sym = Symbol('mySymbol');
      const result = sanitizeContext({ sym });
      expect(result['sym']).toBe('Symbol(mySymbol)');
    });
  });

  describe('arrays', () => {
    it('handles arrays with mixed types', () => {
      const result = sanitizeContext({
        items: [1, 'two', true, null, undefined],
      });
      expect(result['items']).toEqual([1, 'two', true, null, undefined]);
    });

    it('recursively sanitizes objects inside arrays', () => {
      const result = sanitizeContext({
        users: [
          { id: 1, email: 'a@b.com' },
          { id: 2, email: 'c@d.com' },
        ],
      });
      const users = result['users'] as Array<Record<string, unknown>>;
      expect(users[0]['id']).toBe(1);
      expect(users[0]['email']).toBe('[REDACTED]');
      expect(users[1]['id']).toBe(2);
      expect(users[1]['email']).toBe('[REDACTED]');
    });
  });

  describe('nested objects', () => {
    it('recursively sanitizes nested plain objects', () => {
      const result = sanitizeContext({
        outer: {
          inner: {
            value: 'safe',
          },
        },
      });
      const outer = result['outer'] as Record<string, unknown>;
      const inner = outer['inner'] as Record<string, unknown>;
      expect(inner['value']).toBe('safe');
    });

    it('redacts sensitive keys inside nested objects', () => {
      const result = sanitizeContext({
        user: {
          id: 'u-123',
          email: 'user@example.com',
          profile: {
            name: 'Alice',
            bio: 'developer',
          },
        },
      });
      const user = result['user'] as Record<string, unknown>;
      expect(user['id']).toBe('u-123');
      expect(user['email']).toBe('[REDACTED]');
      const profile = user['profile'] as Record<string, unknown>;
      // 'name' is in DEFAULT_SENSITIVE_KEYS so it is redacted
      expect(profile['name']).toBe('[REDACTED]');
      expect(profile['bio']).toBe('developer');
    });
  });

  describe('x-api-key and set-cookie', () => {
    it('redacts x-api-key and set-cookie header fields', () => {
      const result = sanitizeContext({
        'x-api-key': 'key123',
        'set-cookie': 'session=abc; HttpOnly',
      });
      expect(result['x-api-key']).toBe('[REDACTED]');
      expect(result['set-cookie']).toBe('[REDACTED]');
    });
  });
});
