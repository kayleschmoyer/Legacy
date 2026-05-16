// LS-4458 spec-file lint rules. Defined once and shared across overrides
// because ESLint legacy config does NOT merge `no-restricted-syntax` across
// matching overrides — the latter override fully replaces the rule, so the
// only way to apply both LS-4461 (integration-only) and LS-4458 (all spec
// files) selectors to integration spec files is to expand them inline in
// each override block. Using `.eslintrc.js` (over `.eslintrc.json`) lets us
// keep one source of truth for the selector list.
const ls4458SpecRules = [
  {
    selector:
      "IfStatement > AwaitExpression.test CallExpression[callee.property.name='isVisible']",
    message:
      'Do not branch on `if (await locator.isVisible())` in spec files — it silently passes when the element is hidden. Use a strict `await expect(locator).toBeVisible()` assertion, fix the precondition so the element always renders, or extract the polling into a helper outside spec/. See LS-4458.',
  },
  {
    selector:
      "IfStatement > UnaryExpression[operator='!'] > AwaitExpression.argument CallExpression[callee.property.name='isVisible']",
    message:
      'Do not branch on `if (!(await locator.isVisible()))` in spec files. Use a strict `await expect(locator).not.toBeVisible()` assertion or a deterministic precondition. See LS-4458.',
  },
  {
    selector:
      "IfStatement > AwaitExpression.test CallExpression[callee.object.callee.property.name='isVisible']",
    message:
      'Do not branch on `if (await locator.isVisible().catch(...))` in spec files. Use a strict assertion or fix the precondition race. Extract polling/cleanup into a helper outside spec/ if conditional execution is genuinely required. See LS-4458.',
  },
  {
    selector:
      "CallExpression[callee.object.name='test'][callee.property.name='skip'][arguments.0.value=true]",
    message:
      "Do not call `test.skip(true, ...)` at runtime — it silently passes regardless of the assertion's intent. Use `test.fixme(...)` with a Jira link, or fix the precondition so the test always runs. See LS-4458.",
  },
];

const ls4461IntegrationRules = [
  {
    selector:
      "CallExpression[callee.object.property.name='request'][callee.property.name='post']",
    message:
      'LS-4461: integration tests must not call `page.request.post(...)` for GraphQL. Use `gqlFetch` / `gqlFetchEnvelope` from `../helpers/gql-fetch` so backend `errors[]` are surfaced instead of masked as downstream timeouts.',
  },
  {
    selector: "CallExpression[callee.name='fetch']",
    message:
      'LS-4461: integration tests must not call `fetch(...)` directly. Use `gqlFetch` / `gqlFetchEnvelope` from `../helpers/gql-fetch` (which handles the GraphQL URL, auth header, and error unpacking).',
  },
];

module.exports = {
  extends: '../../.eslintrc.json',
  ignorePatterns: ['!**/*', 'test-jwt-utils.ts', '.eslintrc.js'],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      parserOptions: {
        project: ['apps/web-e2e/tsconfig.*?.json'],
      },
      rules: {},
    },
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        'no-empty-pattern': [
          'error',
          { allowObjectPatternsAsParameters: true },
        ],
      },
    },
    {
      files: ['*.js', '*.jsx'],
      rules: {},
    },
    {
      files: ['src/**/*.ts'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
        'no-console': 'off',
      },
    },
    {
      // Integration suite: enforce both LS-4461 (no raw HTTP) and LS-4458
      // (no conditional UI guards). Expanded inline because the LS-4458
      // override below would otherwise override-replace these selectors.
      files: [
        'src/integration/tests/**/*.ts',
        'src/integration/fixtures/**/*.ts',
        'src/integration/*.ts',
      ],
      excludedFiles: [
        'src/integration/global-setup.ts',
        'src/integration/global-teardown.ts',
        'src/integration/tests/google-oauth.integration.spec.ts',
      ],
      rules: {
        'no-restricted-syntax': [
          'error',
          ...ls4461IntegrationRules,
          ...ls4458SpecRules,
        ],
      },
    },
    {
      // Hermetic spec suite: enforce LS-4458 only. LS-4461 does not apply —
      // hermetic specs use `page.route` mocking instead of `gqlFetch`.
      files: ['src/tests/**/*.spec.ts'],
      rules: {
        'no-restricted-syntax': ['error', ...ls4458SpecRules],
      },
    },
  ],
};
