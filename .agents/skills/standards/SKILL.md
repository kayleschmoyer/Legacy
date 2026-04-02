---
name: standards
description: 'Coding standards, config conventions, lint discipline, and codegen policy. Load when: writing new code, reviewing configs, handling lint errors, encountering generated files, or creating new projects.'
---

# Skill: Standards

Consolidated reference for coding standards, configuration conventions, lint discipline, and codegen policy. These rules are enforced by CI and code review -- follow them during implementation to avoid review findings.

## Critical Rules

### No lint suppression -- fix root causes

**Never** add `eslint-disable`, `eslint-disable-next-line`, `@ts-ignore`, or `@ts-expect-error` as a first resort. Fix the underlying issue instead. If a disable is truly unavoidable, it must: (1) target a single line, (2) name the exact rule, and (3) include a `-- description` explaining why.

> Details, approved exceptions, and ESLint config reference: [references/lint-discipline.md](references/lint-discipline.md)

### Never edit generated files -- run codegen

Files matching `*.generated.ts` and `schema.graphql` are auto-generated. Manual edits get overwritten and fail CI. Fix the source (`.graphql` files, Pothos types, codegen config) and run `make codegen`.

> Regeneration steps, CI checks, and conflict resolution: [references/codegen-policy.md](references/codegen-policy.md)

### Validate before push

Run `make pc` before pushing. Skipping saves 5 min but each CI failure costs 40-60 min in re-dispatch + CI queue time. Minimum alternative: `make format && make lint-fix && make typecheck`.

## Quick Reference -- Top Review Findings

