import { createHmac } from 'crypto';
import {
  verifyGitHubSignature,
  verifyJiraWebhookSecret,
} from './verify-signature';

function makeSignature(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

const SECRET = 'test-webhook-secret';
const BODY = '{"action":"resolved"}';

describe('verifyGitHubSignature', () => {
  it('returns true for a valid signature', () => {
    const sig = makeSignature(BODY, SECRET);
    expect(verifyGitHubSignature(BODY, sig, SECRET)).toBe(true);
  });

  it('returns false when the signature header is missing', () => {
    expect(verifyGitHubSignature(BODY, undefined, SECRET)).toBe(false);
  });

  it('returns false when the signature header is empty', () => {
    expect(verifyGitHubSignature(BODY, '', SECRET)).toBe(false);
  });

  it('returns false when the secret is empty', () => {
    const sig = makeSignature(BODY, SECRET);
    expect(verifyGitHubSignature(BODY, sig, '')).toBe(false);
  });

  it('returns false when the body is tampered with', () => {
    const sig = makeSignature(BODY, SECRET);
    expect(verifyGitHubSignature('{"action":"tampered"}', sig, SECRET)).toBe(
      false,
    );
  });

  it('returns false when the secret is wrong', () => {
    const sig = makeSignature(BODY, SECRET);
    expect(verifyGitHubSignature(BODY, sig, 'wrong-secret')).toBe(false);
  });

  it('returns false for a signature with wrong length (timing-safe branch)', () => {
    // Different length prevents timingSafeEqual — the catch block returns false
    expect(verifyGitHubSignature(BODY, 'sha256=abc', SECRET)).toBe(false);
  });

  it('returns false when the prefix is missing', () => {
    const hex = createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyGitHubSignature(BODY, hex, SECRET)).toBe(false);
  });
});

describe('verifyJiraWebhookSecret', () => {
  const JIRA_SECRET = 'super-secret-jira-token';

  it('returns true when the provided secret matches', () => {
    expect(verifyJiraWebhookSecret(JIRA_SECRET, JIRA_SECRET)).toBe(true);
  });

  it('returns false when the provided secret is undefined', () => {
    expect(verifyJiraWebhookSecret(JIRA_SECRET, undefined)).toBe(false);
  });

  it('returns false when the provided secret is empty', () => {
    expect(verifyJiraWebhookSecret(JIRA_SECRET, '')).toBe(false);
  });

  it('returns false when the expected secret is empty', () => {
    expect(verifyJiraWebhookSecret('', JIRA_SECRET)).toBe(false);
  });

  it('returns false when the secret is wrong', () => {
    expect(verifyJiraWebhookSecret(JIRA_SECRET, 'wrong-token')).toBe(false);
  });

  it('returns false for a token with different length (timing-safe branch)', () => {
    expect(verifyJiraWebhookSecret(JIRA_SECRET, 'short')).toBe(false);
  });
});
