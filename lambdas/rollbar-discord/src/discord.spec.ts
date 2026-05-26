import {
  formatAlarmEmbed,
  formatBudgetEmbed,
  formatRollbarEmbed,
  postToDiscord,
} from './discord';
import { scrubPii, scrubUrl } from './scrub-pii';
import type {
  BudgetNotification,
  CloudWatchAlarm,
  RollbarEvent,
} from './types';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('formatRollbarEmbed', () => {
  it('formats a new_item event with item data', () => {
    const event: RollbarEvent = {
      event_name: 'new_item',
      data: {
        item: {
          title: 'TypeError: Cannot read property "foo"',
          level: 'error',
          environment: 'production',
          total_occurrences: 5,
          framework: 'node-js',
          public_item_url: 'https://rollbar.com/item/123',
          last_occurrence_timestamp: 1700000000,
        },
      },
    };

    const embed = formatRollbarEmbed(event);

    expect(embed).not.toBeNull();
    expect(embed?.title).toBe('TypeError: Cannot read property "foo"');
    expect(embed?.color).toBe(0xed4245); // red for error
    expect(embed?.url).toBe('https://rollbar.com/item/123');
    expect(embed?.fields).toEqual(
      expect.arrayContaining([
        { name: 'Event', value: 'new_item', inline: true },
        { name: 'Level', value: 'ERROR', inline: true },
        { name: 'Environment', value: 'production', inline: true },
        { name: 'Occurrences', value: '5', inline: true },
        { name: 'Framework', value: 'node-js', inline: true },
      ]),
    );
    expect(embed?.timestamp).toBeDefined();
    expect(embed?.footer).toEqual({ text: 'Rollbar' });
  });

  it('formats an occurrence event with exception', () => {
    const event: RollbarEvent = {
      event_name: 'occurrence',
      data: {
        occurrence: {
          level: 'warning',
          environment: 'staging',
          body: {
            trace: {
              exception: {
                class: 'ValidationError',
                message: 'Invalid input',
              },
            },
          },
          request: { url: '/api/test', method: 'POST' },
        },
      },
    };

    const embed = formatRollbarEmbed(event);

    expect(embed).not.toBeNull();
    expect(embed?.color).toBe(0xfee75c); // yellow for warning
    expect(embed?.description).toContain('ValidationError');
    expect(embed?.description).toContain('Invalid input');
    expect(embed?.fields).toEqual(
      expect.arrayContaining([
        { name: 'Request', value: 'POST /api/test', inline: false },
      ]),
    );
  });

  it('skips deploy events (handled by CI discord-notify)', () => {
    const event: RollbarEvent = {
      event_name: 'deploy',
      data: {
        deploy: {
          environment: 'production',
          revision: 'e4b9b7db860b2e5ac799f8c06b9498b71ab270bb',
          local_username: 'brian',
          status: 'succeeded',
          comment: 'deploying webs',
          start_time: 1382656038,
          finish_time: 1382656039,
        },
      },
    };

    expect(formatRollbarEmbed(event)).toBeNull();
  });

  it('handles numeric item.level and maps to name (LS-3171)', () => {
    const event: RollbarEvent = {
      event_name: 'new_item',
      data: {
        item: {
          title: 'Some error',
          level: 50, // Rollbar sends numeric levels in some payloads; 50 = critical
          environment: 'production',
        },
      },
    };

    const embed = formatRollbarEmbed(event);

    expect(embed).not.toBeNull();
    expect(embed?.fields).toEqual(
      expect.arrayContaining([
        { name: 'Level', value: 'CRITICAL', inline: true },
      ]),
    );
  });

  it('handles numeric occurrence.level and maps to name (LS-3170)', () => {
    const event: RollbarEvent = {
      event_name: 'occurrence',
      data: {
        occurrence: {
          level: 40, // 40 = error
          environment: 'production',
          body: {
            message: { body: 'Something went wrong' },
          },
        },
      },
    };

    const embed = formatRollbarEmbed(event);

    expect(embed).not.toBeNull();
    expect(embed?.fields).toEqual(
      expect.arrayContaining([{ name: 'Level', value: 'ERROR', inline: true }]),
    );
  });

  it('truncates long titles', () => {
    const event: RollbarEvent = {
      event_name: 'new_item',
      data: {
        item: {
          title: 'A'.repeat(300),
          level: 'error',
          environment: 'dev',
        },
      },
    };

    const embed = formatRollbarEmbed(event);
    expect(embed).not.toBeNull();
    expect(embed?.title.length).toBeLessThanOrEqual(256);
    expect(embed?.title.endsWith('...')).toBe(true);
  });

  it('returns null for deploy event without deploy payload', () => {
    const event: RollbarEvent = {
      event_name: 'deploy',
      data: {},
    };

    expect(formatRollbarEmbed(event)).toBeNull();
  });

  it('returns null for event without item or occurrence data', () => {
    const event: RollbarEvent = {
      event_name: 'reactivated_item',
      data: {},
    };

    expect(formatRollbarEmbed(event)).toBeNull();
  });
});

