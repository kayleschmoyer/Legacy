import baseConfig from '../../eslint.config.mjs';

// LS-4458 spec-file lint rules. Defined once and shared across overrides
// because ESLint legacy config does NOT merge `no-restricted-syntax` across
// matching overrides — the latter override fully replaces the rule, so the
// only way to apply both LS-4461 (integration-only) and LS-4458 (all spec
// files) selectors to integration spec files is to expand them inline in
// each override block. Using `eslint.config.mjs` (over JSON) lets us keep
// one source of truth for the selector list.
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

// LS-4456 ban hard sleeps and `networkidle` waits from low-level page objects
// and helpers. `page.waitForTimeout` bakes flake into every caller; Playwright
// officially discourages `waitForLoadState('networkidle')` and Apollo polling /
// WebSocket heartbeats defeat it on most routes.
const ls4456PageObjectRules = [
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name='waitForTimeout']",
    message:
      'LS-4456: page.waitForTimeout is banned in page objects and helpers — it bakes flake into every caller. Use expect(testid).toBeVisible(), page.waitForResponse(operationName), or expect.poll on a stable signal.',
  },
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name='waitForLoadState'][arguments.0.value='networkidle']",
    message:
      "LS-4456: waitForLoadState('networkidle') is banned in page objects and helpers — Playwright officially discourages it and Apollo polling/WebSockets defeat it. Gate on a visible test id instead.",
  },
];

// LS-8096 ban selector-based queries in spec files — enforces the semantic
// Page Object Model from ADR-0015. Selectors are allowed only in the page
// object layer (base/, components/, pages/); spec files call semantic verbs
// (e.g. `draftPage.pick(player)`) so a selector change touches one POM file,
// not every spec.
const ls8096NoSelectorsInSpecsRules = [
  {
    selector: "CallExpression[callee.property.name='getByTestId']",
    message:
      'LS-8096: getByTestId is banned in spec files (semantic POM, ADR-0015). Move the selector into a Page Object under base/, components/, or pages/, and expose a semantic verb (e.g. `draftPage.pick(player)`). See .agents/skills/testing/SKILL.md → Semantic Page Object Model.',
  },
  {
    selector: "CallExpression[callee.property.name='getByRole']",
    message:
      'LS-8096: getByRole is banned in spec files (semantic POM, ADR-0015). Move the selector into a Page Object under base/, components/, or pages/, and expose a semantic verb. See .agents/skills/testing/SKILL.md → Semantic Page Object Model.',
  },
  {
    selector: "CallExpression[callee.property.name='getByPlaceholder']",
    message:
      'LS-8096: getByPlaceholder is banned in spec files (semantic POM, ADR-0015). Move the selector into a Page Object under base/, components/, or pages/, and expose a semantic verb. See .agents/skills/testing/SKILL.md → Semantic Page Object Model.',
  },
  {
    selector: "CallExpression[callee.property.name='getByText']",
    message:
      'LS-8096: getByText is banned in spec files (semantic POM, ADR-0015). Move the selector into a Page Object under base/, components/, or pages/, and expose a semantic verb. See .agents/skills/testing/SKILL.md → Semantic Page Object Model.',
  },
  {
    selector: "CallExpression[callee.property.name='locator']",
    message:
      'LS-8096: locator() is banned in spec files (semantic POM, ADR-0015). Move the selector into a Page Object under base/, components/, or pages/, and expose a semantic verb. See .agents/skills/testing/SKILL.md → Semantic Page Object Model.',
  },
];

