jest.mock('../run-command.js', () => ({
  getRepoRoot: () => '/repo',
  runCommand: jest.fn(),
}));

import { syncSecretToGithub, type SyncSecretDeps } from './sync-to-github.js';

function unwrap(result: Awaited<ReturnType<typeof syncSecretToGithub>>): {
  body: Record<string, unknown>;
  isError: boolean;
} {
  const block = result.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Expected a text content block');
  }
  return {
    body: JSON.parse(block.text) as Record<string, unknown>,
    isError: Boolean(result.isError),
  };
}

function makeDeps(overrides: Partial<SyncSecretDeps> = {}): {
  deps: SyncSecretDeps;
  fetchAwsSecret: jest.Mock;
  writeGithubSecret: jest.Mock;
  audit: jest.Mock;
} {
  const fetchAwsSecret = jest.fn().mockResolvedValue('s3cr3t-value');
  const writeGithubSecret = jest.fn().mockResolvedValue(null);
  const audit = jest.fn();
  return {
    deps: { fetchAwsSecret, writeGithubSecret, audit, ...overrides },
    fetchAwsSecret,
    writeGithubSecret,
    audit,
  };
}

describe('syncSecretToGithub — input validation', () => {
  it('rejects an invalid secretId (colon/ARN)', async () => {
    const { deps, fetchAwsSecret } = makeDeps();
    const { body, isError } = unwrap(
      await syncSecretToGithub(
        {
          secretId: 'arn:aws:secretsmanager:us-east-1:1:secret:foo',
          repoSecret: 'MY_SECRET',
        },
        deps,
      ),
    );
    expect(isError).toBe(true);
    expect(body.error).toMatch(/Invalid secretId/);
    expect(fetchAwsSecret).not.toHaveBeenCalled();
  });

  it('rejects an invalid repoSecret (dashes)', async () => {
    const { deps } = makeDeps();
    const { body, isError } = unwrap(
      await syncSecretToGithub(
        { secretId: 'my-key', repoSecret: 'my-secret' },
        deps,
      ),
    );
    expect(isError).toBe(true);
    expect(body.error).toMatch(/Invalid repoSecret/);
  });

  it('rejects repoSecret names starting with GITHUB_', async () => {
    const { deps } = makeDeps();
    const { body, isError } = unwrap(
      await syncSecretToGithub(
        { secretId: 'my-key', repoSecret: 'GITHUB_TOKEN' },
        deps,
      ),
    );
    expect(isError).toBe(true);
    expect(body.error).toMatch(/GITHUB_/);
  });

  it('rejects scope="environment" without env', async () => {
    const { deps, writeGithubSecret } = makeDeps();
    const { body, isError } = unwrap(
      await syncSecretToGithub(
        { secretId: 'my-key', repoSecret: 'MY_SECRET', scope: 'environment' },
        deps,
      ),
    );
    expect(isError).toBe(true);
    expect(body.error).toMatch(/requires the "env" parameter/);
    expect(writeGithubSecret).not.toHaveBeenCalled();
  });

  it('rejects an invalid repo string', async () => {
    const { deps } = makeDeps();
    const { body, isError } = unwrap(
      await syncSecretToGithub(
        {
          secretId: 'my-key',
          repoSecret: 'MY_SECRET',
          repo: 'no slash',
        },
        deps,
      ),
    );
    expect(isError).toBe(true);
    expect(body.error).toMatch(/Invalid repo/);
  });
});