describe('formatAlarmEmbed', () => {
  const baseAlarm: CloudWatchAlarm = {
    AlarmName: 'test-dlq-not-empty',
    AlarmDescription: 'Messages in DLQ',
    NewStateValue: 'ALARM',
    NewStateReason: 'Threshold crossed',
    StateChangeTime: '2024-01-15T10:30:00Z',
    Region: 'us-east-1',
    Trigger: {
      MetricName: 'ApproximateNumberOfMessagesVisible',
      Namespace: 'AWS/SQS',
      Dimensions: [{ name: 'QueueName', value: 'my-dlq.fifo' }],
      Period: 60,
      Statistic: 'Sum',
      Threshold: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    },
  };

  it('formats an ALARM state with red color', () => {
    const embed = formatAlarmEmbed(baseAlarm);

    expect(embed.title).toBe('test-dlq-not-empty');
    expect(embed.description).toBe('Messages in DLQ');
    expect(embed.color).toBe(0xed4245);
    expect(embed.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Dimensions',
          value: 'QueueName: my-dlq.fifo',
        }),
      ]),
    );
    expect(embed.footer).toEqual({ text: 'CloudWatch Alarm' });
  });

  it('formats an OK state with green color', () => {
    const okAlarm = { ...baseAlarm, NewStateValue: 'OK' as const };
    const embed = formatAlarmEmbed(okAlarm);

    expect(embed.color).toBe(0x57f287);
  });

  it('formats INSUFFICIENT_DATA with yellow color', () => {
    const insuffAlarm = {
      ...baseAlarm,
      NewStateValue: 'INSUFFICIENT_DATA' as const,
    };
    const embed = formatAlarmEmbed(insuffAlarm);

    expect(embed.color).toBe(0xfee75c);
  });
});

describe('formatBudgetEmbed', () => {
  const baseNotification: BudgetNotification = {
    accountId: '123456789012',
    budgetName: 'legacy-sports-dev-monthly-budget',
    budgetType: 'COST',
    budgetLimit: '$100.00',
    actualSpend: '$82.50',
    forecastedSpend: '$110.00',
    thresholdPercentage: '80',
    startDate: '2026-03-01',
    endDate: '2026-03-31',
  };

  it('formats 80% threshold with warning color', () => {
    const embed = formatBudgetEmbed(baseNotification);

    expect(embed.title).toBe('Budget Alert: legacy-sports-dev-monthly-budget');
    expect(embed.color).toBe(0xfee75c); // yellow/warning
    expect(embed.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Threshold',
          value: '\u26A0\uFE0F 80%',
        }),
        expect.objectContaining({ name: 'Budget Limit', value: '$100.00' }),
        expect.objectContaining({ name: 'Actual Spend', value: '$82.50' }),
        expect.objectContaining({
          name: 'Forecasted Spend',
          value: '$110.00',
        }),
        expect.objectContaining({
          name: 'Period',
          value: '2026-03-01 — 2026-03-31',
        }),
        expect.objectContaining({ name: 'Account', value: '123456789012' }),
      ]),
    );
    expect(embed.footer).toEqual({ text: 'AWS Budgets' });
  });

  it('formats 100% threshold with error color', () => {
    const notification = { ...baseNotification, thresholdPercentage: '100' };
    const embed = formatBudgetEmbed(notification);

    expect(embed.color).toBe(0xed4245); // red/error
  });

  it('omits forecasted spend when not provided', () => {
    const { forecastedSpend: _, ...notification } = baseNotification;
    const embed = formatBudgetEmbed(notification);

    const fieldNames = embed.fields?.map((f) => f.name) ?? [];
    expect(fieldNames).not.toContain('Forecasted Spend');
  });

  it('omits period when dates are not provided', () => {
    const { startDate: _s, endDate: _e, ...notification } = baseNotification;
    const embed = formatBudgetEmbed(notification);

    const fieldNames = embed.fields?.map((f) => f.name) ?? [];
    expect(fieldNames).not.toContain('Period');
  });
});