// LS-9660 ban positional selection (.first()/.nth()/.last()) chained directly
// on a text-derived locator (getByText/getByLabel/getByTitle/getByAltText) —
// EVERYWHERE under src/, page objects included. app.tsx mounts desktop AND
// mobile copies of the nav chrome (both always in the DOM, one display:none),
// so `page.getByText(name).first()` resolves the DOM-first (desktop) copy
// regardless of viewport — a deterministic Mobile-Chrome-only failure class
// (LS-9494/LS-9496/LS-9572). Positional selection on text is ambiguous by
// construction; scope to a testid/role container so the text match is unique.
const ls9660NoPositionalTextLocatorRules = [
  {
    selector:
      'CallExpression[callee.property.name=/^(first|last|nth)$/][callee.object.callee.property.name=/^(getByText|getByLabel|getByTitle|getByAltText)$/]',
    message:
      'LS-9660: .first()/.nth()/.last() chained on a text-derived locator (getByText/getByLabel/getByTitle/getByAltText) is banned — the app mounts desktop AND mobile nav chrome in the DOM simultaneously, so the DOM-first text match can be a CSS-hidden copy on the other viewport. Scope to a testid/role container so the match is unique (e.g. page.getByTestId(...).getByText(...)), or use a role-based locator with an accessible name. See .agents/skills/testing/SKILL.md → Positional selection on text locators.',
  },
];

// LS-9660 extend the LS-4456 hard-sleep/networkidle bans to hermetic spec
// files (they previously covered only page objects and helpers). Both are
// flake generators: waitForTimeout bakes a fixed race into the test, and
// networkidle never settles reliably with Apollo polling/WebSockets.
const ls9660HermeticWaitRules = [
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name='waitForTimeout']",
    message:
      'LS-9660: page.waitForTimeout() is banned in hermetic specs — it bakes flake into the test. Gate on a stable signal instead: expect(testid).toBeVisible(), page.waitForResponse(operationName), or expect.poll. See .agents/skills/testing/SKILL.md.',
  },
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name='waitForLoadState'][arguments.0.value='networkidle']",
    message:
      "LS-9660: waitForLoadState('networkidle') is banned in hermetic specs — Playwright officially discourages it and Apollo polling/WebSockets defeat it. Gate on a visible test id instead. See .agents/skills/testing/SKILL.md.",
  },
  {
    selector: "Property[key.name='waitUntil'][value.value='networkidle']",
    message:
      "LS-9660: waitUntil: 'networkidle' is banned in hermetic specs — Playwright officially discourages it and Apollo polling/WebSockets defeat it. Use the default 'load' and gate on a visible test id instead. See .agents/skills/testing/SKILL.md.",
  },
];

// LS-9794 ban substring matching for GraphQL operation routing. Hermetic
// specs mock responses by testing the request for an operation name; the only
// correct form is exact equality on the extracted name:
//
//   const op = extractOperationName(route).toLowerCase();
//   if (op === 'getleaguebyid') { ... }
//
// `postData.includes('getleague')` instead matches 21 real operations, and
// `op.includes('league')` matches 52. The first branch that matches wins and
// fulfills the route with another operation's response shape — which RESOLVES
// rather than errors, so the spec fails somewhere unrelated or passes
// vacuously (LS-9413, flagged HIGH on PR #7097). It stays latent only while
// operation names happen not to collide, and adding a query whose name
// contains an already-tested substring is a routine change.
//
// Deliberately `no-restricted-properties` rather than `no-restricted-syntax`:
// this file composes `no-restricted-syntax` across seven overlapping override
// blocks, and flat config replaces (never merges) a rule on the last matching
// block, so adding a selector there would require duplicating every union
// (the LS-7947 clobber hazard). A distinct rule name composes independently.
const ls9794NoSubstringOperationRoutingRules = [
  'postData',
  'op',
  'opName',
  'operationName',
].map((object) => ({
  object,
  property: 'includes',
  message: `LS-9794: substring matching on \`${object}\` is banned for GraphQL operation routing — the substring can match more than one real operation and silently fulfills the route with the wrong response shape. Use exact equality on the extracted name instead: \`const op = extractOperationName(route).toLowerCase(); if (op === '<operation>')\`. See apps/web-e2e/src/operation-routing-guard.test.ts.`,
}));

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