describe('syncSecretToGithub — gh CLI args by scope', () => {
  it('repo scope (default): bare `gh secret set NAME`', async () => {
    const { deps, writeGithubSecret, audit } = makeDeps();
    const { body, isError } = unwrap(
      await syncSecretToGithub(
        { secretId: 'mlb-data-api-key', repoSecret: 'MLB_API_KEY' },
        deps,
      ),
    );
    expect(isError).toBe(false);
    expect(body).toMatchObject({
      ok: true,
      synced: true,
      secretId: 'dev/mlb-data-api-key',
      repoSecret: 'MLB_API_KEY',
      scope: 'repo',
    });
    expect(writeGithubSecret).toHaveBeenCalledWith(
      ['secret', 'set', 'MLB_API_KEY'],
      's3cr3t-value',
    );
    expect(audit).toHaveBeenCalledWith(
      'synced dev/mlb-data-api-key → MLB_API_KEY',
    );
  });

  it('dependabot scope: adds --app dependabot', async () => {
    const { deps, writeGithubSecret, audit } = makeDeps();
    await syncSecretToGithub(
      {
        secretId: 'npm-publish-token',
        repoSecret: 'NPM_TOKEN',
        scope: 'dependabot',
      },
      deps,
    );
    expect(writeGithubSecret).toHaveBeenCalledWith(
      ['secret', 'set', 'NPM_TOKEN', '--app', 'dependabot'],
      's3cr3t-value',
    );
    expect(audit).toHaveBeenCalledWith(
      'synced dev/npm-publish-token → NPM_TOKEN (dependabot)',
    );
  });

  it('environment scope: adds --env <env>', async () => {
    const { deps, writeGithubSecret, audit } = makeDeps();
    await syncSecretToGithub(
      {
        secretId: 'prod/stripe-api-key',
        repoSecret: 'STRIPE_KEY',
        scope: 'environment',
        env: 'production',
      },
      deps,
    );
    expect(writeGithubSecret).toHaveBeenCalledWith(
      ['secret', 'set', 'STRIPE_KEY', '--env', 'production'],
      's3cr3t-value',
    );
    expect(audit).toHaveBeenCalledWith(
      'synced prod/stripe-api-key → STRIPE_KEY (env=production)',
    );
  });

  it('passes through --repo when supplied', async () => {
    const { deps, writeGithubSecret } = makeDeps();
    await syncSecretToGithub(
      {
        secretId: 'my-key',
        repoSecret: 'MY_SECRET',
        repo: 'bkrupa/legacy-sports',
      },
      deps,
    );
    expect(writeGithubSecret).toHaveBeenCalledWith(
      ['secret', 'set', 'MY_SECRET', '--repo', 'bkrupa/legacy-sports'],
      's3cr3t-value',
    );
  });

  it('expands short secretIds with the environment prefix', async () => {
    const { deps, fetchAwsSecret } = makeDeps();
    await syncSecretToGithub(
      { secretId: 'my-key', repoSecret: 'MY_SECRET', environment: 'prod' },
      deps,
    );
    expect(fetchAwsSecret).toHaveBeenCalledWith('prod/my-key');
  });

  it('does not expand secretIds that already contain a slash', async () => {
    const { deps, fetchAwsSecret } = makeDeps();
    await syncSecretToGithub(
      { secretId: 'staging/my-key', repoSecret: 'MY_SECRET' },
      deps,
    );
    expect(fetchAwsSecret).toHaveBeenCalledWith('staging/my-key');
  });
});

describe('syncSecretToGithub — never leaks the secret value', () => {
  it('the secret value appears in NEITHER the response body NOR the audit log', async () => {
    const { deps, audit } = makeDeps({
      fetchAwsSecret: jest.fn().mockResolvedValue('TOP-SECRET-VALUE-XYZ'),
    });
    const result = await syncSecretToGithub(
      { secretId: 'my-key', repoSecret: 'MY_SECRET' },
      deps,
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('TOP-SECRET-VALUE-XYZ');
    for (const call of audit.mock.calls) {
      expect(call[0] as string).not.toContain('TOP-SECRET-VALUE-XYZ');
    }
  });
});

describe('syncSecretToGithub — error handling', () => {
  it('surfaces AWS fetch failures with an SSO remedy when expired', async () => {
    const { deps, writeGithubSecret } = makeDeps({
      fetchAwsSecret: jest
        .fn()
        .mockRejectedValue(new Error('sso session has expired')),
    });
    const { body, isError } = unwrap(
      await syncSecretToGithub(
        { secretId: 'my-key', repoSecret: 'MY_SECRET' },
        deps,
      ),
    );
    expect(isError).toBe(true);
    expect(body.error).toMatch(/Failed to fetch AWS secret/);
    expect(body.remedy).toMatch(/aws sso login/);
    expect(writeGithubSecret).not.toHaveBeenCalled();
  });

  it('surfaces gh secret set failures cleanly', async () => {
    const { deps, audit } = makeDeps({
      writeGithubSecret: jest
        .fn()
        .mockResolvedValue('HTTP 404: repository not found'),
    });
    const { body, isError } = unwrap(
      await syncSecretToGithub(
        { secretId: 'my-key', repoSecret: 'MY_SECRET' },
        deps,
      ),
    );
    expect(isError).toBe(true);
    expect(body.error).toMatch(/Failed to set GitHub secret/);
    expect(body.error).toMatch(/404/);
    // Audit log must NOT record the (failed) sync.
    expect(audit).not.toHaveBeenCalled();
  });
});
