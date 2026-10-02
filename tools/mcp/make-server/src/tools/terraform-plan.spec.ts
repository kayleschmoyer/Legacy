import { describe, expect, it } from '@jest/globals';

import type { JobSnapshot } from '@legacy-sports/mcp-jobs';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  MAX_DETAIL_CHARS,
  MAX_DETAIL_VALUE_CHARS,
  needsBackendInit,
  parseTerraformPlanJson,
  RUNNER_LAMBDAS_REMEDY,
  runnerLambdaZipRemedy,
  SENSITIVE_PLACEHOLDER,
  terraformPlan,
  UNKNOWN_PLACEHOLDER,
} from './terraform-plan.js';

const BACKEND_INIT_LOG = `
Error: Backend initialization required, please run "terraform init"

Reason: Initial configuration of the requested backend "s3"
`;

const MISSING_ZIP_LOG = `
Error: Error in function call

  on .terraform/modules/github_runners/modules/runners/scale-up.tf line 30, in resource "aws_lambda_function" "scale_up":
  30:   source_code_hash = filebase64sha256(local.lambda_zip)

Call to function "filebase64sha256" failed: open lambdas/runners.zip: no such file or directory.

Error: Error in function call

  on .terraform/modules/github_runners/modules/webhook/webhook.tf line 12, in resource "aws_lambda_function" "webhook":
  12:   source_code_hash = filebase64sha256(local.lambda_zip)

Call to function "filebase64sha256" failed: open lambdas/webhook.zip: no such file or directory.
`;

function failedSnapshot(log: string): JobSnapshot {
  return {
    jobId: 'tfplan-test',
    status: 'failed',
    cwd: '/repo/terraform/runners',
    elapsedSec: 1,
    error: 'exit code 1',
    log,
  } as JobSnapshot;
}

function resultJson(result: { content: Array<{ text?: string }> }): {
  [key: string]: unknown;
} {
  return JSON.parse(result.content[0].text ?? '{}') as {
    [key: string]: unknown;
  };
}

function showJson(resourceChanges: unknown[]): string {
  return JSON.stringify({
    format_version: '1.2',
    terraform_version: '1.7.0',
    resource_changes: resourceChanges,
  });
}

describe('parseTerraformPlanJson', () => {
  it('classifies a create action into summary.add', () => {
    const { summary, resources } = parseTerraformPlanJson(
      showJson([
        {
          address: 'aws_lambda_function.new_fn',
          change: { actions: ['create'] },
        },
      ]),
    );
    expect(summary).toEqual({ add: 1, change: 0, destroy: 0 });
    expect(resources).toEqual([
      { address: 'aws_lambda_function.new_fn', action: 'create' },
    ]);
  });

  it('classifies an update action into summary.change', () => {
    const { summary, resources } = parseTerraformPlanJson(
      showJson([
        {
          address: 'aws_lambda_function.graphql',
          change: { actions: ['update'] },
        },
      ]),
    );
    expect(summary).toEqual({ add: 0, change: 1, destroy: 0 });
    expect(resources).toEqual([
      { address: 'aws_lambda_function.graphql', action: 'update' },
    ]);
  });

  it('classifies a delete action into summary.destroy', () => {
    const { summary, resources } = parseTerraformPlanJson(
      showJson([
        {
          address: 'aws_s3_bucket.old_assets',
          change: { actions: ['delete'] },
        },
      ]),
    );
    expect(summary).toEqual({ add: 0, change: 0, destroy: 1 });
    expect(resources).toEqual([
      { address: 'aws_s3_bucket.old_assets', action: 'delete' },
    ]);
  });

  it('classifies create+delete as a replace and counts it toward both add and destroy', () => {
    const { summary, resources } = parseTerraformPlanJson(
      showJson([
        {
          address: 'aws_lambda_function.graphql',
          change: {
            actions: ['delete', 'create'],
            replace_paths: [['runtime']],
          },
        },
      ]),
    );
    expect(summary).toEqual({ add: 1, change: 0, destroy: 1 });
    expect(resources).toEqual([
      {
        address: 'aws_lambda_function.graphql',
        action: 'replace',
        forcesReplacementOn: ['runtime'],
      },
    ]);
  });

  it('omits no-op and read-only resources from both summary and resources', () => {
    const { summary, resources } = parseTerraformPlanJson(
      showJson([
        { address: 'aws_iam_role.unchanged', change: { actions: ['no-op'] } },
        {
          address: 'data.aws_ami.base',
          change: { actions: ['read'] },
        },
      ]),
    );
    expect(summary).toEqual({ add: 0, change: 0, destroy: 0 });
    expect(resources).toEqual([]);
  });

  it('joins nested replace_paths segments with dots', () => {
    const { resources } = parseTerraformPlanJson(
      showJson([
        {
          address: 'aws_lambda_function.graphql',
          change: {
            actions: ['create', 'delete'],
            replace_paths: [['environment', 'variables', 'FOO']],
          },
        },
      ]),
    );
    expect(resources[0].forcesReplacementOn).toEqual([
      'environment.variables.FOO',
    ]);
  });

  it('handles multiple resources in one plan', () => {
    const { summary, resources } = parseTerraformPlanJson(
      showJson([
        { address: 'aws_lambda_function.a', change: { actions: ['create'] } },
        { address: 'aws_lambda_function.b', change: { actions: ['update'] } },
        { address: 'aws_lambda_function.c', change: { actions: ['delete'] } },
        { address: 'aws_lambda_function.d', change: { actions: ['no-op'] } },
      ]),
    );
    expect(summary).toEqual({ add: 1, change: 1, destroy: 1 });
    expect(resources.map((r) => r.address)).toEqual([
      'aws_lambda_function.a',
      'aws_lambda_function.b',
      'aws_lambda_function.c',
    ]);
  });

  it('returns empty summary/resources when resource_changes is absent', () => {
    const { summary, resources } = parseTerraformPlanJson(
      JSON.stringify({ format_version: '1.2' }),
    );
    expect(summary).toEqual({ add: 0, change: 0, destroy: 0 });
    expect(resources).toEqual([]);
  });
});

