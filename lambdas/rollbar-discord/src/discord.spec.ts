import {
  formatAlarmEmbed,
  formatBudgetEmbed,
  formatRollbarEmbed,
  postToDiscord,
} from './discord';
import type {
  BudgetNotification,
  CloudWatchAlarm,
  RollbarEvent,
} from './types';

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

describe('postToDiscord', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends embed to Discord webhook URL', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });
    globalThis.fetch = mockFetch;

    const embed = {
      title: 'Test',
      description: 'Test embed',
      color: 0xed4245,
    };

    await postToDiscord('https://discord.com/api/webhooks/test', embed);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/test',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      },
    );
  });

  it('swallows 429 rate-limit responses without throwing', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: jest.fn().mockResolvedValue('rate limited'),
    });

    const embed = {
      title: 'Test',
      description: 'Test embed',
      color: 0xed4245,
    };

    await expect(
      postToDiscord('https://discord.com/api/webhooks/test', embed),
    ).rejects.toThrow('Discord webhook failed: 429 Too Many Requests');
  });

  it('throws on other non-ok responses', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: jest.fn().mockResolvedValue('server error'),
    });

    const embed = {
      title: 'Test',
      description: 'Test embed',
      color: 0xed4245,
    };

    await expect(
      postToDiscord('https://discord.com/api/webhooks/test', embed),
    ).rejects.toThrow('Discord webhook failed: 500 Internal Server Error');
  });
});
