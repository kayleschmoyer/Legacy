jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { prTimeline } from './pr-timeline';
import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

function reviewRequested(login: string, createdAt: string) {
  return {
    event: 'review_requested',
    created_at: createdAt,
    actor: { login: 'author' },
    requested_reviewer: { login },
  };
}

function reviewRequestedTeam(teamName: string, createdAt: string) {
  return {
    event: 'review_requested',
    created_at: createdAt,
    actor: { login: 'author' },
    requested_team: { name: teamName },
  };
}

function labeled(labelName: string, createdAt: string) {
  return {
    event: 'labeled',
    created_at: createdAt,
    actor: { login: 'bot' },
    label: { name: labelName },
  };
}

function committed(createdAt: string) {
  return { event: 'committed', created_at: createdAt };
}

describe('prTimeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
  });

  it('defaults to the review-request/label subset, dropping other events', async () => {
    mockedRest.mockResolvedValueOnce([
      reviewRequested('alice', '2026-01-01T00:00:00Z'),
      committed('2026-01-01T00:05:00Z'),
    ] as never);

    const text = (await prTimeline({ number: 5 })).content[0].text;
    expect(text).toContain(
      'review_requested|2026-01-01T00:00:00Z|author|alice|',
    );
    expect(text).not.toContain('committed');
  });

  it('resolves a user reviewer login', async () => {
    mockedRest.mockResolvedValueOnce([
      reviewRequested('alice', '2026-01-01T00:00:00Z'),
    ] as never);

    const text = (await prTimeline({ number: 5, events: ['review_requested'] }))
      .content[0].text;
    expect(text).toContain('alice');
  });

  it('resolves a team reviewer as "team:<name>"', async () => {
    mockedRest.mockResolvedValueOnce([
      reviewRequestedTeam('backend-owners', '2026-01-02T00:00:00Z'),
    ] as never);

    const text = (await prTimeline({ number: 5, events: ['review_requested'] }))
      .content[0].text;
    expect(text).toContain('team:backend-owners');
  });

  it('filters to only the requested event types', async () => {
    mockedRest.mockResolvedValueOnce([
      reviewRequested('alice', '2026-01-01T00:00:00Z'),
      labeled('bot:ready-for-review', '2026-01-01T01:00:00Z'),
    ] as never);

    const text = (await prTimeline({ number: 5, events: ['labeled'] }))
      .content[0].text;
    expect(text).toContain('bot:ready-for-review');
    expect(text).not.toContain('alice');
  });

  it('paginates fully across multiple pages', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      reviewRequested(
        `user${i}`,
        `2026-01-01T00:${String(i).padStart(2, '0')}:00Z`,
      ),
    );
    const page2 = [reviewRequested('final-user', '2026-01-01T02:00:00Z')];
    mockedRest.mockResolvedValueOnce(page1);
    mockedRest.mockResolvedValueOnce(page2);

    const text = (
      await prTimeline({
        number: 5,
        events: ['review_requested'],
        limit: 500,
      })
    ).content[0].text;

    expect(mockedRest).toHaveBeenCalledTimes(2);
    expect(text).toContain('total: 101');
    expect(text).toContain('final-user');
  });

  it('applies the limit and reports hasMore', async () => {
    mockedRest.mockResolvedValueOnce([
      reviewRequested('alice', '2026-01-01T00:00:00Z'),
      reviewRequested('bob', '2026-01-01T01:00:00Z'),
    ] as never);

    const text = (
      await prTimeline({ number: 5, events: ['review_requested'], limit: 1 })
    ).content[0].text;
    expect(text).toContain('returned: 1');
    expect(text).toContain('hasMore: true');
    expect(text).not.toContain('bob');
  });

  it('emits an explicit signal when there are no matching events', async () => {
    mockedRest.mockResolvedValueOnce([] as never);

    const text = (await prTimeline({ number: 5 })).content[0].text;
    expect(text).toBe('No matching timeline events found for PR #5.');
  });

  it('reports an error result when the API call fails', async () => {
    mockedRest.mockRejectedValueOnce(new Error('boom'));

    const result = await prTimeline({ number: 5 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'Failed to get timeline for PR #5',
    );
    expect(result.content[0].text).toContain('boom');
  });

  it('maps committed events from their git author/committer identities', async () => {
    mockedRest.mockResolvedValueOnce([
      {
        event: 'committed',
        sha: 'abc',
        author: { name: 'Jane Dev', date: '2026-01-01T00:00:00Z' },
        committer: { name: 'GitHub', date: '2026-01-02T00:00:00Z' },
      },
    ] as never);

    const text = (await prTimeline({ number: 5, events: ['committed'] }))
      .content[0].text;
    expect(text).toContain('committed|2026-01-02T00:00:00Z|Jane Dev||');
  });
});