describe('parseTerraformPlanJson detail', () => {
  const scaleDown = {
    address: 'aws_lambda_function.scale_down',
    change: {
      actions: ['update'],
      before: {
        timeout: 60,
        environment: [{ variables: { RUNNING_TIME: '2', LOG_LEVEL: 'info' } }],
        token: 'old-secret',
        tags: { team: 'ci' },
      },
      after: {
        timeout: 60,
        environment: [{ variables: { RUNNING_TIME: '8', LOG_LEVEL: 'info' } }],
        token: 'new-secret',
        tags: { team: 'ci' },
      },
      after_unknown: { last_modified: true },
      before_sensitive: { token: true, environment: [{}] },
      after_sensitive: { token: true, environment: [{}] },
    },
  };

  it('leaves the default output free of attribute detail', () => {
    const { resources, detailTruncated } = parseTerraformPlanJson(
      showJson([scaleDown]),
    );
    expect(resources).toEqual([
      { address: 'aws_lambda_function.scale_down', action: 'update' },
    ]);
    expect(detailTruncated).toBeUndefined();
  });

  it('lists only the changed attributes with before and after values', () => {
    const { resources } = parseTerraformPlanJson(showJson([scaleDown]), {
      detail: true,
    });
    expect(resources[0].changes).toEqual(
      expect.arrayContaining([
        {
          attr: 'environment.0.variables.RUNNING_TIME',
          before: '2',
          after: '8',
        },
        { attr: 'last_modified', after: UNKNOWN_PLACEHOLDER },
      ]),
    );
    const attrs = resources[0].changes?.map((c) => c.attr);
    expect(attrs).not.toContain('timeout');
    expect(attrs).not.toContain('environment.0.variables.LOG_LEVEL');
  });

  it('redacts values marked sensitive on either side', () => {
    const { resources } = parseTerraformPlanJson(showJson([scaleDown]), {
      detail: true,
    });
    expect(resources[0].changes).toContainEqual({
      attr: 'token',
      before: SENSITIVE_PLACEHOLDER,
      after: SENSITIVE_PLACEHOLDER,
    });
    expect(JSON.stringify(resources)).not.toContain('old-secret');
    expect(JSON.stringify(resources)).not.toContain('new-secret');
  });

  it('redacts a whole subtree when the mask marks its parent', () => {
    const { resources } = parseTerraformPlanJson(
      showJson([
        {
          address: 'aws_lambda_function.fn',
          change: {
            actions: ['update'],
            before: { environment: { variables: { KEY: 'aaa-secret' } } },
            after: { environment: { variables: { KEY: 'bbb-secret' } } },
            before_sensitive: { environment: { variables: true } },
            after_sensitive: { environment: { variables: true } },
          },
        },
      ]),
      { detail: true },
    );
    expect(resources[0].changes).toEqual([
      {
        attr: 'environment.variables',
        before: SENSITIVE_PLACEHOLDER,
        after: SENSITIVE_PLACEHOLDER,
      },
    ]);
  });

  it('lists created attributes without a before value', () => {
    const { resources } = parseTerraformPlanJson(
      showJson([
        {
          address: 'aws_s3_bucket.new',
          change: {
            actions: ['create'],
            before: null,
            after: { bucket: 'assets' },
            after_unknown: { arn: true },
            before_sensitive: false,
            after_sensitive: {},
          },
        },
      ]),
      { detail: true },
    );
    expect(resources[0].changes).toEqual([
      { attr: 'bucket', after: 'assets' },
      { attr: 'arn', after: UNKNOWN_PLACEHOLDER },
    ]);
  });

  it('caps a single oversized value', () => {
    const { resources } = parseTerraformPlanJson(
      showJson([
        {
          address: 'aws_iam_policy.big',
          change: {
            actions: ['update'],
            before: { policy: 'a'.repeat(5000) },
            after: { policy: 'b'.repeat(5000) },
          },
        },
      ]),
      { detail: true },
    );
    const change = resources[0].changes?.[0];
    expect(String(change?.before).length).toBeLessThan(
      MAX_DETAIL_VALUE_CHARS + 30,
    );
    expect(String(change?.after)).toContain('(+4800 chars)');
  });

  it('caps total detail size and flags the truncation', () => {
    const attrs = (value: string): Record<string, string> =>
      Object.fromEntries(
        Array.from({ length: 200 }, (_, i) => [`attr_${i}`, `${value}-${i}`]),
      );
    const many = Array.from({ length: 10 }, (_, i) => ({
      address: `aws_lambda_function.fn_${i}`,
      change: {
        actions: ['update'],
        before: attrs('before'),
        after: attrs('after'),
      },
    }));
    const { summary, resources, detailTruncated } = parseTerraformPlanJson(
      showJson(many),
      { detail: true },
    );
    expect(detailTruncated).toBe(true);
    expect(summary.change).toBe(10);
    expect(resources).toHaveLength(10);
    expect(resources[9]).toMatchObject({ changes: [], changesTruncated: true });
    const detailSize = resources.reduce(
      (total, r) => total + JSON.stringify(r.changes ?? []).length,
      0,
    );
    expect(detailSize).toBeLessThan(MAX_DETAIL_CHARS + 1000);
  });
});

