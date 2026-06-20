jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';
import { listRunners } from './list-runners';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

describe('listRunners (LS-8021 token-efficient output)', () => {
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
    } as never);

    const text = (await listRunners({})).content[0].text;
    expect(text).toContain('id|name|os|status|busy|labels');
    expect(text).toContain('7|runner-1|linux|online|false|self-hosted,linux');
    expect(text).toContain('_totalCount: 1_');
    expect(text).not.toContain('"runners"');
  });

  it('emits an explicit signal when there are no runners', async () => {
    mockedRest.mockResolvedValueOnce({ total_count: 0, runners: [] } as never);

    const text = (await listRunners({})).content[0].text;
    expect(text).toBe('No runners found.');
  });
});