| Category      | Rule                                                                                         | Count |
| ------------- | -------------------------------------------------------------------------------------------- | ----- |
| **Codegen**   | Never edit `*.generated.*` files -- fix source + `make codegen`                              | 20+   |
| **Codegen**   | Explain generated file changes in PR description                                             | 20+   |
| **Security**  | Reject git refs/args starting with `-` (argument injection)                                  | 5     |
| **Security**  | Prefer `shell: false` + args array over `shell: true`                                        | 3     |
| **Security**  | Validate/escape JQL inputs, validate Jira keys with regex                                    | 3     |
| **Security**  | Reject path traversal (`../`, absolute paths) in file params                                 | 3     |
| **Security**  | Tarballs: extract with `--no-same-owner --no-same-permissions`; `chmod -R a+rX`              | 2     |
| **Errors**    | Every `catch` must re-throw, log, or return error context                                    | 5     |
| **Errors**    | MCP tools: set `isError: true` on partial/full failure                                       | 3     |
| **Errors**    | Preserve error cause chain with `{ cause: e }`                                               | 3     |
| **API**       | Paginate Jira (50 limit) and GitHub GraphQL (100 limit) queries                              | 4     |
| **API**       | Handle `dev`/`staging`/`prod` explicitly -- no boolean ternary                               | 3     |
| **API**       | Validate all inputs before making any external API call                                      | 3     |
| **API**       | Surface explicit warnings when silent failure is possible (e.g., no sprint found)            | 2     |
| **Docs**      | Verify MCP tool names exist before referencing in docs                                       | 5     |
| **Docs**      | Update comments/docs when changing behavior                                                  | 4     |
| **Docs**      | Cross-check PR description against actual implementation                                     | 4     |
| **Docs**      | Algorithm guarantees must match actual math ("at most 1" not "equally")                      | 4     |
| **Docs**      | File/env-var path references in comments must point to existing locations                    | 3     |
| **Output**    | Cap unbounded tool output, report `truncated: true`                                          | 3     |
| **Output**    | Use consistent response formats within an MCP server                                         | 3     |
| **Testing**   | Assert behavior after interaction, not just element existence                                | 3     |
| **Testing**   | Deterministic story data -- no `Math.random()` or `Date.now()`                               | 3     |
| **Testing**   | Use canonical config values in mock data                                                     | 3     |
| **Testing**   | Cover non-equal-modulo edge cases for rotation/distribution algorithms                       | 2     |
| **Types**     | Define explicit interfaces -- no `Record<string, unknown>`                                   | 3     |
| **Regex**     | Anchor patterns: `\.tf$`, `(/&#124;$)` after prefix, `\b` for words                          | 3     |
| **Reuse**     | Search for existing utils before writing duplicate logic                                     | 4     |
| **Shell**     | Guards must come before any early-exit path (`SKIP_*`, missing `node_modules`)               | 3     |
| **Shell**     | Recursive file checks: `git ls-files &#124; grep -E` not root-only `-f` test                 | 3     |
| **Shell**     | Shell-quote all paths in emitted fix/error commands                                          | 3     |
| **Shell**     | POSIX portability: no `grep -oP`; use `base64 &#124; tr -d '\n'` not `base64 -w0`            | 3     |
| **Shell**     | Propagate exit codes from external commands (`&#124;&#124; exit $?`)                         | 2     |
| **Shell**     | Derive pinned versions from `package.json`, not hardcoded constants                          | 2     |
| **Shell**     | List only prerequisites that the script actually uses                                        | 2     |
| **HTTP**      | Follow all 3xx redirects before opening write stream; enforce max-redirect limit             | 3     |
| **HTTP**      | Atomic writes: write to `.tmp`, rename on success; destroy stream before unlink              | 3     |
| **HTTP**      | Set timeouts on all HTTPS requests                                                           | 2     |
| **HTTP**      | Semver regex must handle prerelease/build: `[\d.]+(?:-[-0-9A-Za-z.]+)?(?:\+[-0-9A-Za-z.]+)?` | 2     |
| **Terraform** | Always create `aws_cloudwatch_log_group` with `retention_in_days` explicitly                 | 3     |
| **Terraform** | Add `depends_on` when module-to-resource ordering is not implicit                            | 2     |
| **Terraform** | Define locals for repeated strings; reference `resource.arn` not string concat               | 3     |
| **Terraform** | IAM `s3:ListBucket`: add prefix `Condition` for least-privilege                              | 3     |
| **Terraform** | S3 buckets: always add `abort_incomplete_multipart_upload` lifecycle rule                    | 2     |
| **Terraform** | SNS publisher: restrict with `aws:SourceArn`, not just `aws:SourceAccount`                   | 2     |
| **Terraform** | Don't store secrets in `secret_string` (persisted in TF state); use write-only               | 2     |

## Detailed References

| Reference                                                                        | Contents                                                                                       |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [references/coding-standards.md](references/coding-standards.md)                 | Security, error handling, API patterns, testing, types, documentation, regex, code reuse       |
| [references/standards-catalog.md](references/standards-catalog.md)               | Full catalog with code examples from 100 PR review analysis                                    |
| [references/config-conventions.md](references/config-conventions.md)             | ESLint, TypeScript, Jest, project.json, package.json conventions                               |
| [references/lint-discipline.md](references/lint-discipline.md)                   | Lint suppression policy, approved exceptions, ESLint config, troubleshooting                   |
| [references/codegen-policy.md](references/codegen-policy.md)                     | Generated file rules, regeneration steps, CI checks, conflict resolution                       |
| [references/platform-file-convention.md](references/platform-file-convention.md) | Platform file variants (`.ts`, `.native.ts`, `server.ts`), bundler resolution, troubleshooting |

## Related Skills

- [review](../review/SKILL.md) -- self-review checklist (references this skill)
- [fix-copilot-reviews](../fix-copilot-reviews/SKILL.md) -- batch-fix Copilot review comments
- [codegen](../codegen/SKILL.md) -- codegen workflow details
- [create-lib](../create-lib/SKILL.md) -- step-by-step library creation
- [create-lambda](../create-lambda/SKILL.md) -- step-by-step lambda creation