describe('needsBackendInit', () => {
  it('matches the uninitialized-backend error', () => {
    expect(needsBackendInit(BACKEND_INIT_LOG)).toBe(true);
  });

  it('ignores unrelated plan failures', () => {
    expect(needsBackendInit(MISSING_ZIP_LOG)).toBe(false);
  });
});

describe('runnerLambdaZipRemedy', () => {
  it('names make runner-lambdas-sync for missing zips under terraform/runners', () => {
    const remedy = runnerLambdaZipRemedy(
      MISSING_ZIP_LOG,
      'D:\\code\\repo\\terraform\\runners',
    );
    expect(remedy).toBe(RUNNER_LAMBDAS_REMEDY);
    expect(remedy).toContain('make runner-lambdas-sync');
  });

  it('does not fire for other terraform directories', () => {
    expect(
      runnerLambdaZipRemedy(MISSING_ZIP_LOG, '/repo/terraform/main'),
    ).toBeUndefined();
  });

  it('does not fire for unrelated failures in terraform/runners', () => {
    expect(
      runnerLambdaZipRemedy(BACKEND_INIT_LOG, '/repo/terraform/runners'),
    ).toBeUndefined();
    expect(
      runnerLambdaZipRemedy(
        'Call to function "filebase64sha256" failed: open certs/ca.pem: no such file',
        '/repo/terraform/runners',
      ),
    ).toBeUndefined();
  });
});

