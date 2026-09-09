import { describe, expect, it } from '@jest/globals';

import { parseTerraformPlanJson } from './terraform-plan.js';

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
