jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));
jest.mock('node:fs', () => ({ readFileSync: jest.fn() }));

import { readFileSync } from 'node:fs';
import { variableSet } from './variable-set';
import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockedReadFileSync = readFileSync as jest.MockedFunction<
  typeof readFileSync
>;

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

describe('variableSet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
  });

  it('creates the variable when it does not already exist', async () => {
    mockedRest
      .mockRejectedValueOnce(
        new Error(
          'GitHub API GET /repos/o/r/actions/variables/FOO failed (404): Not Found',
        ),
      ) // existence GET
      .mockResolvedValueOnce(undefined); // POST create

    const text = (await variableSet({ name: 'FOO', value: 'bar' })).content[0]
      .text;
    expect(JSON.parse(text)).toEqual({
      success: true,
      name: 'FOO',
      method: 'create',
      message: 'Variable "FOO" created',
    });
    expect(mockedRest).toHaveBeenNthCalledWith(2, {
      method: 'POST',
      path: '/repos/o/r/actions/variables',
      body: { name: 'FOO', value: 'bar' },
    });
  });

  it('updates the variable when it already exists', async () => {
    mockedRest
      .mockResolvedValueOnce({ name: 'FOO', value: 'old' }) // existence GET
      .mockResolvedValueOnce(undefined); // PATCH update

    const text = (await variableSet({ name: 'FOO', value: 'new' })).content[0]
      .text;
    expect(JSON.parse(text)).toEqual({
      success: true,
      name: 'FOO',
      method: 'update',
      message: 'Variable "FOO" updated',
    });
    expect(mockedRest).toHaveBeenNthCalledWith(2, {
      method: 'PATCH',
      path: '/repos/o/r/actions/variables/FOO',
      body: { name: 'FOO', value: 'new' },
    });
  });

  it('propagates a non-404 error from the existence check instead of treating it as missing', async () => {
    mockedRest.mockRejectedValueOnce(
      new Error(
        'GitHub API GET /repos/o/r/actions/variables/FOO failed (401): Bad credentials',
      ),
    );

    const result = await variableSet({ name: 'FOO', value: 'bar' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Bad credentials');
    expect(mockedRest).toHaveBeenCalledTimes(1);
  });

  it('returns an error result when the write call fails', async () => {
    mockedRest
      .mockRejectedValueOnce(
        new Error(
          'GitHub API GET /repos/o/r/actions/variables/FOO failed (404): Not Found',
        ),
      ) // existence GET
      .mockRejectedValueOnce(new Error('boom')); // POST create fails

    const result = await variableSet({ name: 'FOO', value: 'bar' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to set variable "FOO"');
  });

  it('reads the value from valueFile when provided', async () => {
    mockedReadFileSync.mockReturnValueOnce('from-file');
    mockedRest
      .mockRejectedValueOnce(
        new Error(
          'GitHub API GET /repos/o/r/actions/variables/FOO failed (404): Not Found',
        ),
      ) // existence GET
      .mockResolvedValueOnce(undefined); // POST create

    await variableSet({ name: 'FOO', valueFile: '/tmp/val.txt' });
    expect(mockedReadFileSync).toHaveBeenCalledWith('/tmp/val.txt', 'utf-8');
    expect(mockedRest).toHaveBeenNthCalledWith(2, {
      method: 'POST',
      path: '/repos/o/r/actions/variables',
      body: { name: 'FOO', value: 'from-file' },
    });
  });

  it('rejects when neither value nor valueFile is provided', async () => {
    const result = await variableSet({ name: 'FOO' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'Provide either "value" or "valueFile"',
    );
    expect(mockedRest).not.toHaveBeenCalled();
  });

  it('rejects when both value and valueFile are provided', async () => {
    const result = await variableSet({
      name: 'FOO',
      value: 'bar',
      valueFile: '/tmp/val.txt',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not both');
    expect(mockedRest).not.toHaveBeenCalled();
  });

  it('returns an error result when valueFile cannot be read', async () => {
    mockedReadFileSync.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });

    const result = await variableSet({ name: 'FOO', valueFile: '/missing' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Cannot read file "/missing"');
    expect(mockedRest).not.toHaveBeenCalled();
  });
});