// LS-8096 basename list, converted to `**/<basename>` — bare basenames
// (no `/`) only matched at any depth under eslintrc's minimatch semantics;
// flat config requires the explicit `**/` prefix to preserve that behavior.
const ls8096MigratedSpecFiles = [
  'create-league-form-validation.spec.ts',
  'create-league-post-creation-redirect.spec.ts',
  'draft-selection-workflow.spec.ts',
  'free-agents-pickup.spec.ts',
  // LS-9660 grandfather burn-down — the LS-9496 43-failing-list specs,
  // migrated onto POM locators (playersPage.football / leaguePage verbs).
  'football-availability-filter.spec.ts',
  'football-players-position-url.spec.ts',
  'football-players-team-filter.spec.ts',
  'football-position-filter-a11y.spec.ts',
  'football-team-filter.spec.ts',
  'gif-picker.spec.ts',
  'join-league.spec.ts',
  'league-creation-advanced.spec.ts',
  'league-creation-football.spec.ts',
  'league-detail-tabs.spec.ts',
  'league-discovery-search.dual.spec.ts',
  'league-discovery.spec.ts',
  'mobile-responsive-nav.spec.ts',
  'navigation.spec.ts',
  'player-brefid-route.spec.ts',
  'player-compare-search.dual.spec.ts',
  'player-comparison-best-indicator.spec.ts',
  'player-comparison-career-achievements.spec.ts',
  'player-comparison-color-chips.spec.ts',
  'player-comparison-empty-minimum-states.spec.ts',
  'player-comparison-fantasy-scoring.spec.ts',
  'player-comparison-stats-charts.spec.ts',
  'player-comparison.spec.ts',
  'player-detail-bio-career-arc.spec.ts',
  'player-detail-modal.spec.ts',
  'player-detail-season-pitching.spec.ts',
  'player-stats-mocked.spec.ts',
  'player-stats-search.dual.spec.ts',
  'player-stats.spec.ts',
  // LS-8456 Phase B — trades / waivers / free-agents / notifications / settings
  'notification-dropdown-navigation.spec.ts',
  'notifications-hub.spec.ts',
  'notifications-page.spec.ts',
  'preferences.spec.ts',
  'profile-settings.spec.ts',
  'submit-new-trade.spec.ts',
  'trade-block.spec.ts',
  'trading-center.spec.ts',
  'user-preferences.spec.ts',
  'waiver-claims.spec.ts',
].map((basename) => `**/${basename}`);

