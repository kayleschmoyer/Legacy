jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';
import { editPR } from './edit-pr';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

beforeEach(() => {
  mockedRepo.mockResolvedValue({ owner: 'org', name: 'repo' });
});

afterEach(() => jest.resetAllMocks());

const LARGE_BODY = 'B'.repeat(60_000);

describe('editPR — compact response', () => {
  it('returns only updated fields, not full body, on title-only edit', async () => {
    mockedRest.mockResolvedValue({
      number: 42,
      title: 'New title',
      body: LARGE_BODY,
      html_url: 'https://github.com/o/r/pull/42',
    });
    const result = await editPR({ number: 42, title: 'New title' });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.number).toBe(42);
    expect(parsed.updatedFields).toHaveProperty('title', 'New title');
    expect(parsed.updatedFields).not.toHaveProperty('body');
    // Full body must NOT appear at top level
    expect(parsed).not.toHaveProperty('body');
    // Response should be small
    expect(result.content[0].text.length).toBeLessThan(200);
  });

  it('includes body in updatedFields only when body was edited', async () => {
    mockedRest.mockResolvedValue({
      number: 42,
      title: 'Title',
      body: 'short body',
      html_url: 'https://github.com/o/r/pull/42',
    });
    const result = await editPR({ number: 42, body: 'short body' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.updatedFields).toHaveProperty('body', 'short body');
    expect(parsed.updatedFields).not.toHaveProperty('title');
  });

  it('returns error when neither title nor body is provided', async () => {
    const result = await editPR({ number: 42 });
    expect(result.isError).toBe(true);
  });
});
