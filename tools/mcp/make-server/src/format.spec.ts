import { describe, expect, it } from '@jest/globals';

import { formatResourceList } from './format.js';

describe('formatResourceList (terraform_state_list token-efficient format)', () => {
  it('renders a compact newline list with a pluralized count header', () => {
    const text = formatResourceList([
      'aws_lambda_function.graphql',
      'aws_s3_bucket.assets',
      'aws_iam_role.lambda',
    ]);
    expect(text).toBe(
      '3 resources:\n' +
        'aws_lambda_function.graphql\n' +
        'aws_s3_bucket.assets\n' +
        'aws_iam_role.lambda',
    );
  });

  it('uses the singular noun for exactly one resource', () => {
    expect(formatResourceList(['aws_lambda_function.graphql'])).toBe(
      '1 resource:\naws_lambda_function.graphql',
    );
  });

  it('signals an empty state explicitly rather than emitting "[]"', () => {
    expect(formatResourceList([])).toBe('No resources in state.');
  });

  it('drops JSON array punctuation — no brackets, quotes, or braces', () => {
    const text = formatResourceList(['module.api.aws_lambda_function.fn']);
    expect(text).not.toContain('[');
    expect(text).not.toContain('"');
    expect(text).not.toContain('{');
  });

  it('is cheaper (fewer chars) than the equivalent minified JSON array', () => {
    const resources = Array.from(
      { length: 12 },
      (_, i) => `aws_lambda_function.fn_${i}`,
    );
    const listText = formatResourceList(resources);
    const jsonText = JSON.stringify({
      success: true,
      count: resources.length,
      resources,
    });
    expect(listText.length).toBeLessThan(jsonText.length);
  });
});
