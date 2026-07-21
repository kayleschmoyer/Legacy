import {
  listFnJobs,
  runWithSyncBudget,
  snapshotFnJob,
  startFnJob,
  waitForFnJob,
  withCheckoutLock,
} from './jobs';
import { jobList, jobStatus, jobWait } from './tools/job-tools';

function okResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

describe('runWithSyncBudget', () => {
  it('returns the terminal result inline when the fn finishes within budget', async () => {
    const result = await runWithSyncBudget('fast', async () =>
      okResult('done'),
    );
    expect(result.content[0].text).toBe('done');
    expect(result.isError).toBeUndefined();
  });

  it('returns a running snapshot with jobId when the budget expires first', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const result = await runWithSyncBudget(
      'slow',
      async (log) => {
        log('working on it');
        await gate;
        return okResult('finished');
      },
      25,
    );

    const body = JSON.parse(result.content[0].text) as {
      jobId: string;
      status: string;
      label: string;
      logTail: string;
      hint: string;
    };
    expect(body.status).toBe('running');
    expect(body.jobId).toMatch(/^gh-/);
    expect(body.label).toBe('slow');
    expect(body.logTail).toContain('working on it');
    expect(body.hint).toContain('github_job_wait');

    release();
    const final = await waitForFnJob(body.jobId);
    expect(final?.content[0].text).toBe('finished');
  });

  it('converts a thrown error into an isError terminal result', async () => {
    const result = await runWithSyncBudget('boom', async () => {
      throw new Error('exploded');
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text) as { error: string };
    expect(body.error).toBe('exploded');
  });
});

describe('job tools', () => {
  it('returns notFound for unknown job ids', async () => {
    expect(snapshotFnJob('gh-nope')).toBeNull();

    const status = await jobStatus({ jobId: 'gh-nope' });
    expect(status.isError).toBe(true);
    expect(status.content[0].text).toContain('not found');

    const waited = await jobWait({ jobId: 'gh-nope' });
    expect(waited.isError).toBe(true);
  });

  it('jobStatus is non-blocking and jobWait returns the terminal result', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const jobId = startFnJob('gated', async () => {
      await gate;
      return okResult('after-gate');
    });

    const running = await jobStatus({ jobId });
    const runningBody = JSON.parse(running.content[0].text) as {
      status: string;
    };
    expect(runningBody.status).toBe('running');

    release();
    const done = await jobWait({ jobId });
    expect(done.content[0].text).toBe('after-gate');
  });

  it('jobList reports recent jobs with their status', async () => {
    const jobId = startFnJob('listed', async () => okResult('x'));
    await waitForFnJob(jobId);

    const result = jobList();
    const { jobs } = JSON.parse(result.content[0].text) as {
      jobs: Array<{ jobId: string; status: string }>;
    };
    expect(jobs.some((j) => j.jobId === jobId && j.status === 'done')).toBe(
      true,
    );
  });

  it('listFnJobs marks unfinished jobs as running', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const jobId = startFnJob('still-going', async () => {
      await gate;
      return okResult('y');
    });

    expect(listFnJobs().find((j) => j.jobId === jobId)?.status).toBe('running');

    release();
    await waitForFnJob(jobId);
  });
});

describe('withCheckoutLock', () => {
  it('serializes concurrent callers', async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withCheckoutLock(async () => {
      order.push('first-start');
      await firstGate;
      order.push('first-end');
    });
    const second = withCheckoutLock(async () => {
      order.push('second');
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(order).toEqual(['first-start']);

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });

  it('continues past a rejected task', async () => {
    await expect(
      withCheckoutLock(async () => {
        throw new Error('bad');
      }),
    ).rejects.toThrow('bad');
    await expect(withCheckoutLock(async () => 'ok')).resolves.toBe('ok');
  });
});
