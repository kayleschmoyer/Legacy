jest.mock('@legacy-sports/aws-utils', () => ({
  readSecret: jest.fn(
    ({
      localEnvVar,
      secretPathEnvVar,
    }: {
      localEnvVar?: string;
      secretPathEnvVar: string;
    }): Promise<string> => {
      if (localEnvVar && process.env[localEnvVar] !== undefined) {
        return Promise.resolve(process.env[localEnvVar]);
      }
      if (process.env[secretPathEnvVar] !== undefined) {
        return Promise.resolve(process.env[secretPathEnvVar]);
      }
      return Promise.reject(
        new Error(
          `No value configured for ${localEnvVar ?? '<none>'} or ${secretPathEnvVar}`,
        ),
      );
    },
  ),
}));

import { formatNewUserEmbed, notifyNewUserSignup } from './discord';

describe('formatNewUserEmbed', () => {
  it('creates an embed with masked email and user details', () => {
    const embed = formatNewUserEmbed('john@example.com', 42, 'local');

    expect(embed.title).toBe('New User Signup');
    expect(embed.color).toBe(0x57f287);
    expect(embed.fields).toEqual([
      { name: 'User ID', value: '42', inline: true },
      { name: 'Email', value: 'j***@example.com', inline: true },
      { name: 'Method', value: 'local', inline: true },
    ]);
    expect(embed.timestamp).toBeDefined();
    expect(embed.footer).toEqual({ text: 'Legacy Sports' });
  });

  it('handles google signup method', () => {
    const embed = formatNewUserEmbed('a@b.com', 1, 'google');
    expect(embed.fields?.[2]).toEqual({
      name: 'Method',
      value: 'google',
      inline: true,
    });
  });

  it('masks short email local-parts without leaking the address', () => {
    const embed = formatNewUserEmbed('a@b.com', 1, 'google');

    const emailField = embed.fields?.[1];
    expect(emailField).toBeDefined();
    expect(emailField).toMatchObject({
      name: 'Email',
      inline: true,
    });
    // Single-char local part should be fully masked
    expect(emailField?.value).toBe('***@b.com');
    expect(emailField?.value).not.toBe('a@b.com');
  });
});

describe('notifyNewUserSignup', () => {
  const originalEnv = process.env;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => {
    process.env = originalEnv;
    fetchSpy.mockRestore();
  });

  it('skips notification when webhook URL is not configured', async () => {
    delete process.env['DISCORD_USER_SIGNUP_WEBHOOK_URL'];
    delete process.env['DISCORD_USER_SIGNUP_WEBHOOK_URL_SECRET_NAME'];

    await notifyNewUserSignup('test@example.com', 1, 'local');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends notification to configured webhook URL', async () => {
    process.env['DISCORD_USER_SIGNUP_WEBHOOK_URL'] =
      'https://discord.com/api/webhooks/test/token';

    await notifyNewUserSignup('user@example.com', 99, 'google');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/webhooks/test/token');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
    });

    const body = JSON.parse(options.body as string) as {
      embeds: Array<{ title: string; fields: Array<{ value: string }> }>;
    };
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].title).toBe('New User Signup');
    expect(body.embeds[0].fields[0].value).toBe('99');
  });

  it('does not throw when webhook returns an error', async () => {
    process.env['DISCORD_USER_SIGNUP_WEBHOOK_URL'] =
      'https://discord.com/api/webhooks/test/token';
    fetchSpy.mockResolvedValue(new Response('rate limited', { status: 429 }));

    // Should not throw
    await expect(
      notifyNewUserSignup('user@example.com', 1, 'local'),
    ).resolves.toBeUndefined();
  });

  it('does not throw when fetch rejects', async () => {
    process.env['DISCORD_USER_SIGNUP_WEBHOOK_URL'] =
      'https://discord.com/api/webhooks/test/token';
    fetchSpy.mockRejectedValue(new Error('network error'));

    // Should not throw
    await expect(
      notifyNewUserSignup('user@example.com', 1, 'local'),
    ).resolves.toBeUndefined();
  });

  it('fetches webhook URL via the secret-name path when only SECRET_NAME is set', async () => {
    delete process.env['DISCORD_USER_SIGNUP_WEBHOOK_URL'];
    process.env['DISCORD_USER_SIGNUP_WEBHOOK_URL_SECRET_NAME'] =
      'https://discord.com/api/webhooks/test/from-secret-name';

    // Reset the module cache so the module-scope webhookUrlPromise is
    // re-initialised from the new env var configuration rather than any
    // value cached by prior tests.
    jest.resetModules();
    const { notifyNewUserSignup: fresh } = (await import('./discord')) as {
      notifyNewUserSignup: typeof notifyNewUserSignup;
    };

    await fresh('user@example.com', 42, 'google');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/webhooks/test/from-secret-name');
  });

  it('falls through to the secret-name path when the local env var is an empty string', async () => {
    process.env['DISCORD_USER_SIGNUP_WEBHOOK_URL'] = '';
    process.env['DISCORD_USER_SIGNUP_WEBHOOK_URL_SECRET_NAME'] =
      'https://discord.com/api/webhooks/test/secret-name-wins';

    jest.resetModules();
    const { notifyNewUserSignup: fresh } = (await import('./discord')) as {
      notifyNewUserSignup: typeof notifyNewUserSignup;
    };

    await fresh('user@example.com', 7, 'local');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/webhooks/test/secret-name-wins');
  });
});
