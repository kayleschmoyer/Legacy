import { formatAlarmEmbed, formatRollbarEmbed, postToDiscord } from './discord';
import type { CloudWatchAlarm, RollbarEvent } from './types';

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

    expect(embed.title).toBe('TypeError: Cannot read property "foo"');
    expect(embed.color).toBe(0xed4245); // red for error
    expect(embed.url).toBe('https://rollbar.com/item/123');
    expect(embed.fields).toEqual(
      expect.arrayContaining([
        { name: 'Event', value: 'new_item', inline: true },
        { name: 'Level', value: 'ERROR', inline: true },
        { name: 'Environment', value: 'production', inline: true },
        { name: 'Occurrences', value: '5', inline: true },
        { name: 'Framework', value: 'node-js', inline: true },
      ]),
    );
    expect(embed.timestamp).toBeDefined();
    expect(embed.footer).toEqual({ text: 'Rollbar' });
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

    expect(embed.color).toBe(0xfee75c); // yellow for warning
    expect(embed.description).toContain('ValidationError');
    expect(embed.description).toContain('Invalid input');
    expect(embed.fields).toEqual(
      expect.arrayContaining([
        { name: 'Request', value: 'POST /api/test', inline: false },
      ]),
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
    expect(embed.title.length).toBeLessThanOrEqual(256);
    expect(embed.title.endsWith('...')).toBe(true);
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

  it('throws on non-ok response', async () => {
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
    ).rejects.toThrow('Discord webhook returned 429');
  });
});