describe('terraformPlan', () => {
  const repoRoot = resolve(__dirname, '../../../../..');
  const dir = 'terraform/runners';

  type RunJob = NonNullable<Parameters<typeof terraformPlan>[2]>;
  type JobSpec = Parameters<RunJob>[0];

  function stubRunner(fn: (spec: JobSpec) => JobSnapshot): RunJob {
    return (spec) => Promise.resolve(fn(spec));
  }

  function doneSnapshot(
    spec: JobSpec,
    resourceChanges: unknown[],
  ): JobSnapshot {
    const meta = spec.meta as { planJsonPath: string };
    writeFileSync(meta.planJsonPath, showJson(resourceChanges));
    return {
      jobId: 'tfplan-test',
      status: 'done',
      cwd: spec.cwd,
      elapsedSec: 2,
      meta: spec.meta,
    } as JobSnapshot;
  }

  it('runs terraform init once and retries when the backend is uninitialized', async () => {
    const specs: JobSpec[] = [];
    const runJob = stubRunner((spec) => {
      specs.push(spec);
      return specs.length === 1
        ? { ...failedSnapshot(BACKEND_INIT_LOG), meta: spec.meta }
        : doneSnapshot(spec, [
            {
              address: 'aws_lambda_function.a',
              change: { actions: ['update'] },
            },
          ]);
    });

    const result = await terraformPlan({ dir }, repoRoot, runJob);

    expect(specs).toHaveLength(2);
    expect(specs[0].args[1]).not.toContain("'init'");
    expect(specs[1].args[1]).toContain("'init' '-input=false'");
    expect(specs[1].args[1]).toContain("'plan'");
    expect(result.isError).toBeUndefined();
    expect(resultJson(result)).toMatchObject({
      status: 'done',
      autoInit: true,
      summary: { add: 0, change: 1, destroy: 0 },
    });
  });

  it('does not retry a second time when init does not clear the error', async () => {
    let calls = 0;
    const runJob = stubRunner((spec) => {
      calls += 1;
      return { ...failedSnapshot(BACKEND_INIT_LOG), meta: spec.meta };
    });

    const result = await terraformPlan({ dir }, repoRoot, runJob);

    expect(calls).toBe(2);
    expect(result.isError).toBe(true);
    expect(resultJson(result).status).toBe('failed');
  });

  it('does not run init for other failures', async () => {
    let calls = 0;
    const runJob = stubRunner((spec) => {
      calls += 1;
      return {
        ...failedSnapshot('Error: Unsupported argument'),
        meta: spec.meta,
      };
    });

    const result = await terraformPlan({ dir }, repoRoot, runJob);

    expect(calls).toBe(1);
    expect(resultJson(result).output).toContain('Unsupported argument');
  });

  it('returns the runner-lambdas-sync remedy instead of the raw error wall', async () => {
    const runJob = stubRunner((spec) => ({
      ...failedSnapshot(MISSING_ZIP_LOG),
      meta: spec.meta,
    }));

    const result = await terraformPlan({ dir }, repoRoot, runJob);
    const body = resultJson(result);

    expect(result.isError).toBe(true);
    expect(body.remedy).toBe(RUNNER_LAMBDAS_REMEDY);
    expect(body.output).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('filebase64sha256');
  });

  it('keeps the default result shape and adds changes only with detail', async () => {
    const change = {
      address: 'aws_lambda_function.a',
      change: {
        actions: ['update'],
        before: { timeout: 2 },
        after: { timeout: 8 },
      },
    };
    const runJob = stubRunner((spec) => doneSnapshot(spec, [change]));

    const plain = resultJson(await terraformPlan({ dir }, repoRoot, runJob));
    expect(Object.keys(plain)).toEqual([
      'status',
      'success',
      'jobId',
      'dir',
      'elapsedSec',
      'summary',
      'resources',
    ]);
    expect(plain.resources).toEqual([
      { address: 'aws_lambda_function.a', action: 'update' },
    ]);

    const detailed = resultJson(
      await terraformPlan({ dir, detail: true }, repoRoot, runJob),
    );
    expect(detailed.resources).toEqual([
      {
        address: 'aws_lambda_function.a',
        action: 'update',
        changes: [{ attr: 'timeout', before: 2, after: 8 }],
      },
    ]);
  });
});