// LS-9660 grandfather lists — files with pre-existing violations of the
// LS-9660 rules at rollout time. The rules apply to every OTHER file in the
// matching suite immediately; these files keep only their pre-existing rule
// set until they are cleaned up (tracked by the LS-9660 burn-down follow-up
// ticket). Do NOT add new files here — fix the locator instead. As files are
// cleaned up, delete their entry so the full rule set locks in.
//
// Hermetic specs (src/tests/) grandfathered for positional-text-locator
// and/or hard-wait violations. A single union list keeps the override
// composition simple (a file exempt for one LS-9660 rule is exempt for both —
// the burn-down removes it from the list only once it is clean of both).
const ls9660GrandfatheredSpecFiles = [
  'admin-console.spec.ts',
  'admin-jwt-decoder.spec.ts',
  'auction-draft.spec.ts',
  'auth-flows.spec.ts',
  'baseball-join-league-cta.spec.ts',
  'baseball-ui.spec.ts',
  'commissioner-audit-delete.spec.ts',
  'commissioner-draft-status.spec.ts',
  'commissioner-game-selection.spec.ts',
  'commissioner-waiver-errors.spec.ts',
  'disclosure-game.spec.ts',
  'draft-functionality.spec.ts',
  'draft-graphql-integration.spec.ts',
  'draft-spectator-watch.spec.ts',
  'faq-page.spec.ts',
  'football-free-agents-waivers.spec.ts',
  'football-hub.spec.ts',
  'football-players-name-search.spec.ts',
  'form-a11y.spec.ts',
  'full-season-ui.spec.ts',
  'global-error-handling.spec.ts',
  'join-league-gating.spec.ts',
  'league-chat-activity.spec.ts',
  'league-premium-gate.spec.ts',
  'loading-state-a11y.spec.ts',
  'mid-draft-trades.spec.ts',
  'mock-draft-simulator.spec.ts',
  'nfl-player-stats-category-tabs.spec.ts',
  'on-this-day.spec.ts',
  'overview-tab.spec.ts',
  'player-detail-career-arc-chart.spec.ts',
  'player-detail-deeplink.spec.ts',
  'player-detail-season-batting-table.spec.ts',
  'player-stats-format-preference.spec.ts',
  'playoff-bracket.spec.ts',
  'pre-draft-lobby-trades.spec.ts',
  'pricing-page.spec.ts',
  'profile-league-branding.spec.ts',
  'scoreboard.spec.ts',
  'season-draft-game-detail.spec.ts',
  'season-draft-games-flow.spec.ts',
  'season-draft-games.spec.ts',
  'season-draft-sport-toggle.spec.ts',
  'season-progression.spec.ts',
  'season-renewal-core.spec.ts',
  'season-renewal-teams-errors.spec.ts',
  'subscription.spec.ts',
  'tab-navigation-a11y.spec.ts',
  'team-detail-info-roster-branding.spec.ts',
  'team-detail.spec.ts',
  'twenty-questions.spec.ts',
  'websocket-realtime-updates.spec.ts',
].map((basename) => `**/${basename}`);

// Integration suite (src/integration/) grandfathered for
// positional-text-locator violations (the hard-wait bans intentionally do
// not apply to the live-backend suite — it has its own determinism guards).
const ls9660GrandfatheredIntegrationFiles = [
  'commissioner-announcements-ui.integration.spec.ts',
  'commissioner-settings-ui.integration.spec.ts',
  'draft-board-a11y-ui.integration.spec.ts',
  'full-season-ui.integration.spec.ts',
  'league-activity-feed-ui.integration.spec.ts',
  'league-scoring-editor-ui.integration.spec.ts',
  'live-draft-ui.integration.spec.ts',
  'matchup-detail-ui.integration.spec.ts',
  'matchup-roster-editor-ui.integration.spec.ts',
  'matchup-roster-recap-ui.integration.spec.ts',
  'mock-draft-simulator-ui.integration.spec.ts',
  'playoff-bracket-ui.integration.spec.ts',
  'roster-management-ui.integration.spec.ts',
  'season-renewal-migration-ui.integration.spec.ts',
  'subscription-gating.integration.spec.ts',
  'trade-flow-ui.integration.spec.ts',
  'wait-for-join-page.ts', // integration/helpers — matched via the pages/helpers overlay
  'waiver-processing-ui.integration.spec.ts',
].map((basename) => `**/${basename}`);

