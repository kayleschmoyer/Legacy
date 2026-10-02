/**
 * Tests for scripts/check-iam-policy-size.py — the IAM policy size gate run by
 * .github/checks/iam-policy-size.sh (LS-9412).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/check-iam-policy-size.test.mjs
 *
 * The checker is Python, so it is exercised as a subprocess. LS-10408: bare
 * Terraform references (`Resource = [aws_vpc.main.arn]`) and single-line maps
 * (`StringEquals = { "ec2:Vpc" = ... }`) used to make it exit 2 (parse error)
 * instead of reporting a size. The fixture uses both shapes.
 */

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'check-iam-policy-size.py');
const FIXTURE = resolve(
  __dirname,
  'fixtures',
  'check-iam-policy-size',
  'references.tf',
);

const PYTHON = ['python3', 'python'].find(
  (candidate) => spawnSync(candidate, ['--version']).status === 0,
);

// Loads the checker as a module and prints each fixture policy's compact JSON.
const DUMP_POLICIES = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("checker", sys.argv[1])
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)
content = open(sys.argv[2], encoding="utf-8").read()
out = {}
for kind, name in [
    ("aws_iam_role_policy", "github_actions_additional"),
    ("aws_iam_policy", "github_actions_supplemental"),
    ("aws_iam_policy", "github_actions_supplemental_2"),
]:
    body = checker.find_policy_block(content, f'resource "{kind}" "{name}"')
    out[name] = json.loads(checker.hcl_body_to_json(body))
out["placeholder"] = checker.REFERENCE_PLACEHOLDER
print(json.dumps(out))
`;

function run(args) {
  return spawnSync(PYTHON, args, { encoding: 'utf8' });
}

describe(
  'check-iam-policy-size.py',
  { skip: !PYTHON && 'python3/python not on PATH' },
  () => {
    test('measures a file with bare references and single-line maps (exit 0, no parse error)', () => {
      const result = run([SCRIPT, FIXTURE]);
      assert.equal(
        result.status,
        0,
        `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      assert.doesNotMatch(result.stderr, /ERROR/);
      assert.match(result.stdout, /All policies fit with headroom/);
    });

    test('bare references become placeholder strings; known locals use LOCAL_SUBS values', () => {
      const result = run(['-c', DUMP_POLICIES, SCRIPT, FIXTURE]);
      assert.equal(result.status, 0, result.stderr);
      const out = JSON.parse(result.stdout);
      const placeholder = out.placeholder;

      assert.deepEqual(out.github_actions_additional.Statement[0].Resource, [
        placeholder,
        placeholder,
      ]);
      assert.deepEqual(out.github_actions_supplemental.Statement[0].Condition, {
        StringEquals: { 'ec2:Vpc': placeholder },
      });
      const stmt = out.github_actions_supplemental_2.Statement[0];
      assert.equal(stmt.Resource, placeholder);
      assert.deepEqual(stmt.Condition, {
        StringEquals: {
          'aws:RequestedRegion': 'us-east-1',
          'aws:ResourceTag/env': 'dev',
        },
      });
    });

    test('placeholder is sized like a real ARN', () => {
      const result = run(['-c', DUMP_POLICIES, SCRIPT, FIXTURE]);
      assert.equal(result.status, 0, result.stderr);
      const { placeholder } = JSON.parse(result.stdout);
      assert.match(placeholder, /^arn:aws:/);
      assert.ok(
        placeholder.length >= 60,
        `placeholder only ${placeholder.length} bytes`,
      );
    });
  },
);
