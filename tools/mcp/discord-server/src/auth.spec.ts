import {
  _resetDiscordTokenCacheForTests,
  DISCORD_BOT_TOKEN_ENV,
  DISCORD_BOT_TOKEN_SECRET_NAME_ENV,
  DISCORD_BUG_CHANNEL_ID_ENV,
  getChannelId,
  getDiscordToken,
  tryGetChannelId,
  tryGetDiscordToken,
} from './auth';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => ({ send: mockSend })),
  GetSecretValueCommand: jest.fn((input: unknown) => ({ input })),
}));

describe('discord auth', () => {
  const saved = {
    token: process.env[DISCORD_BOT_TOKEN_ENV],
    secretName: process.env[DISCORD_BOT_TOKEN_SECRET_NAME_ENV],
    channel: process.env[DISCORD_BUG_CHANNEL_ID_ENV],
  };

  beforeEach(() => {
    _resetDiscordTokenCacheForTests();
    mockSend.mockReset();
    delete process.env[DISCORD_BOT_TOKEN_ENV];
    delete process.env[DISCORD_BOT_TOKEN_SECRET_NAME_ENV];
    delete process.env[DISCORD_BUG_CHANNEL_ID_ENV];
  });

  afterAll(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore(DISCORD_BOT_TOKEN_ENV, saved.token);
    restore(DISCORD_BOT_TOKEN_SECRET_NAME_ENV, saved.secretName);
    restore(DISCORD_BUG_CHANNEL_ID_ENV, saved.channel);
  });

  describe('getDiscordToken', () => {
    it('prefers the env var over Secrets Manager', async () => {
      process.env[DISCORD_BOT_TOKEN_ENV] = 'env-token';
      process.env[DISCORD_BOT_TOKEN_SECRET_NAME_ENV] =
        'dev/discord-mcp-bot-token';

      await expect(getDiscordToken()).resolves.toBe('env-token');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('fetches from Secrets Manager and caches across warm invocations', async () => {
      process.env[DISCORD_BOT_TOKEN_SECRET_NAME_ENV] =
        'dev/discord-mcp-bot-token';
      mockSend.mockResolvedValue({ SecretString: '  secret-token \n' });

      await expect(getDiscordToken()).resolves.toBe('secret-token');
      await expect(getDiscordToken()).resolves.toBe('secret-token');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('throws when the secret exists but is empty', async () => {
      process.env[DISCORD_BOT_TOKEN_SECRET_NAME_ENV] =
        'dev/discord-mcp-bot-token';
      mockSend.mockResolvedValue({ SecretString: '   ' });

      await expect(getDiscordToken()).rejects.toThrow(/empty SecretString/);
    });

    it('throws an actionable error when neither source is configured', async () => {
      await expect(getDiscordToken()).rejects.toThrow(
        /DISCORD_BOT_TOKEN_SECRET_NAME/,
      );
    });

    it('tryGetDiscordToken returns null instead of throwing', async () => {
      await expect(tryGetDiscordToken()).resolves.toBeNull();
    });
  });

  describe('getChannelId', () => {
    it('returns the configured snowflake', () => {
      process.env[DISCORD_BUG_CHANNEL_ID_ENV] = ' 123456789012345678 ';

      expect(getChannelId()).toBe('123456789012345678');
    });

    it.each(['', 'general', '12345', '1234567890123456/../x'])(
      'rejects %p',
      (value) => {
        process.env[DISCORD_BUG_CHANNEL_ID_ENV] = value;

        expect(() => getChannelId()).toThrow(/DISCORD_BUG_CHANNEL_ID/);
        expect(tryGetChannelId()).toBeNull();
      },
    );

    it('throws when unset', () => {
      expect(() => getChannelId()).toThrow(/DISCORD_BUG_CHANNEL_ID/);
    });
  });
});
