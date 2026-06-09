import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { LOGGER } from '@legacy-sports/logging';

/**
 * Mask an email address for logging / audit output so it never lands in logs
 * or audit events as plaintext PII while remaining useful for incident
 * response (the domain and first local-part character are preserved, which is
 * enough to recognize a targeted account without exposing the full address).
 *
 * Examples:
 *   maskEmail('jane.doe@example.com') === 'j***@example.com'
 *   maskEmail('a@example.com')        === '***@example.com'
 *   maskEmail('not-an-email')         === '***'
 */
export function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!domain || !localPart) return '***';
  const maskedLocal = localPart.length <= 1 ? '***' : `${localPart[0]}***`;
  return `${maskedLocal}@${domain}`;
}

/**
 * Transactional email sending for the oauth-proxy (LS-6678 / LGN-023).
 *
 * This is the first email-sending surface in the codebase, so it deliberately
 * mirrors the best-effort posture of the Discord signup webhook
 * (`util/discord.ts`): when the feature is not configured for the current
 * environment (no `PASSWORD_RESET_FROM_ADDRESS`), sending is skipped with a log
 * line rather than throwing. This keeps local/dev and unconfigured environments
 * working while still wiring real delivery in environments that set the from
 * address and grant the lambda `ses:SendEmail`.
 */

let sesClient: SESv2Client | null = null;

function getSesClient(): SESv2Client {
  if (!sesClient) {
    sesClient = new SESv2Client({
      region: process.env.AWS_REGION ?? 'us-east-1',
    });
  }
  return sesClient;
}

/** Resolve the configured from address, or null when email is not configured. */
function getFromAddress(): string | null {
  const from = process.env.PASSWORD_RESET_FROM_ADDRESS?.trim();
  return from ? from : null;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send a transactional email via SES. Best-effort: returns `false` (and logs)
 * when email is not configured or delivery fails, and never throws, so callers
 * can keep their response uniform regardless of delivery outcome (important for
 * the no-enumeration forgot-password contract).
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const from = getFromAddress();
  if (!from) {
    LOGGER.debug(
      'PASSWORD_RESET_FROM_ADDRESS not configured — skipping email send',
    );
    return false;
  }

  try {
    await getSesClient().send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [params.to] },
        Content: {
          Simple: {
            Subject: { Data: params.subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: params.html, Charset: 'UTF-8' },
              Text: { Data: params.text, Charset: 'UTF-8' },
            },
          },
        },
      }),
    );
    LOGGER.info('Transactional email sent', { subject: params.subject });
    return true;
  } catch (error) {
    // Pass the Error instance directly so Rollbar can extract the stack trace.
    LOGGER.error(
      'Failed to send transactional email',
      error instanceof Error ? error : new Error(String(error)),
      { subject: params.subject },
    );
    return false;
  }
}

/**
 * Send the password-reset email containing the single-use reset link.
 *
 * The raw token lives only in this link — it is never logged or stored. In
 * environments where email is not configured the send is skipped (returns
 * false); in dev the reset URL is logged at debug so flows can be tested
 * without a mail provider.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<boolean> {
  LOGGER.debug('Preparing password-reset email');

  const subject = 'Reset your Legacy Sports password';
  const text = [
    'We received a request to reset your Legacy Sports password.',
    '',
    'Use the link below to choose a new password. It can only be used once and',
    'expires in one hour:',
    '',
    resetUrl,
    '',
    "If you didn't request this, you can safely ignore this email — your",
    'password will not change.',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#0A0F1A;color:#F8FAFC;font-family:Georgia,'Times New Roman',serif;">
    <div style="max-width:480px;margin:0 auto;background:#16223A;border:1px solid #1F2D48;border-radius:12px;padding:32px;">
      <div style="font-size:22px;font-weight:700;color:#C5A55A;margin-bottom:16px;">
        Legacy <span style="color:#F8FAFC;">Sports</span>
      </div>
      <p style="font-size:15px;line-height:1.6;color:#E2E8F0;">
        We received a request to reset your Legacy Sports password.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#E2E8F0;">
        Use the button below to choose a new password. It can only be used once
        and expires in one hour.
      </p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;background:#1B3A5C;color:#F8FAFC;text-decoration:none;border-radius:8px;font-weight:600;">
          Reset password
        </a>
      </p>
      <p style="font-size:13px;line-height:1.6;color:#9CAAC5;">
        If you didn't request this, you can safely ignore this email — your
        password will not change.
      </p>
    </div>
  </body>
</html>`;

  if (!getFromAddress()) {
    // Dev convenience: surface the link when no mail provider is configured.
    LOGGER.debug('Password-reset email not sent (email unconfigured)', {
      resetUrl,
    });
  }

  return sendEmail({ to, subject, html, text });
}
