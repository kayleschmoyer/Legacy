jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';
import { listLabels } from './list-labels';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

function label(name: string, description: string | null = null) {
  return {
    id: 1,
    name,
    color: 'ff0000',
    description,
    default: false,
    url: `https://github.com/o/r/labels/${name}`,
  };
}

describe('listLabels (LS-8021 token-efficient output)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
  });

  it('renders a compact Markdown table with pruned columns', async () => {
    mockedRest.mockResolvedValueOnce([label('bug', 'A defect')] as never);

    const text = (await listLabels({})).content[0].text;
    expect(text).toContain('name|color|description|default');
    expect(text).toContain('bug|ff0000|A defect|false');
    expect(text).toContain('_total: 1_');
    // Pruned: internal id and url are not surfaced.
    expect(text).not.toContain('labels/bug');
    expect(text).not.toContain('"id"');
  });

  it('filters by search and emits an explicit empty signal', async () => {
    mockedRest.mockResolvedValueOnce([label('bug'), label('feature')] as never);

    const text = (await listLabels({ search: 'nomatch' })).content[0].text;
    expect(text).toBe('No labels found.');
  });
});
