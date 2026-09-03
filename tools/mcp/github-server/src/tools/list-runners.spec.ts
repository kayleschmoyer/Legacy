jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { listRunners, summarizeRunners } from './list-runners';
import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

const RUNNERS = [
  {
    id: 1,
    name: 'runner-1',
    os: 'linux',
    status: 'online',
    busy: true,
    labels: [{ name: 'ci-runner' }],
  },
  {
    id: 2,
    name: 'runner-2',
    os: 'linux',
    status: 'online',
    busy: false,
    labels: [{ name: 'ci-runner' }, { name: 'ci-runner-android' }],
  },
  {
    id: 3,
    name: 'runner-3',
    os: 'linux',
    status: 'offline',
    busy: false,
    labels: [{ name: 'ci-runner-android' }],
  },
];

describe('listRunners (LS-8021 token-efficient output, LS-9548 busy filter + summary)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
  });

  it('renders a compact Markdown table, one row per runner', async () => {
    mockedRest.mockResolvedValueOnce({
      total_count: 1,
      runners: [
        {
          id: 7,
          name: 'runner-1',
          os: 'linux',
          status: 'online',
          busy: false,
          labels: [{ name: 'self-hosted' }, { name: 'linux' }],
        },
      ],
    });

    const text = (await listRunners({})).content[0].text;
    expect(text).toContain('id|name|os|status|busy|labels');
    expect(text).toContain('7|runner-1|linux|online|false|self-hosted,linux');
    expect(text).not.toContain('"runners"');
  });

  it('emits an explicit signal when there are no runners', async () => {
    mockedRest.mockResolvedValueOnce({ total_count: 0, runners: [] });

    const text = (await listRunners({})).content[0].text;
    expect(text).toContain('No runners found.');
  });

  it('every response carries a summary, unfiltered', async () => {
    mockedRest.mockResolvedValueOnce({ total_count: 3, runners: RUNNERS });

    const text = (await listRunners({})).content[0].text;
    expect(text).toContain(
      '_summary: {"total":3,"online":2,"offline":1,"busy":1,"idle":2,"byLabel":',
    );
  });

  it('busy filter composes with status to return only idle online runners', async () => {
    mockedRest.mockResolvedValueOnce({ total_count: 3, runners: RUNNERS });

    const text = (await listRunners({ status: 'online', busy: false }))
      .content[0].text;
    expect(text).toContain('2|runner-2');
    expect(text).not.toContain('1|runner-1');
    expect(text).not.toContain('3|runner-3');
    // Overall pool size comes from summary.total — no separate totalCount
    // line duplicating it.
    expect(text).not.toContain('_totalCount');
    expect(text).toContain('"total":3');
  });

  it('summaryOnly returns just the counts, no row table', async () => {
    mockedRest.mockResolvedValueOnce({ total_count: 3, runners: RUNNERS });

    const text = (await listRunners({ summaryOnly: true })).content[0].text;
    expect(text).not.toContain('id|name|os');
    expect(text).toContain('_summary:');
    expect(text).toContain('"total":3');
  });
});

describe('summarizeRunners', () => {
  it('computes total/online/offline/busy/idle counts', () => {
    const summary = summarizeRunners(RUNNERS);
    expect(summary.total).toBe(3);
    expect(summary.online).toBe(2);
    expect(summary.offline).toBe(1);
    expect(summary.busy).toBe(1);
    expect(summary.idle).toBe(2);
  });

  it('groups counts per label — a runner with multiple labels counts in each', () => {
    const summary = summarizeRunners(RUNNERS);
    expect(summary.byLabel['ci-runner']).toEqual({
      total: 2,
      online: 2,
      offline: 0,
      busy: 1,
      idle: 1,
    });
    expect(summary.byLabel['ci-runner-android']).toEqual({
      total: 2,
      online: 1,
      offline: 1,
      busy: 0,
      idle: 2,
    });
  });

  it('returns zeroed counts and an empty byLabel map for an empty pool', () => {
    const summary = summarizeRunners([]);
    expect(summary).toEqual({
      total: 0,
      online: 0,
      offline: 0,
      busy: 0,
      idle: 0,
      byLabel: {},
    });
  });
});
