// Mock LOGGER — must be declared before jest.mock calls so the factory can
// reference it (jest hoists jest.mock but the variable declaration is also hoisted).
const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: mockLogger,
}));

// Mock db-client
jest.mock('@legacy-sports/db-client', () => ({
  PublicSchema: {
    leagues: {
      id: 'leagues.id',
      discordWebhookUrl: 'leagues.discordWebhookUrl',
    },
  },
}));

import {
  getDiscordWebhookUrls,
  isValidDiscordWebhookUrl,
  notifyDiscordWaiverClaim,
} from './discord-league';

// Global fetch mock
const mockFetch = jest.fn();
global.fetch = mockFetch;

const VALID_WEBHOOK_URL =
  'https://discord.com/api/webhooks/123456/abcdef-token';

function createMockDb(rows: Array<Record<string, unknown>> = []) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(rows),
    limit: jest.fn().mockResolvedValue(rows),
  };
  // select().from().where() for getDiscordWebhookUrls (no .limit)
  // select().from().where().limit() for getLeagueDiscordWebhookUrl
  chain.select.mockReturnValue(chain);
  return chain as unknown as Parameters<typeof notifyDiscordWaiverClaim>[0];
}

const baseOpts = {
  leagueId: 1,
  teamName: 'Test Team',
  playerName: 'John Doe',
  dropName: null,
  waiverType: 'standard' as const,
  faabBid: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true });
});

describe('isValidDiscordWebhookUrl', () => {
  it('accepts valid discord.com webhook URL', () => {
    expect(isValidDiscordWebhookUrl(VALID_WEBHOOK_URL)).toBe(true);
  });

  it('accepts discordapp.com webhook URL', () => {
    expect(
      isValidDiscordWebhookUrl('https://discordapp.com/api/webhooks/123/token'),
    ).toBe(true);
  });

  it('rejects non-https URLs', () => {
    expect(
      isValidDiscordWebhookUrl('http://discord.com/api/webhooks/123/token'),
    ).toBe(false);
  });

  it('rejects non-Discord hosts', () => {
    expect(
      isValidDiscordWebhookUrl('https://evil.com/api/webhooks/123/token'),
    ).toBe(false);
  });

  it('rejects Discord URLs without /api/webhooks/ path', () => {
    expect(isValidDiscordWebhookUrl('https://discord.com/channels/123')).toBe(
      false,
    );
  });

  it('rejects invalid URLs', () => {
    expect(isValidDiscordWebhookUrl('not-a-url')).toBe(false);
  });
});

describe('notifyDiscordWaiverClaim', () => {
  it('sends webhook with correct payload when webhookUrl is provided', async () => {
    const db = createMockDb();
    await notifyDiscordWaiverClaim(db, {
      ...baseOpts,
      webhookUrl: VALID_WEBHOOK_URL,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(VALID_WEBHOOK_URL);
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body);
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].title).toBe('Waiver Claim Processed');
  });

  it('skips DB lookup when webhookUrl is provided directly', async () => {
    const db = createMockDb();
    await notifyDiscordWaiverClaim(db, {
      ...baseOpts,
      webhookUrl: VALID_WEBHOOK_URL,
    });

    // select() should not be called since webhookUrl was provided
    expect(
      (db as unknown as { select: jest.Mock }).select,
    ).not.toHaveBeenCalled();
  });

  it('does nothing when no webhook URL is configured', async () => {
    const db = createMockDb([]);
    await notifyDiscordWaiverClaim(db, baseOpts);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects invalid webhook URLs and logs error', async () => {
    const db = createMockDb();
    await notifyDiscordWaiverClaim(db, {
      ...baseOpts,
      webhookUrl: 'https://evil.com/steal-data',
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Discord webhook URL failed validation',
      { leagueId: 1 },
    );
  });

  it('includes allowed_mentions to prevent @everyone pings', async () => {
    const db = createMockDb();
    await notifyDiscordWaiverClaim(db, {
      ...baseOpts,
      teamName: '@everyone',
      webhookUrl: VALID_WEBHOOK_URL,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it('includes FAAB bid in embed when waiverType is faab', async () => {
    const db = createMockDb();
    await notifyDiscordWaiverClaim(db, {
      ...baseOpts,
      waiverType: 'faab',
      faabBid: 25,
      webhookUrl: VALID_WEBHOOK_URL,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const faabField = body.embeds[0].fields.find(
      (f: { name: string }) => f.name === 'FAAB Bid',
    );
    expect(faabField).toEqual({ name: 'FAAB Bid', value: '$25', inline: true });
  });

  it('includes drop player in embed when provided', async () => {
    const db = createMockDb();
    await notifyDiscordWaiverClaim(db, {
      ...baseOpts,
      dropName: 'Jane Smith',
      webhookUrl: VALID_WEBHOOK_URL,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const dropField = body.embeds[0].fields.find(
      (f: { name: string }) => f.name === 'Dropped',
    );
    expect(dropField).toEqual({
      name: 'Dropped',
      value: 'Jane Smith',
      inline: true,
    });
    expect(body.embeds[0].description).toContain('dropped **Jane Smith**');
  });

  it('logs error with leagueId when webhook returns non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: jest.fn().mockResolvedValue('rate limited'),
    });

    const db = createMockDb();
    await notifyDiscordWaiverClaim(db, {
      ...baseOpts,
      webhookUrl: VALID_WEBHOOK_URL,
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Discord waiver webhook failed: 429 Too Many Requests',
      { body: 'rate limited', leagueId: 1 },
    );
  });

  it('logs error with leagueId when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const db = createMockDb();
    await notifyDiscordWaiverClaim(db, {
      ...baseOpts,
      webhookUrl: VALID_WEBHOOK_URL,
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to send Discord waiver notification',
      { error: 'Network failure', leagueId: 1 },
    );
  });

  it('passes AbortSignal to fetch for timeout control', async () => {
    const db = createMockDb();
    await notifyDiscordWaiverClaim(db, {
      ...baseOpts,
      webhookUrl: VALID_WEBHOOK_URL,
    });

    const init = mockFetch.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('getDiscordWebhookUrls', () => {
  it('returns empty map for empty league list', async () => {
    const db = createMockDb();
    const result = await getDiscordWebhookUrls(db, []);
    expect(result.size).toBe(0);
  });

  it('returns map of leagueId to webhookUrl', async () => {
    const db = createMockDb([
      { id: 1, discordWebhookUrl: VALID_WEBHOOK_URL },
      { id: 2, discordWebhookUrl: null },
      { id: 3, discordWebhookUrl: 'https://discord.com/api/webhooks/999/tok' },
    ]);
    const result = await getDiscordWebhookUrls(db, [1, 2, 3]);
    expect(result.size).toBe(2);
    expect(result.get(1)).toBe(VALID_WEBHOOK_URL);
    expect(result.has(2)).toBe(false);
    expect(result.get(3)).toBe('https://discord.com/api/webhooks/999/tok');
  });
});
