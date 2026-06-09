const mockSend = jest.fn();

jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  SendEmailCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { maskEmail, sendEmail, sendPasswordResetEmail } from './email';

const FROM = 'PASSWORD_RESET_FROM_ADDRESS';

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env[FROM];
});

describe('maskEmail', () => {
  it('keeps the first local-part character and the full domain', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j***@example.com');
  });

  it('fully masks a single-character local part', () => {
    expect(maskEmail('a@example.com')).toBe('***@example.com');
  });

  it('returns *** when there is no domain', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('returns *** for an empty string', () => {
    expect(maskEmail('')).toBe('***');
  });
});

describe('sendEmail', () => {
  it('skips sending and returns false when no from address is configured', async () => {
    const ok = await sendEmail({
      to: 'a@b.com',
      subject: 's',
      html: '<p>h</p>',
      text: 't',
    });
    expect(ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends via SES and returns true when configured', async () => {
    process.env[FROM] = 'no-reply@legacy-fantasy.com';
    mockSend.mockResolvedValueOnce(undefined);

    const ok = await sendEmail({
      to: 'a@b.com',
      subject: 's',
      html: '<p>h</p>',
      text: 't',
    });

    expect(ok).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('returns false (never throws) when SES send rejects', async () => {
    process.env[FROM] = 'no-reply@legacy-fantasy.com';
    mockSend.mockRejectedValueOnce(new Error('SES boom'));

    const ok = await sendEmail({
      to: 'a@b.com',
      subject: 's',
      html: '<p>h</p>',
      text: 't',
    });

    expect(ok).toBe(false);
  });
});

describe('sendPasswordResetEmail', () => {
  it('returns false when email is not configured', async () => {
    const ok = await sendPasswordResetEmail(
      'user@example.com',
      'https://x/oauth/reset-password?token=abc',
    );
    expect(ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends an email containing the reset URL when configured', async () => {
    process.env[FROM] = 'no-reply@legacy-fantasy.com';
    mockSend.mockResolvedValueOnce(undefined);
    const url =
      'https://api.example.com/prod/oauth/reset-password?token=abc123';

    const ok = await sendPasswordResetEmail('user@example.com', url);

    expect(ok).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const calls = mockSend.mock.calls as Array<
      [
        {
          input: {
            FromEmailAddress: string;
            Destination: { ToAddresses: string[] };
            Content: { Simple: { Body: { Html: { Data: string } } } };
          };
        },
      ]
    >;
    const command = calls[0][0];
    expect(command.input.Destination.ToAddresses).toEqual(['user@example.com']);
    expect(command.input.Content.Simple.Body.Html.Data).toContain(url);
  });
});
