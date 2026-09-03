jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { variableDelete } from './variable-delete';
import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

describe('variableDelete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
  });

  it('deletes the variable via the REST API', async () => {
    mockedRest.mockResolvedValueOnce(undefined);

    const text = (await variableDelete({ name: 'FOO' })).content[0].text;
    expect(JSON.parse(text)).toEqual({
      success: true,
      name: 'FOO',
      message: 'Variable "FOO" deleted',
    });
    expect(mockedRest).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/repos/o/r/actions/variables/FOO',
    });
  });

  it('returns an error result when the delete call fails', async () => {
    mockedRest.mockRejectedValueOnce(new Error('boom'));

    const result = await variableDelete({ name: 'FOO' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to delete variable "FOO"');
  });
});