describe('scrubUrl', () => {
  it('strips query string from an absolute URL', () => {
    expect(
      scrubUrl('https://api.example.com/v1/users?token=abc123&user=42'),
    ).toBe('https://api.example.com/v1/users');
  });

  it('strips query string from a relative URL', () => {
    expect(scrubUrl('/api/v1/leagues?auth=eyJsomething&page=1')).toBe(
      '/api/v1/leagues',
    );
  });

  it('preserves a URL with no query string', () => {
    expect(scrubUrl('/api/test')).toBe('/api/test');
  });

  it('strips fragment from a relative URL', () => {
    expect(scrubUrl('/page#section')).toBe('/page');
  });
});

describe('scrubPii', () => {
  it('redacts email addresses', () => {
    expect(scrubPii('Error for user john.doe@example.com in prod')).toBe(
      'Error for user [REDACTED] in prod',
    );
  });

  it('redacts JWT tokens', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(scrubPii(`Auth failed for token ${jwt}`)).toBe(
      'Auth failed for token [REDACTED]',
    );
  });

  it('redacts Bearer token header values', () => {
    expect(scrubPii('Authorization: Bearer abc123token')).toBe(
      'Authorization: Bearer [REDACTED]',
    );
  });

  it('redacts long hex blobs', () => {
    const hex = 'a3f9c1e2b4d6f8a09b2c4e1d3f5a7b9c';
    expect(scrubPii(`Session token: ${hex}`)).toBe('Session token: [REDACTED]');
  });

  it('redacts JSON-like sensitive key string values', () => {
    expect(
      scrubPii('payload: {"token": "super-secret-value", "user": "alice"}'),
    ).toBe('payload: {"token": "[REDACTED]", "user": "alice"}');
  });

  it('redacts JSON-like sensitive key numeric values', () => {
    expect(scrubPii('payload: {"api_key": 123456, "user": "alice"}')).toBe(
      'payload: {"api_key": "[REDACTED]", "user": "alice"}',
    );
  });

  it('redacts JSON-like sensitive key boolean values', () => {
    expect(scrubPii('payload: {"session": true, "active": false}')).toBe(
      'payload: {"session": "[REDACTED]", "active": false}',
    );
  });

  it('redacts JSON-like sensitive key null values', () => {
    expect(scrubPii('payload: {"password": null}')).toBe(
      'payload: {"password": "[REDACTED]"}',
    );
  });

  it('leaves clean text unchanged', () => {
    const clean = 'TypeError: Cannot read property "foo" of undefined';
    expect(scrubPii(clean)).toBe(clean);
  });
});

