import type { APIGatewayEvent, SNSEvent } from 'aws-lambda';
import { createHmac } from 'crypto';

// Mock dependencies before importing handler
jest.mock('@legacy-sports/aws-utils', () => ({
  retrieveSecretParameterValue: jest.fn((name: string) => {
    if (name === 'rollbar-webhook-secret')
      return Promise.resolve('test-secret');
    if (name === 'discord-webhook-url')
      return Promise.resolve('https://discord.com/api/webhooks/test');
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
process.env['ROLLBAR_WEBHOOK_SECRET_NAME'] = 'rollbar-webhook-secret';
process.env['DISCORD_WEBHOOK_URL_SECRET_NAME'] = 'discord-webhook-url';

import { baseHandler } from './index';

function sign(body: string): string {
  return createHmac('sha256', 'test-secret').update(body).digest('hex');
}

function makeApiGatewayEvent(
  overrides: Partial<APIGatewayEvent> = {},
): APIGatewayEvent {
  return {
    httpMethod: 'GET',
    path: '/rollbar-discord/health',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    requestContext: {} as APIGatewayEvent['requestContext'],
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

    it('returns 200 for a valid webhook', async () => {
      const event = makeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/rollbar-discord/webhook',
        body: rollbarBody,
        headers: { 'X-Rollbar-Signature': sign(rollbarBody) },
      });

      const result = await baseHandler(event);
      expect(result).toEqual(expect.objectContaining({ statusCode: 200 }));
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns 401 for invalid signature', async () => {
      const event = makeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/rollbar-discord/webhook',
        body: rollbarBody,
        headers: { 'X-Rollbar-Signature': 'badsig' },
      });

      const result = await baseHandler(event);
      expect(result).toEqual(expect.objectContaining({ statusCode: 401 }));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns 401 when signature header is missing', async () => {
      const event = makeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/rollbar-discord/webhook',
        body: rollbarBody,
        headers: {},
      });

      const result = await baseHandler(event);
      expect(result).toEqual(expect.objectContaining({ statusCode: 401 }));
    });

    it('returns 400 for invalid payload', async () => {
      const badBody = 'not json';
      const event = makeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/rollbar-discord/webhook',
        body: badBody,
        headers: { 'X-Rollbar-Signature': sign(badBody) },
      });

      const result = await baseHandler(event);
      expect(result).toEqual(expect.objectContaining({ statusCode: 400 }));
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
});
