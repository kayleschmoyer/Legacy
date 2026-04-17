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

import { notifyStripeEvent } from './discord';

describe('notifyStripeEvent', () => {
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

  it('skips when webhook URL is not configured', async () => {
    delete process.env['DISCORD_STRIPE_WEBHOOK_URL'];
    delete process.env['DISCORD_STRIPE_WEBHOOK_URL_SECRET_NAME'];

    await notifyStripeEvent({
      eventType: 'checkout.session.completed',
      userId: 1,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends notification for checkout.session.completed', async () => {
    process.env['DISCORD_STRIPE_WEBHOOK_URL'] =
      'https://discord.com/api/webhooks/test/token';

    await notifyStripeEvent({
      eventType: 'checkout.session.completed',
      customerId: 'cus_123',
      subscriptionId: 'sub_456',
      userId: 42,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/webhooks/test/token');

    const body = JSON.parse(options.body as string) as {
      embeds: Array<{ title: string; color: number }>;
    };
    expect(body.embeds[0].title).toBe('New Subscription');
    expect(body.embeds[0].color).toBe(0x57f287); // Green
  });

  it('sends notification for subscription deleted', async () => {
    process.env['DISCORD_STRIPE_WEBHOOK_URL'] =
      'https://discord.com/api/webhooks/test/token';

    await notifyStripeEvent({
      eventType: 'customer.subscription.deleted',
      customerId: 'cus_123',
      subscriptionId: 'sub_456',
      userId: 42,
      status: 'canceled',
    });

    const body = JSON.parse(
      (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as { embeds: Array<{ title: string; color: number }> };
    expect(body.embeds[0].title).toBe('Subscription Cancelled');
    expect(body.embeds[0].color).toBe(0xed4245); // Red
  });

  it('sends notification for payment failed with amount', async () => {
    process.env['DISCORD_STRIPE_WEBHOOK_URL'] =
      'https://discord.com/api/webhooks/test/token';

    await notifyStripeEvent({
      eventType: 'invoice.payment_failed',
      customerId: 'cus_123',
      subscriptionId: 'sub_456',
      userId: 42,
      amount: 999,
      currency: 'usd',
    });

    const body = JSON.parse(
      (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as {
      embeds: Array<{
        title: string;
        fields: Array<{ name: string; value: string }>;
      }>;
    };
    expect(body.embeds[0].title).toBe('Payment Failed');
    const amountField = body.embeds[0].fields.find((f) => f.name === 'Amount');
    expect(amountField?.value).toBe('9.99 USD');
  });

  it('sends notification for invoice.payment_succeeded', async () => {
    process.env['DISCORD_STRIPE_WEBHOOK_URL'] =
      'https://discord.com/api/webhooks/test/token';

    await notifyStripeEvent({
      eventType: 'invoice.payment_succeeded',
      customerId: 'cus_123',
      subscriptionId: 'sub_456',
      userId: 42,
      amount: 1999,
      currency: 'usd',
    });

    const body = JSON.parse(
      (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as {
      embeds: Array<{
        title: string;
        color: number;
        fields: Array<{ name: string; value: string }>;
      }>;
    };
    expect(body.embeds[0].title).toBe('Payment Succeeded');
    expect(body.embeds[0].color).toBe(0x57f287); // Green
    const amountField = body.embeds[0].fields.find((f) => f.name === 'Amount');
    expect(amountField?.value).toBe('19.99 USD');
  });

  it('sends notification for customer.subscription.updated', async () => {
    process.env['DISCORD_STRIPE_WEBHOOK_URL'] =
      'https://discord.com/api/webhooks/test/token';

    await notifyStripeEvent({
      eventType: 'customer.subscription.updated',
      customerId: 'cus_123',
      subscriptionId: 'sub_456',
      userId: 42,
      status: 'active',
    });

    const body = JSON.parse(
      (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as { embeds: Array<{ title: string; color: number }> };
    expect(body.embeds[0].title).toBe('Subscription Updated');
    expect(body.embeds[0].color).toBe(0x5865f2); // Blurple
  });

  it('skips unknown event types', async () => {
    process.env['DISCORD_STRIPE_WEBHOOK_URL'] =
      'https://discord.com/api/webhooks/test/token';

    await notifyStripeEvent({ eventType: 'some.unknown.event' });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not throw on webhook failure', async () => {
    process.env['DISCORD_STRIPE_WEBHOOK_URL'] =
      'https://discord.com/api/webhooks/test/token';
    fetchSpy.mockResolvedValue(new Response('error', { status: 500 }));

    await expect(
      notifyStripeEvent({
        eventType: 'checkout.session.completed',
        userId: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it('does not throw on network error', async () => {
    process.env['DISCORD_STRIPE_WEBHOOK_URL'] =
      'https://discord.com/api/webhooks/test/token';
    fetchSpy.mockRejectedValue(new Error('network error'));

    await expect(
      notifyStripeEvent({
        eventType: 'checkout.session.completed',
        userId: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it('fetches webhook URL via the secret-name path when only SECRET_NAME is set', async () => {
    delete process.env['DISCORD_STRIPE_WEBHOOK_URL'];
    process.env['DISCORD_STRIPE_WEBHOOK_URL_SECRET_NAME'] =
      'https://discord.com/api/webhooks/test/from-secret-name';

    // Reset the module cache so the module-scope webhookUrlPromise is
    // re-initialised from the new env var configuration rather than any
    // value cached by prior tests.
    jest.resetModules();
    const { notifyStripeEvent: fresh } = (await import('./discord')) as {
      notifyStripeEvent: typeof notifyStripeEvent;
    };

    await fresh({
      eventType: 'checkout.session.completed',
      userId: 42,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/webhooks/test/from-secret-name');
  });

  it('falls through to the secret-name path when the local env var is an empty string', async () => {
    process.env['DISCORD_STRIPE_WEBHOOK_URL'] = '';
    process.env['DISCORD_STRIPE_WEBHOOK_URL_SECRET_NAME'] =
      'https://discord.com/api/webhooks/test/secret-name-wins';

    jest.resetModules();
    const { notifyStripeEvent: fresh } = (await import('./discord')) as {
      notifyStripeEvent: typeof notifyStripeEvent;
    };

    await fresh({
      eventType: 'checkout.session.completed',
      userId: 7,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/webhooks/test/secret-name-wins');
  });
});
