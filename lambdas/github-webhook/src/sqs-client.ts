import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { LOGGER } from '@legacy-sports/logging';

/**
 * Payload for a delayed race-check self-invocation.
 *
 * Enqueued after `pull_request.synchronize` to verify — and if necessary,
 * re-trigger — a Copilot code review that GitHub may have silently dropped.
 * See `.agents/skills/pr-lifecycle/references/copilot-auto-approve-flow.md`
 * (Race Condition #2) for background.
 */
export interface RaceCheckMessage {
  /** Discriminator for future message types on the same queue. */
  type: 'race-check';
  owner: string;
  repo: string;
  prNumber: number;
  /** head_sha at the moment the check was enqueued — handler drops if it changed. */
  headSha: string;
  /** 1-based attempt counter (max 3). Re-enqueued attempts increment this. */
  attempt: number;
}

/** Max app-level re-trigger attempts before writing bot-review=failure. */
export const MAX_RACE_CHECK_ATTEMPTS = 3;

/** Delay between attempts (seconds). SQS caps per-message delay at 900 s. */
export const RACE_CHECK_DELAY_SECONDS = 90;

// Lambda keeps a single SQSClient across warm invocations (connection reuse).
let cachedClient: SQSClient | null = null;
function getClient(): SQSClient {
  if (!cachedClient) {
    cachedClient = new SQSClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
    });
  }
  return cachedClient;
}

/** Test-only hook: override the SQS client (e.g., with a mocked instance). */
export function __setSqsClientForTest(client: SQSClient | null): void {
  cachedClient = client;
}

/**
 * Enqueue a race-check message with the given delay.
 *
 * Reads the queue URL from `RACE_CHECK_QUEUE_URL` lazily (so tests can import
 * the module before env vars are set). Throws if the env var is missing;
 * callers decide whether to treat that as fatal or recoverable — e.g.
 * `handle-pull-request.ts` catches enqueue errors so a queue hiccup doesn't
 * fail the main webhook request.
 */
export async function enqueueRaceCheck(
  message: RaceCheckMessage,
  delaySeconds: number = RACE_CHECK_DELAY_SECONDS,
): Promise<void> {
  const queueUrl = process.env.RACE_CHECK_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('RACE_CHECK_QUEUE_URL env var is not set');
  }

  // SQS per-message delay hard limit is 900 s (15 min).
  const clampedDelay = Math.max(0, Math.min(900, Math.floor(delaySeconds)));

  await getClient().send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
      DelaySeconds: clampedDelay,
    }),
  );

  LOGGER.info('Enqueued race-check message', {
    prNumber: message.prNumber,
    headSha: message.headSha,
    attempt: message.attempt,
    delaySeconds: clampedDelay,
  });
}
