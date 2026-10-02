jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import {
  type CommandRunner,
  logsFilter,
  MAX_CHARS,
  MAX_EVENTS,
} from './logs-filter.js';

function rawText(result: Awaited<ReturnType<typeof logsFilter>>): string {
  const block = result.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Expected a text content block');
  }
  return block.text;
}

function parseJson(result: Awaited<ReturnType<typeof logsFilter>>): unknown {
  return JSON.parse(rawText(result));
}

const LOG_GROUP = '/aws/lambda/legacy-sports-dev-graphql';

function makeEvent(overrides?: { timestamp?: number; message?: string }) {
  return {
    timestamp: overrides?.timestamp ?? 1_700_000_000_000,
    message: overrides?.message ?? 'hello world',
    logStreamName: 'stream/1',
  };
}

function makeAwsOutput(events: object[]): string {
  return JSON.stringify({ events });
}

describe('logsFilter', () => {
  describe('success', () => {
    it('returns structured events in json format', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValue(makeAwsOutput([makeEvent({ message: 'log line' })]));
      const result = await logsFilter(
        { logGroup: LOG_GROUP, format: 'json' },
        runner,
      );
      expect(result.isError).toBeFalsy();
      const body = parseJson(result) as {
        events: { message: string }[];
        truncated: boolean;
      };
      expect(body.events).toHaveLength(1);
      expect(body.events[0].message).toBe('log line');
      expect(body.truncated).toBe(false);
    });

    it('handles leading-slash log group names without mangling', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValue(makeAwsOutput([]));
      await logsFilter({ logGroup: LOG_GROUP, format: 'json' }, runner);
      const call = jest.mocked(runner).mock.calls[0];
      const args = call[1];
      const lgIdx = args.indexOf('--log-group-name');
      expect(args[lgIdx + 1]).toBe(LOG_GROUP);
    });

    it('passes filterPattern to the CLI when provided', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValue(makeAwsOutput([]));
      await logsFilter(
        { logGroup: LOG_GROUP, filterPattern: 'ERROR', format: 'json' },
        runner,
      );
      const args = jest.mocked(runner).mock.calls[0][1];
      expect(args).toContain('--filter-pattern');
      expect(args[args.indexOf('--filter-pattern') + 1]).toBe('ERROR');
    });

    it('passes startTime and endTime when provided', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValue(makeAwsOutput([]));
      await logsFilter(
        {
          logGroup: LOG_GROUP,
          startTime: 1_700_000_000_000,
          endTime: 1_700_003_600_000,
          format: 'json',
        },
        runner,
      );
      const args = jest.mocked(runner).mock.calls[0][1];
      expect(args).toContain('--start-time');
      expect(args[args.indexOf('--start-time') + 1]).toBe('1700000000000');
      expect(args).toContain('--end-time');
    });

    it('caps limit at MAX_EVENTS even if caller requests more', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValue(makeAwsOutput([]));
      await logsFilter(
        { logGroup: LOG_GROUP, limit: 9999, format: 'json' },
        runner,
      );
      const args = jest.mocked(runner).mock.calls[0][1];
      const limitIdx = args.indexOf('--limit');
      expect(Number(args[limitIdx + 1])).toBe(MAX_EVENTS);
    });

    it('sets truncated:true when event count equals the limit', async () => {
      const events = Array.from({ length: MAX_EVENTS }, (_, i) =>
        makeEvent({ message: `line ${i}` }),
      );
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValue(makeAwsOutput(events));
      const result = await logsFilter(
        { logGroup: LOG_GROUP, format: 'json' },
        runner,
      );
      const body = parseJson(result) as { truncated: boolean };
      expect(body.truncated).toBe(true);
    });

    it('sets truncated:true when char budget is exceeded', async () => {
      const longMessage = 'x'.repeat(MAX_CHARS + 1);
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValue(
          makeAwsOutput([makeEvent({ message: longMessage })]),
        );
      const result = await logsFilter(
        { logGroup: LOG_GROUP, format: 'json' },
        runner,
      );
      const body = parseJson(result) as { truncated: boolean; count: number };
      expect(body.truncated).toBe(true);
      expect(body.count).toBe(0);
    });

    it('handles emoji in log messages without error', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValue(
          makeAwsOutput([makeEvent({ message: '🔄 processing ❌ failed' })]),
        );
      const result = await logsFilter(
        { logGroup: LOG_GROUP, format: 'json' },
        runner,
      );
      const body = parseJson(result) as { events: { message: string }[] };
      expect(body.events[0].message).toBe('🔄 processing ❌ failed');
    });

    it('returns empty events when AWS output is empty string', async () => {
      const runner: CommandRunner = jest.fn().mockResolvedValue('');
      const result = await logsFilter(
        { logGroup: LOG_GROUP, format: 'json' },
        runner,
      );
      const body = parseJson(result) as { count: number; truncated: boolean };
      expect(body.count).toBe(0);
      expect(body.truncated).toBe(false);
    });

    it('renders markdown format with header and code block', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValue(
          makeAwsOutput([makeEvent({ message: 'log line\n' })]),
        );
      const result = await logsFilter({ logGroup: LOG_GROUP }, runner);
      const text = rawText(result);
      expect(text).toContain('**logGroup**');
      expect(text).toContain(LOG_GROUP);
      expect(text).toContain('```');
      expect(text).toContain('log line');
    });
  });

  describe('logStreamNames', () => {
    it('passes each stream name as its own argv entry', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValue(makeAwsOutput([]));
      await logsFilter(
        {
          logGroup: '/github-runners/legacy-sports-dev-runner/syslog',
          logStreamNames: ['i-0f4049f842a966c2d', 'i-0abc1234def56789a'],
          format: 'json',
        },
        runner,
      );
      const args = jest.mocked(runner).mock.calls[0][1];
      const idx = args.indexOf('--log-stream-names');
      expect(args.slice(idx + 1, idx + 3)).toEqual([
        'i-0f4049f842a966c2d',
        'i-0abc1234def56789a',
      ]);
      // Leading-slash group name reaches the CLI byte-for-byte.
      expect(args[args.indexOf('--log-group-name') + 1]).toBe(
        '/github-runners/legacy-sports-dev-runner/syslog',
      );
    });

    it('omits --log-stream-names when not provided', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValue(makeAwsOutput([]));
      await logsFilter({ logGroup: LOG_GROUP, format: 'json' }, runner);
      expect(jest.mocked(runner).mock.calls[0][1]).not.toContain(
        '--log-stream-names',
      );
    });
  });

  describe('listGroups', () => {
    const groupsOutput = JSON.stringify({
      logGroups: [
        {
          logGroupName: '/github-runners/legacy-sports-dev-runner/syslog',
          retentionInDays: 7,
          storedBytes: 1234,
        },
        { logGroupName: '/github-runners/legacy-sports-dev-runner/cloud-init' },
      ],
    });

    it('lists log groups by prefix instead of searching events', async () => {
      const runner: CommandRunner = jest.fn().mockResolvedValue(groupsOutput);
      const result = await logsFilter(
        { listGroups: '/github-runners/', format: 'json' },
        runner,
      );
      expect(result.isError).toBeFalsy();
      const args = jest.mocked(runner).mock.calls[0][1];
      expect(args).toContain('describe-log-groups');
      expect(args).not.toContain('filter-log-events');
      expect(args[args.indexOf('--log-group-name-prefix') + 1]).toBe(
        '/github-runners/',
      );
      const body = parseJson(result) as {
        logGroups: { name: string; retentionInDays: number | null }[];
        count: number;
        truncated: boolean;
      };
      expect(body.count).toBe(2);
      expect(body.truncated).toBe(false);
      expect(body.logGroups[0]).toEqual({
        name: '/github-runners/legacy-sports-dev-runner/syslog',
        retentionInDays: 7,
        storedBytes: 1234,
      });
      expect(body.logGroups[1].retentionInDays).toBeNull();
    });

    it('reports truncated:true when AWS returns a nextToken', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockResolvedValue(JSON.stringify({ logGroups: [], nextToken: 't' }));
      const result = await logsFilter(
        { listGroups: '/aws/', format: 'json' },
        runner,
      );
      expect((parseJson(result) as { truncated: boolean }).truncated).toBe(
        true,
      );
    });

    it('renders group names in markdown', async () => {
      const runner: CommandRunner = jest.fn().mockResolvedValue(groupsOutput);
      const text = rawText(
        await logsFilter({ listGroups: '/github-runners/' }, runner),
      );
      expect(text).toContain('**prefix**: /github-runners/');
      expect(text).toContain(
        '- /github-runners/legacy-sports-dev-runner/syslog',
      );
    });

    it('returns isError:true when describe-log-groups fails', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockRejectedValue(new Error('AccessDeniedException'));
      const result = await logsFilter(
        { listGroups: '/github-runners/', format: 'json' },
        runner,
      );
      expect(result.isError).toBe(true);
    });
  });

  describe('errors', () => {
    it('rejects a call with neither logGroup nor listGroups', async () => {
      const runner: CommandRunner = jest.fn();
      const result = await logsFilter({ format: 'json' }, runner);
      expect(result.isError).toBe(true);
      expect(runner).not.toHaveBeenCalled();
      expect((parseJson(result) as { error: string }).error).toMatch(
        /logGroup.*listGroups/,
      );
    });

    it('returns isError:true and remedy for SSO expiry', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockRejectedValue(new Error('sso session has expired'));
      const result = await logsFilter(
        { logGroup: LOG_GROUP, format: 'json' },
        runner,
      );
      expect(result.isError).toBe(true);
      const body = parseJson(result) as { remedy: string };
      expect(body.remedy).toMatch(/aws sso login/);
    });

    it('returns isError:true for generic AWS errors', async () => {
      const runner: CommandRunner = jest
        .fn()
        .mockRejectedValue(new Error('ResourceNotFoundException'));
      const result = await logsFilter(
        { logGroup: LOG_GROUP, format: 'json' },
        runner,
      );
      expect(result.isError).toBe(true);
    });
  });
});
