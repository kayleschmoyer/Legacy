jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { createLabel } from './create-label';
import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

function textOf(result: Awaited<ReturnType<typeof createLabel>>): string {
  return (result.content[0] as { text: string }).text;
}

describe('createLabel (LS-9891)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'acme', name: 'repo' });
  });

  it('creates a label that does not yet exist', async () => {
    mockedRest.mockResolvedValueOnce({
      name: 'bug',
      color: 'ff0000',
      description: 'Something is broken',
    });

    const result = await createLabel({
      name: 'bug',
      color: 'ff0000',
      description: 'Something is broken',
    });

    expect(mockedRest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
    );
    expect(textOf(result)).toContain('"created":true');
  });

  it('rejects a description over 100 characters before hitting the API', async () => {
    const result = await createLabel({
      name: 'bug',
      description: 'x'.repeat(101),
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('exceeds');
    expect(mockedRest).not.toHaveBeenCalled();
  });

  it('PATCHes an existing label when color/description differ', async () => {
    mockedRest
      .mockRejectedValueOnce(
        new Error(
          'request failed (422): {"errors":[{"code":"already_exists"}]}',
        ),
      )
      .mockResolvedValueOnce({
        name: 'bug',
        color: '000000',
        description: 'Old description',
      })
      .mockResolvedValueOnce({
        name: 'bug',
        color: 'ff0000',
        description: 'New description',
      });

    const result = await createLabel({
      name: 'bug',
      color: 'ff0000',
      description: 'New description',
    });

    expect(mockedRest).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: 'PATCH',
        body: { color: 'ff0000', description: 'New description' },
      }),
    );
    expect(textOf(result)).toContain('"updated":true');
  });

  it('no-ops when the existing label already matches', async () => {
    mockedRest
      .mockRejectedValueOnce(
        new Error(
          'request failed (422): {"errors":[{"code":"already_exists"}]}',
        ),
      )
      .mockResolvedValueOnce({
        name: 'bug',
        color: 'ff0000',
        description: 'Something is broken',
      });

    const result = await createLabel({
      name: 'bug',
      color: 'ff0000',
      description: 'Something is broken',
    });

    expect(mockedRest).toHaveBeenCalledTimes(2);
    expect(textOf(result)).toContain('"updated":false');
  });
});
