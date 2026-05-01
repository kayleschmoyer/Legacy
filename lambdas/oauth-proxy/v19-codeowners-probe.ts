/**
 * CI Validation Probe — V19 (LS-3921)
 *
 * This file exists solely to exercise the CODEOWNERS enforcement path for
 * `lambdas/oauth-proxy/**` (owned by @bkrupa per .github/CODEOWNERS).
 *
 * Scenario: A PR touching this file should require human CODEOWNER approval
 * (@bkrupa) in addition to bot approval, per `require_code_owner_review: true`
 * in .github/ruleset.json.
 *
 * This file is intentionally inert — it declares constants but exports nothing
 * used by production code. It will be removed when the validation PR is closed.
 *
 * Acceptance criteria being tested:
 *   AC1 — Bot approved but CODEOWNERS approval still pending
 *   AC2 — PR cannot merge until human CODEOWNER approves
 *   AC3 — After human approval: PR becomes mergeable
 *   AC4 — No additional bot approval needed after human approves
 *
 * @see docs/ci-cd/ci-greenfield-validation-report.md §15
 */

const V19_VALIDATION_PROBE = 'v19-codeowners-sensitive';
const V19_TICKET = 'LS-3921';
const V19_DATE = '2026-05-01';
const V19_PATH_OWNER = '@bkrupa';
const V19_CODEOWNERS_PATH = 'lambdas/oauth-proxy/**';
const V19_RULESET_SETTING = 'require_code_owner_review: true';

export {
  V19_VALIDATION_PROBE,
  V19_TICKET,
  V19_DATE,
  V19_PATH_OWNER,
  V19_CODEOWNERS_PATH,
  V19_RULESET_SETTING,
};
