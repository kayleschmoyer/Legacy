jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

jest.mock('node:fs/promises', () => ({
  access: jest.fn(),
}));

import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { terraformOutput } from './terraform-output.js';
import { runCommand } from '../run-command.js';

const mockedRun = runCommand as jest.MockedFunction<typeof runCommand>;
const mockedAccess = access as jest.MockedFunction<typeof access>;

function body(result: Awaited<ReturnType<typeof terraformOutput>>): {
  text: string;
  parsed: Record<string, unknown>;
  isError: boolean;
} {
  const block = result.content[0];
  if (!block || block.type !== 'text') throw new Error('expected text block');
  return {
    text: block.text,
    parsed: JSON.parse(block.text) as Record<string, unknown>,
    isError: Boolean(result.isError),
  };
}

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  mockedRun.mockReset();
  mockedAccess.mockReset();
  // Default: `.terraform/` exists, i.e. the resolved chdir is initialized.
  // Fallback-specific tests override this to simulate a worktree checkout.
  mockedAccess.mockResolvedValue(undefined);
  process.env = { ...ORIGINAL_ENV };
  delete process.env.MAIN_REPO_PATH;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('terraformOutput worktree fallback', () => {
  const notInitialized = () =>
    mockedAccess.mockRejectedValueOnce(new Error('ENOENT'));

  it('falls back to the main checkout (via git worktree list) when the worktree backend is not initialized', async () => {
    notInitialized();
    mockedRun
      .mockResolvedValueOnce(
        'worktree /main-repo\nHEAD abc\n\nworktree /repo\nbranch refs/heads/foo\n',
      ) // git worktree list — main checkout listed first
      .mockResolvedValueOnce(
        JSON.stringify({ vpc_id: { value: 'vpc-main', type: 'string' } }),
      ); // terraform output in the main checkout

    const { parsed, isError } = body(await terraformOutput({}));

    expect(isError).toBe(false);
    expect(parsed).toEqual({ vpc_id: 'vpc-main' });
    expect(mockedRun).toHaveBeenNthCalledWith(
      1,
      'git',
      ['worktree', 'list', '--porcelain'],
      '/repo',
    );
    expect(mockedRun).toHaveBeenNthCalledWith(
      2,
      'terraform',
      ['output', '-json'],
      resolveExpected('/main-repo', 'terraform/main'),
    );
  });

  it('uses MAIN_REPO_PATH instead of shelling out to git when set', async () => {
    process.env.MAIN_REPO_PATH = '/main-checkout';
    notInitialized();
    mockedRun.mockResolvedValueOnce(
      JSON.stringify({ vpc_id: { value: 'vpc-main', type: 'string' } }),
    );

    const { parsed, isError } = body(await terraformOutput({}));

    expect(isError).toBe(false);
    expect(parsed).toEqual({ vpc_id: 'vpc-main' });
    expect(mockedRun).toHaveBeenCalledTimes(1);
    expect(mockedRun).toHaveBeenNthCalledWith(
      1,
      'terraform',
      ['output', '-json'],
      resolveExpected('/main-checkout', 'terraform/main'),
    );
  });

  it('skips the fallback when the resolved main root is the same as the worktree repo root', async () => {
    notInitialized();
    mockedRun.mockResolvedValueOnce('worktree /repo\nHEAD abc\n');

    const { parsed, isError } = body(await terraformOutput({}));

    expect(isError).toBe(true);
    expect(parsed.ok).toBe(false);
    expect(String(parsed.error)).toMatch(/not terraform-initialized/);
    expect(mockedRun).toHaveBeenCalledTimes(1);
  });

  it('reports both errors when the main checkout fallback also fails', async () => {
    notInitialized();
    mockedRun
      .mockResolvedValueOnce(
        'worktree /main-repo\nHEAD abc\n\nworktree /repo\nbranch refs/heads/foo\n',
      )
      .mockRejectedValueOnce(new Error('Backend initialization required'));

    const { parsed, isError } = body(await terraformOutput({}));

    expect(isError).toBe(true);
    expect(parsed.ok).toBe(false);
    expect(parsed.chdir).toBe(resolveExpected('/repo', 'terraform/main'));
    expect(String(parsed.error)).toMatch(/not terraform-initialized/);
    expect(String(parsed.error)).toMatch(/fallback.*also failed/);
    expect(String(parsed.remedy)).toMatch(/terraform init/);
  });

  it('does not fall back on errors unrelated to backend initialization (e.g. SSO expiry) when the dir is initialized', async () => {
    mockedRun.mockRejectedValueOnce(new Error('The SSO session has expired.'));

    const { parsed, isError } = body(await terraformOutput({}));

    expect(isError).toBe(true);
    expect(mockedRun).toHaveBeenCalledTimes(1);
    expect(String(parsed.remedy)).toMatch(/aws sso login/);
  });
});

function resolveExpected(root: string, chdir: string): string {
  return resolve(join(root, chdir));
}

describe('terraformOutput key validation', () => {
  it('rejects an output name with shell metacharacters without invoking the CLI', async () => {
    const { parsed, isError } = body(
      await terraformOutput({ keys: ['vpc_id; rm -rf /'] }),
    );
    expect(isError).toBe(true);
    expect(parsed.ok).toBe(false);
    expect(String(parsed.error)).toMatch(/Invalid output name/);
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it('returns a minified bare outputs map for valid keys', async () => {
    mockedRun.mockResolvedValue(
      JSON.stringify({
        vpc_id: { value: 'vpc-123', type: 'string' },
        rds_endpoint: { value: 'db.example.com', type: 'string' },
      }),
    );
    const { text, parsed, isError } = body(
      await terraformOutput({ keys: ['vpc_id'] }),
    );
    expect(isError).toBe(false);
    expect(text).not.toContain('\n');
    expect(parsed).toEqual({ vpc_id: 'vpc-123' });
  });
});
