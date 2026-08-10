# Unit Testing (Jest)

Layer-1 tests: isolated logic, utilities, components, and resolvers with mocked dependencies. For layer selection see [SKILL.md](../SKILL.md#test-type-selection-guide); for what actually blocks merge see [What Gates Merge](../SKILL.md#what-gates-merge).

## Naming

| Test type                           | Pattern                                                                           | Runner                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Unit                                | `*.spec.ts`                                                                       | Jest via `nx <project>:test`                                                        |
| DB (Jest + real PostgreSQL)         | `*.db.spec.ts` in `lambdas/db/src/schema/`                                        | `nx run db:test:db` — [DB Integration Tests](../SKILL.md#db-integration-tests)      |
| Playwright (hermetic / integration) | `*.spec.ts` in `src/tests/` / `*.integration.spec.ts` in `src/integration/tests/` | [e2e-testing.md](e2e-testing.md) / [integration-testing.md](integration-testing.md) |

There is **no** Jest `*.integration.spec.ts` convention in this repo. Resolver tests that need a real database are `*.db.spec.ts` (matched by `lambdas/db/jest.db.config.ts` `testMatch`); `*.integration.spec.ts` is exclusively the Playwright live-backend suite. (An older version of this doc claimed otherwise — it was wrong.)

## Commands

MCP-first — use `nx_run`; shell fallbacks only when MCP is unavailable. Full pattern set with flags: [SKILL.md Commands](../SKILL.md#commands).

```
# One project
nx_run(project: "scoring", target: "test")

# One file, verbose
nx_run(project: "web", target: "test", args: ["--testPathPatterns=useAuth\\.spec", "--verbose"])
```

```bash
make test                                  # = pnpm exec nx affected -t test
pnpm exec nx run <project>:test            # one project
pnpm exec nx run <project>:test -- --all --testPathPatterns="SpecName" --verbose
pnpm exec nx run <project>:test --testNamePattern="should handle error"
pnpm exec nx run <project>:test --updateSnapshot
pnpm exec nx run <project>:test --runInBand --no-cache   # debugging
```

Use `--testPathPatterns` (plural; the singular form is deprecated in Jest 30+). `--all` bypasses any `--onlyChanged` default in package.json-script-backed targets.

## Configuration layout

- `jest.config.ts` (root) — `getJestProjectsAsync()`, aggregates every project config.
- `jest.preset.js` — shared preset (`@nx/jest/preset` + `watchman`, `cache`, `clearMocks`, `collectCoverageFrom` globs).
- `jest.helpers.cjs` — `createNodeJestConfig({ displayName, projectPath, overrides })`, the factory most node projects (lambdas, `lib/*`, `apps/cli`) use in their `jest.config.ts`.
- Per-project `jest.config.ts` under each project root; `nx.json` `targetDefaults.test` sets `passWithNoTests: true` (which is why an empty match set passes silently — see the gate-hole note in [What Gates Merge](../SKILL.md#what-gates-merge)).

## CI behavior

PR CI runs `pnpm exec nx affected -t typecheck test` (ci-pipeline.yml `test` job) and the result gates merge through the CI Gate aggregate. Lambda unit suites are included as of 2026-07-02 via explicit `project.json` jest targets — **except `lambdas/db`**, deliberately left ungated pending red-suite cleanup (details homed in [What Gates Merge](../SKILL.md#what-gates-merge)). `lambdas/db` has `test:all-files` (`jest`, no flags) for a guaranteed full local run.

## Coverage

See [Coverage Truth](../SKILL.md#coverage-truth): no thresholds, nothing in CI collects unit coverage; `--coverage` is local-informational only.

## Common issues

| Symptom                             | Fix                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| "0 tests found"                     | Wrong project, typo in `--testPathPatterns`, or missing `--all` on a package.json-script-backed target |
| Stale/empty `nx_run` output         | Re-run with `noCache: true`                                                                            |
| Snapshot mismatch                   | Review the diff; `--updateSnapshot` only if the change is intentional                                  |
| DB connection errors in a unit test | The test belongs in `*.db.spec.ts` (real PostgreSQL) or the dependency should be mocked                |
| Passes locally, fails in CI         | Timing or environment-specific deps; run with `--runInBand --no-cache` to reproduce                    |

## Provenance and maintenance

Rewritten 2026-07-02 from the skills audit (`scratch/skills-audit/synthesis.json`, inconsistency 10: this file previously taught a nonexistent `*.integration.spec.ts` Jest convention, linked a deleted testing-strategy CSV, and pointed at deleted `typecheck`/`lint`/`build`/`makefile` skills). Re-verify:

- DB spec naming: `Glob('**/*.db.spec.ts')` and `grep -n testMatch lambdas/db/jest.db.config.ts`
- `make test` recipe: `grep -n -A2 '^test:' Makefile`
- Jest config factory: `head -12 jest.helpers.cjs`
- `passWithNoTests`: `grep -n -A6 '"test":' nx.json`
