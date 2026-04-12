import type { APIGatewayEvent, SNSEvent } from 'aws-lambda';

// Mock dependencies before importing handler
jest.mock('@legacy-sports/aws-utils', () => ({
  retrieveSecretParameterValue: jest.fn((name: string) => {
    if (name === 'discord-webhook-url')
      return Promise.resolve('https://discord.com/api/webhooks/test');
    if (name === 'rollbar-webhook-secret')
      return Promise.resolve('test-rollbar-webhook-secret');
    return Promise.reject(new Error(`Unknown secret: ${name}`));
  }),
}));

jest.mock('@legacy-sports/rollbar', () => ({
  getRollbarConfigFromEnv: jest.fn(() => null),
  initRollbar: jest.fn(),
  withRollbar: (fn: unknown) => fn,
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock fetch globally
const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
globalThis.fetch = mockFetch;

// Set env vars before importing handler
process.env['DISCORD_WEBHOOK_URL_SECRET_NAME'] = 'discord-webhook-url';
process.env['ROLLBAR_WEBHOOK_SECRET_SECRET_NAME'] = 'rollbar-webhook-secret';

import { baseHandler, parsePlainTextBudgetNotification } from './index';

const VALID_AUTH_TOKEN = 'test-rollbar-webhook-secret';

function makeApiGatewayEvent(
  overrides: Partial<APIGatewayEvent> = {},
): APIGatewayEvent {
  return {
    httpMethod: 'GET',
    path: '/rollbar-discord/health',
    headers: {},
    body: null,
    queryStringParameters: { auth: VALID_AUTH_TOKEN },
    pathParameters: null,
    stageVariables: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    requestContext: {
      identity: {},
    } as APIGatewayEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

function makeSnsEvent(message: string): SNSEvent {
  return {
    Records: [
      {
        EventSource: 'aws:sns',
        EventVersion: '1.0',
        EventSubscriptionArn: 'arn:aws:sns:us-east-1:123:topic:sub',
        Sns: {
          Type: 'Notification',
          MessageId: 'test-id',
          TopicArn: 'arn:aws:sns:us-east-1:123:topic',
          Subject: 'ALARM',
          Message: message,
          Timestamp: '2024-01-15T10:30:00Z',
          SignatureVersion: '1',
          Signature: '',
          SigningCertUrl: '',
          UnsubscribeUrl: '',
          MessageAttributes: {},
        },
      },
    ],
  };
}

describe('parsePlainTextBudgetNotification', () => {
  const fullMessage = [
    'AWS Budget Notification April 12, 2026',
    'AWS Account 123456789012',
    '',
    'Dear AWS Customer,',
    '',
    'You requested that we alert you when the ACTUAL Cost associated with your my-budget budget is greater than $200.00 for the current month.',
    '',
    'Budget Name: my-budget',
    'Budget Type: COST',
    'Budgeted Amount: $200.00',
    'Alert Type: ACTUAL',
    'Alert Threshold: > $200.00 (100.0%)',
    'ACTUAL Amount: $205.50',
    'FORECASTED Amount: $250.00',
    '',
    '[1] https://console.aws.amazon.com/billing/home#/budgets',
  ].join('\n');

  it('extracts all fields from a full budget notification', () => {
    const result = parsePlainTextBudgetNotification(fullMessage);
    expect(result).toEqual({
      accountId: '123456789012',
      budgetName: 'my-budget',
      budgetType: 'COST',
      budgetLimit: '$200.00',
      actualSpend: '$205.50',
      forecastedSpend: '$250.00',
      thresholdPercentage: '100.0',
    });
  });

  it('handles messages without forecasted spend', () => {
    const noForecast = fullMessage.replace('FORECASTED Amount: $250.00\n', '');
    const result = parsePlainTextBudgetNotification(noForecast);
    expect(result).not.toBeNull();
    expect(result!.forecastedSpend).toBeUndefined();
  });

  it('handles integer threshold percentages', () => {
    const intThreshold = fullMessage.replace('(100.0%)', '(80%)');
    const result = parsePlainTextBudgetNotification(intThreshold);
    expect(result).not.toBeNull();
    expect(result!.thresholdPercentage).toBe('80');
  });

  it('returns null for non-budget text', () => {
    expect(parsePlainTextBudgetNotification('Hello world')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parsePlainTextBudgetNotification('')).toBeNull();
  });
});

describe('baseHandler', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
  });

  describe('API Gateway — health check', () => {
    it('returns 200 for GET /health', async () => {
      const event = makeApiGatewayEvent({
        httpMethod: 'GET',
        path: '/rollbar-discord/health',
      });

      const result = await baseHandler(event);
      expect(result).toEqual({
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ok' }),
      });
    });
  });

  describe('API Gateway — Rollbar webhook', () => {
    const rollbarBody = JSON.stringify({
      event_name: 'new_item',
      data: {
        item: {
          title: 'Test error',
          level: 'error',
          environment: 'production',
        },
      },
    });

    it('returns 200 for a valid webhook with correct auth token', async () => {
      const event = makeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/rollbar-discord/webhook',
        body: rollbarBody,
      });

      const result = await baseHandler(event);
      expect(result).toEqual(expect.objectContaining({ statusCode: 200 }));
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns 403 for invalid auth token', async () => {
      const event = makeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/rollbar-discord/webhook',
        body: rollbarBody,
        queryStringParameters: { auth: 'wrong-token-value-xxxxxx' },
      });

      const result = await baseHandler(event);
      expect(result).toEqual(expect.objectContaining({ statusCode: 403 }));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns 403 when auth token is missing', async () => {
      const event = makeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/rollbar-discord/webhook',
        body: rollbarBody,
        queryStringParameters: null,
      });

      const result = await baseHandler(event);
      expect(result).toEqual(expect.objectContaining({ statusCode: 403 }));
    });

    it('returns 400 for invalid payload', async () => {
      const event = makeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/rollbar-discord/webhook',
        body: 'not json',
      });

      const result = await baseHandler(event);
      expect(result).toEqual(expect.objectContaining({ statusCode: 400 }));
    });

    it('returns 200 with skipped status for events without actionable data', async () => {
      const event = makeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/rollbar-discord/webhook',
        body: JSON.stringify({
          event_name: 'deploy',
          data: {},
        }),
      });

      const result = await baseHandler(event);
      expect(result).toEqual({
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'skipped' }),
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('API Gateway — 404', () => {
    it('returns 404 for unknown routes', async () => {
      const event = makeApiGatewayEvent({
        httpMethod: 'GET',
        path: '/rollbar-discord/unknown',
      });

      const result = await baseHandler(event);
      expect(result).toEqual(expect.objectContaining({ statusCode: 404 }));
    });
  });

  describe('SNS — CloudWatch Alarm', () => {
    it('posts alarm embed to Discord', async () => {
      const alarm = {
        AlarmName: 'test-dlq-alarm',
        AlarmDescription: 'DLQ has messages',
        NewStateValue: 'ALARM',
        NewStateReason: 'Threshold crossed',
        StateChangeTime: '2024-01-15T10:30:00Z',
        Region: 'us-east-1',
        Trigger: {
          MetricName: 'ApproximateNumberOfMessagesVisible',
          Namespace: 'AWS/SQS',
          Period: 60,
          Statistic: 'Sum',
          Threshold: 1,
          ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        },
      };

      const event = makeSnsEvent(JSON.stringify(alarm));
      await baseHandler(event);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://discord.com/api/webhooks/test');
      const body = JSON.parse(opts.body as string) as {
        embeds: Array<{ title: string }>;
      };
      expect(body.embeds[0].title).toBe('test-dlq-alarm');
    });

    it('skips invalid SNS messages gracefully', async () => {
      const event = makeSnsEvent('not valid json');
      await baseHandler(event);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('SNS — Budget Notification (plain text)', () => {
    const plainTextBudget = [
      'AWS Budget Notification April 12, 2026',
      'AWS Account 123456789012',
      '',
      'Dear AWS Customer,',
      '',
      'You requested that we alert you when the ACTUAL Cost associated with your legacy-sports-dev-monthly-budget budget is greater than $100.00 for the current month. The ACTUAL Cost associated with this budget is $82.50. You can find additional details below and in the AWS Budgets dashboard [1].',
      '',
      'Budget Name: legacy-sports-dev-monthly-budget',
      'Budget Type: COST',
      'Budgeted Amount: $100.00',
      'Alert Type: ACTUAL',
      'Alert Threshold: > $100.00 (80%)',
      'ACTUAL Amount: $82.50',
      'FORECASTED Amount: $110.00',
      '',
      '[1] https://console.aws.amazon.com/billing/home#/budgets',
    ].join('\n');

    it('posts budget embed to Discord from plain-text SNS message', async () => {
      const event = makeSnsEvent(plainTextBudget);
      await baseHandler(event);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://discord.com/api/webhooks/test');
      const body = JSON.parse(opts.body as string) as {
        embeds: Array<{ title: string; footer: { text: string } }>;
      };
      expect(body.embeds[0].title).toBe(
        'Budget Alert: legacy-sports-dev-monthly-budget',
      );
      expect(body.embeds[0].footer.text).toBe('AWS Budgets');
    });

    it('posts 100% threshold budget alert from plain text', async () => {
      const over100 = plainTextBudget
        .replace('(80%)', '(100%)')
        .replace('ACTUAL Amount: $82.50', 'ACTUAL Amount: $105.00');
      const event = makeSnsEvent(over100);
      await baseHandler(event);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      ) as { embeds: Array<{ color: number }> };
      expect(body.embeds[0].color).toBe(0xed4245); // red for >=100%
    });
  });

  describe('SNS — Budget Notification (JSON fallback)', () => {
    it('still handles JSON budget payloads for forward-compatibility', async () => {
      const budgetNotification = {
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

      const event = makeSnsEvent(JSON.stringify(budgetNotification));
      await baseHandler(event);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      ) as { embeds: Array<{ title: string; footer: { text: string } }> };
      expect(body.embeds[0].title).toBe(
        'Budget Alert: legacy-sports-dev-monthly-budget',
      );
      expect(body.embeds[0].footer.text).toBe('AWS Budgets');
    });

    it('skips unrecognized SNS message types', async () => {
      const event = makeSnsEvent(JSON.stringify({ someUnknownField: 'value' }));
      await baseHandler(event);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
