import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import {
  __setSqsClientForTest,
  enqueueRaceCheck,
  MAX_RACE_CHECK_ATTEMPTS,
  RACE_CHECK_DELAY_SECONDS,
} from './sqs-client';

describe('sqs-client — constants', () => {
  it('exports MAX_RACE_CHECK_ATTEMPTS as a positive integer', () => {
    expect(MAX_RACE_CHECK_ATTEMPTS).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(MAX_RACE_CHECK_ATTEMPTS)).toBe(true);
  });

  it('exports RACE_CHECK_DELAY_SECONDS within SQS per-message limit', () => {
    expect(RACE_CHECK_DELAY_SECONDS).toBeGreaterThan(0);
    expect(RACE_CHECK_DELAY_SECONDS).toBeLessThanOrEqual(900);
  });
});

describe('enqueueRaceCheck', () => {
  let sendMock: jest.Mock<Promise<unknown>, [SendMessageCommand]>;
  let fakeClient: SQSClient;

  function getSentCommand(callIndex: number): SendMessageCommand {
    const call = sendMock.mock.calls[callIndex];
    if (!call) throw new Error(`No SQS send call at index ${callIndex}`);
    return call[0];
  }

  beforeEach(() => {
    sendMock = jest
      .fn<Promise<unknown>, [SendMessageCommand]>()
      .mockResolvedValue({ MessageId: 'mid-1' });
    fakeClient = { send: sendMock } as unknown as SQSClient;
    __setSqsClientForTest(fakeClient);
    process.env['RACE_CHECK_QUEUE_URL'] =
      'https://sqs.us-east-1.amazonaws.com/123/race-check';
  });

  afterEach(() => {
    __setSqsClientForTest(null);
    delete process.env['RACE_CHECK_QUEUE_URL'];
  });

  it('sends a SendMessageCommand with JSON body and queue URL from env', async () => {
    await enqueueRaceCheck({
      type: 'race-check',
      owner: 'bkrupa',
      repo: 'legacy-sports',
      prNumber: 42,
      headSha: 'abc1234',
      attempt: 1,
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const cmd: SendMessageCommand = getSentCommand(0);
    expect(cmd).toBeInstanceOf(SendMessageCommand);
    expect(cmd.input.QueueUrl).toBe(
      'https://sqs.us-east-1.amazonaws.com/123/race-check',
    );
    expect(cmd.input.DelaySeconds).toBe(RACE_CHECK_DELAY_SECONDS);
    expect(JSON.parse(cmd.input.MessageBody as string)).toEqual({
      type: 'race-check',
      owner: 'bkrupa',
      repo: 'legacy-sports',
      prNumber: 42,
      headSha: 'abc1234',
      attempt: 1,
    });
  });

  it('uses the explicit delay when provided', async () => {
    await enqueueRaceCheck(
      {
        type: 'race-check',
        owner: 'o',
        repo: 'r',
        prNumber: 1,
        headSha: 'a',
        attempt: 1,
      },
      42,
    );
    const cmd = getSentCommand(0);
    expect(cmd.input.DelaySeconds).toBe(42);
  });

  it('clamps delay to the SQS max of 900s', async () => {
    await enqueueRaceCheck(
      {
        type: 'race-check',
        owner: 'o',
        repo: 'r',
        prNumber: 1,
        headSha: 'a',
        attempt: 1,
      },
      99_999,
    );
    const cmd = getSentCommand(0);
    expect(cmd.input.DelaySeconds).toBe(900);
  });

  it('clamps negative delays to 0', async () => {
    await enqueueRaceCheck(
      {
        type: 'race-check',
        owner: 'o',
        repo: 'r',
        prNumber: 1,
        headSha: 'a',
        attempt: 1,
      },
      -5,
    );
    const cmd = getSentCommand(0);
    expect(cmd.input.DelaySeconds).toBe(0);
  });

  it('throws when RACE_CHECK_QUEUE_URL is unset', async () => {
    delete process.env['RACE_CHECK_QUEUE_URL'];
    await expect(
      enqueueRaceCheck({
        type: 'race-check',
        owner: 'o',
        repo: 'r',
        prNumber: 1,
        headSha: 'a',
        attempt: 1,
      }),
    ).rejects.toThrow(/RACE_CHECK_QUEUE_URL/);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