// LS-9794 grandfather list — files that already route GraphQL operations by
// substring at rollout time. The ban applies to every OTHER file under src/
// immediately. Do NOT add files here: new substring routing is the bug this
// rule exists to prevent. As each file is migrated to exact
// `extractOperationName(route)` equality, delete its entry (and its
// KNOWN_AMBIGUOUS entries in src/operation-routing-guard.test.ts) so the ban
// locks in; once the list is empty, delete it and the `ignores` key with it.
const ls9794GrandfatheredFiles = [
  'auction-draft.spec.ts',
  'combobox-search-a11y.spec.ts',
  'commissioner-announcements.spec.ts',
  'commissioner-audit-delete.spec.ts',
  'commissioner-game-selection.spec.ts',
  'commissioner-tab-nav.spec.ts',
  'commissioner-waiver-errors.spec.ts',
  'create-league.ts',
  'disclosure-game.spec.ts',
  'donate-page.spec.ts',
  'draft-functionality.spec.ts',
  'draft-graphql-integration.spec.ts',
  'form-a11y.spec.ts',
  'full-season-ui.spec.ts',
  'gif-picker.spec.ts',
  'join-league.spec.ts',
  'league-chat-activity.spec.ts',
  'league-creation-advanced.spec.ts',
  'league-creation.spec.ts',
  'league-detail-tabs.spec.ts',
  'league-discovery.spec.ts',
  'matchup-detail.spec.ts',
  'matchup-week-navigation.spec.ts',
  'mid-draft-trades.spec.ts',
  'mock-draft-simulator.spec.ts',
  'notifications-hub.spec.ts',
  'notifications-page.spec.ts',
  'on-this-day.spec.ts',
  'player-brefid-route.spec.ts',
  'player-comparison.spec.ts',
  'player-detail-bio-career-arc.spec.ts',
  'player-detail-hero-stats-chips.spec.ts',
  'player-detail-modal.spec.ts',
  'player-detail-season-fielding.spec.ts',
  'player-stats-fantasy-sort.spec.ts',
  'player-stats-mobile-card-feed.spec.ts',
  'player-stats-mocked.spec.ts',
  'player-stats.spec.ts',
  'playoff-bracket.spec.ts',
  'pre-draft-lobby-trades.spec.ts',
  'roster-management.spec.ts',
  'season-awards.spec.ts',
  'season-progression.spec.ts',
  'season-renewal.ts',
  'skip-link-pages-a11y.spec.ts',
  'standings.spec.ts',
  'subscription.spec.ts',
  'table-a11y.spec.ts',
  'team-detail-info-roster-branding.spec.ts',
  'team-detail.spec.ts',
  'trading-center.spec.ts',
  'websocket-realtime-updates.spec.ts',
  'websocket-realtime.spec.ts',
].map((basename) => `**/${basename}`);

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    languageOptions: {
      parserOptions: {
        project: ['apps/web-e2e/tsconfig.*?.json'],
      },
    },
    rules: {},
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
    },
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    rules: {},
  },
  {
    files: ['**/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
    },
  },
  {
    // LS-9660 baseline: ban positional selection on text-derived locators
    // across ALL of src/ — page objects (base/, components/, pages/),
    // fixtures, mocks, helpers, and specs alike. Flat config replaces
    // `no-restricted-syntax` wholesale on the last matching block, so every
    // suite-specific block below re-spreads these rules into its own union;
    // this block is what applies them to the file classes no later block
    // matches (base/, components/, fixtures/, mocks/, utils/, support/,
    // driver/, root-level src files).
    files: ['**/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...ls9660NoPositionalTextLocatorRules],
    },
  },
  {
    // Integration suite: enforce both LS-4461 (no raw HTTP) and LS-4458
    // (no conditional UI guards). Expanded inline because the LS-4458
    // override below would otherwise override-replace these selectors.
    files: [
      '**/src/integration/tests/**/*.ts',
      '**/src/integration/fixtures/**/*.ts',
      '**/src/integration/*.ts',
    ],
    ignores: [
      '**/src/integration/global-setup.ts',
      '**/src/integration/global-teardown.ts',
      '**/src/integration/tests/google-oauth.integration.spec.ts',
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
    // LS-9660 overlay for the integration suite: identical to the block
    // above plus the positional-text-locator ban, matching every integration
    // file EXCEPT the grandfathered ones (which stay on the block above).
    files: [
      '**/src/integration/tests/**/*.ts',
      '**/src/integration/fixtures/**/*.ts',
      '**/src/integration/*.ts',
    ],
    ignores: [
      '**/src/integration/global-setup.ts',
      '**/src/integration/global-teardown.ts',
      '**/src/integration/tests/google-oauth.integration.spec.ts',
      ...ls9660GrandfatheredIntegrationFiles,
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...ls4461IntegrationRules,
        ...ls4458SpecRules,
        ...ls9660NoPositionalTextLocatorRules,
      ],
    },
  },
  {
    // Hermetic spec suite: enforce LS-4458 only. LS-4461 does not apply —
    // hermetic specs use `page.route` mocking instead of `gqlFetch`.
    files: ['**/src/tests/**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...ls4458SpecRules],
    },
  },
  {
    // LS-9660 overlay for hermetic specs: LS-4458 plus the
    // positional-text-locator ban and the hard-wait bans
    // (waitForTimeout / networkidle), matching every spec EXCEPT the
    // grandfathered ones (which stay on the block above until cleaned up).
    files: ['**/src/tests/**/*.spec.ts'],
    ignores: ls9660GrandfatheredSpecFiles,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...ls4458SpecRules,
        ...ls9660NoPositionalTextLocatorRules,
        ...ls9660HermeticWaitRules,
      ],
    },
  },
  {
    // LS-4456 page objects + helpers: ban hard sleeps and `networkidle`.
    // Disjoint from the integration/hermetic spec overrides above —
    // `pages/**` and `**/helpers/**` do not overlap with `tests/`,
    // `fixtures/`, or `src/integration/*.ts`, so the legacy-config
    // "last-override-wins" replacement of `no-restricted-syntax` does not
    // affect those suites.
    files: ['**/src/pages/**/*.ts', '**/src/**/helpers/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...ls4456PageObjectRules],
    },
  },
  {
    // LS-9660 overlay for page objects + helpers: LS-4456 plus the
    // positional-text-locator ban, matching every file EXCEPT the
    // grandfathered ones (which stay on the block above until cleaned up).
    files: ['**/src/pages/**/*.ts', '**/src/**/helpers/**/*.ts'],
    ignores: ls9660GrandfatheredIntegrationFiles,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...ls4456PageObjectRules,
        ...ls9660NoPositionalTextLocatorRules,
      ],
    },
  },
  {
    // LS-8096: ban selector-based queries in migrated hermetic specs.
    // Scoped via **basename globs** (distinct override key) and listed
    // LAST so it wins the legacy-config "last-override-wins" merge for
    // `no-restricted-syntax` on these files (per LS-7947 clobber hazard).
    // Because the earlier `src/tests/**/*.spec.ts` override would
    // otherwise replace this rule list, we re-spread the LS-4458 rules
    // here so all checks remain active on the matched specs. As more
    // specs are migrated to the semantic POM (ADR-0015), add their
    // basename to this list; once every spec under `src/tests/` is
    // migrated, widen `files` to `src/tests/**/*.spec.ts` and delete
    // the per-file list.
    files: ls8096MigratedSpecFiles,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...ls4458SpecRules,
        ...ls8096NoSelectorsInSpecsRules,
        // LS-9660: migrated specs also carry the positional-text-locator and
        // hard-wait bans (they are never grandfathered — an allowlisted spec
        // must be clean of both).
        ...ls9660NoPositionalTextLocatorRules,
        ...ls9660HermeticWaitRules,
      ],
    },
  },
  {
    // LS-9794 ban substring operation routing across ALL of src/ — specs,
    // fixtures, mocks, and helpers alike. Uses `no-restricted-properties`, a
    // rule no other block configures, so it composes with (rather than
    // clobbers) the `no-restricted-syntax` unions above and needs no
    // per-tier overlay.
    //
    // `ls9794GrandfatheredFiles` are the files that already violated the rule
    // when it was introduced; they keep their pre-existing rule set until
    // migrated. The list may only SHRINK — never add a file to it. Migrating
    // a file means deleting its entry here AND deleting its entries from
    // KNOWN_AMBIGUOUS in operation-routing-guard.test.ts.
    files: ['**/src/**/*.ts'],
    ignores: ls9794GrandfatheredFiles,
    rules: {
      'no-restricted-properties': [
        'error',
        ...ls9794NoSubstringOperationRoutingRules,
      ],
    },
  },
  {
    ignores: ['**/test-jwt-utils.ts'],
  },
];