describe('formatRollbarEmbed PII scrubbing', () => {
  it('strips query string from request URL', () => {
    const event: RollbarEvent = {
      event_name: 'occurrence',
      data: {
        occurrence: {
          level: 'error',
          environment: 'production',
          body: { message: { body: 'something broke' } },
          request: {
            url: 'https://api.example.com/v1/leagues?token=supersecret&user=42',
            method: 'GET',
          },
        },
      },
    };

    const embed = formatRollbarEmbed(event);

    expect(embed).not.toBeNull();
    const requestField = embed?.fields?.find((f) => f.name === 'Request');
    expect(requestField?.value).toBe('GET https://api.example.com/v1/leagues');
    expect(requestField?.value).not.toContain('token=');
    expect(requestField?.value).not.toContain('user=');
  });

  it('redacts email address in item.title', () => {
    const event: RollbarEvent = {
      event_name: 'new_item',
      data: {
        item: {
          title: 'Login failed for user@example.com',
          level: 'error',
          environment: 'production',
        },
      },
    };

    const embed = formatRollbarEmbed(event);

    expect(embed).not.toBeNull();
    expect(embed?.title).toBe('Login failed for [REDACTED]');
    expect(embed?.title).not.toContain('@');
  });

  it('redacts JWT token in exception message', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const event: RollbarEvent = {
      event_name: 'occurrence',
      data: {
        occurrence: {
          level: 'error',
          environment: 'production',
          body: {
            trace: {
              exception: {
                class: 'AuthError',
                message: `Invalid token: ${jwt}`,
              },
            },
          },
        },
      },
    };

    const embed = formatRollbarEmbed(event);

    expect(embed).not.toBeNull();
    expect(embed?.description).toContain('AuthError');
    expect(embed?.description).toContain('[REDACTED]');
    expect(embed?.description).not.toContain('eyJ');
  });

  it('redacts email in message.body', () => {
    const event: RollbarEvent = {
      event_name: 'occurrence',
      data: {
        occurrence: {
          level: 'warning',
          environment: 'staging',
          body: {
            message: {
              body: 'User admin@company.com exceeded rate limit',
            },
          },
        },
      },
    };

    const embed = formatRollbarEmbed(event);

    expect(embed).not.toBeNull();
    expect(embed?.description).toBe('User [REDACTED] exceeded rate limit');
  });
});

describe('postToDiscord', () => {
  const originalFetch = globalThis.fetch;
  const embed = { title: 'Test', description: 'Test embed', color: 0xed4245 };
  const loggerMock = jest.requireMock<{ LOGGER: { warn: jest.Mock } }>(
    '@legacy-sports/logging',
  );

  beforeEach(() => {
    loggerMock.LOGGER.warn.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends embed to Discord webhook URL', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    globalThis.fetch = mockFetch;

    await postToDiscord('https://discord.com/api/webhooks/test', embed);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/test',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      }),
    );
  });

  it('retries on 429 using retry_after from body and succeeds', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: jest.fn().mockResolvedValue({ retry_after: 0 }),
        headers: { get: jest.fn().mockReturnValue(null) },
      })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    globalThis.fetch = mockFetch;

    await postToDiscord('https://discord.com/api/webhooks/test', embed);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(loggerMock.LOGGER.warn).not.toHaveBeenCalled();
  });

  it('retries on 429 using Retry-After header when body has no retry_after', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: jest.fn().mockResolvedValue({}),
        headers: { get: jest.fn().mockReturnValue('0') },
      })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    globalThis.fetch = mockFetch;

    await postToDiscord('https://discord.com/api/webhooks/test', embed);

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('drops message without throwing when rate-limited twice', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: jest.fn().mockResolvedValue({ retry_after: 0 }),
      headers: { get: jest.fn().mockReturnValue(null) },
    });

    await expect(
      postToDiscord('https://discord.com/api/webhooks/test', embed),
    ).resolves.toBeUndefined();

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(loggerMock.LOGGER.warn).toHaveBeenCalledWith(
      expect.stringContaining('rate-limited'),
      expect.objectContaining({ status: 429 }),
    );
  });

  it('throws on non-ok responses other than 429', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(
      postToDiscord('https://discord.com/api/webhooks/test', embed),
    ).rejects.toThrow('Discord webhook failed: 500 Internal Server Error');
  });

  it('propagates AbortError when fetch times out', async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new DOMException('signal timed out', 'TimeoutError'));

    await expect(
      postToDiscord('https://discord.com/api/webhooks/test', embed),
    ).rejects.toThrow('signal timed out');
  });
});
