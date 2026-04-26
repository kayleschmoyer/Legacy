# Coding Standards

Standards derived from analysis of Copilot code review across recent merged PRs. These are the most frequent review findings -- agents should follow them during implementation, not wait for review to catch violations.

## Quick Reference

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
| **Tamagui**   | Numeric `lineHeight` in `style` prop → `1px`; pass as `('1' as unknown as number)` string    | 3     |
| **Tamagui**   | H1/Paragraph UA margins leak through Tamagui prop overrides; use `style={{ margin: 0 }}`     | 2     |
| **Tamagui**   | `position: fixed/sticky` elements need a same-height `aria-hidden` spacer sibling            | 2     |

### Validation Before Push

> **CRITICAL: Run `make pc` before pushing.** Every agent that modifies code must validate before pushing. Skipping saves 5 min but each CI failure costs 40-60 min in re-dispatch + CI queue time. Minimum alternative: `make format && make lint-fix && make typecheck`.

All code must pass `make pc` before being pushed. This runs formatting, linting, type checking, and tests -- the same gates CI enforces. Pushing without validation is the #1 cause of avoidable CI failures.

## Detailed Standards

> Full catalog with code examples: [standards-catalog.md](standards-catalog.md)
> Tamagui web pitfalls (overlapping content, lineHeight, UA margin leaks): [tamagui-web-pitfalls.md](tamagui-web-pitfalls.md)

### Security & Input Validation

**Argument injection**: Validate that user-supplied git refs, branch names, and CLI args do not start with `-`. Use `--` to separate options from positional arguments.

```typescript
// Bad
const args = ['ls-tree', ref, '--', path];

// Good
if (ref.startsWith('-')) throw new Error('Invalid ref: must not start with -');
const args = ['ls-tree', ref, '--', path];
```

**Shell injection**: Prefer `spawn`/`execFile` with `shell: false` and pass arguments as an array. If `shell: true` is required (Windows), validate all interpolated values.

**Query injection**: Validate Jira keys with `/^[A-Z]+-\d+$/`. Never interpolate raw user input into JQL or search queries.

**Path traversal**: Resolve file paths against the intended root and reject escapes: `if (!resolved.startsWith(rootDir)) throw`.

### Generated Files & Codegen

**Never manually edit `*.generated.*` files.** Fix the source (`.graphql` files, schema, codegen config) and run `make codegen`.

**Explain codegen changes in PR descriptions.** If generated files changed from rebase or schema updates, note why (e.g., "Codegen re-ran after rebase picked up new fields from main").

### Error Handling

**No silent swallowing**: Every catch block must re-throw, return error context, or log. Never `catch {}`.

```typescript
// Bad
catch {}

// Good
catch (e) { throw new Error('context', { cause: e }); }
catch (e) { LOGGER.warn('Non-critical', e); }
```

**MCP partial failure**: Set `isError: true` when batch operations partially fail. Report `{ total, succeeded, failed }`.

**Preserve cause**: Use `{ cause: originalError }` when re-throwing to preserve stack traces.

### API & Data Patterns

**Pagination**: Any list query to Jira REST (50 default) or GitHub GraphQL (100 default) must handle pagination. Never assume results fit in one page.

**Environment handling**: Handle all three environments explicitly:

```typescript
// Bad
const retention = env === 'dev' ? 30 : 90;

// Good
const retention = { dev: 7, staging: 30, prod: 90 }[env];
```

**Jira ADF**: Jira Cloud REST v3 requires Atlassian Document Format for descriptions, not plain text strings.

### Documentation

**Verify MCP tool references**: Before naming an MCP tool in docs/skills, confirm it exists in `tools/mcp/*/src/`.

**Update docs with code**: When changing behavior, grep for all comments/docs referencing it and update in the same PR.

**PR description accuracy**: Cross-check every claim in the PR description against actual code.

### Testing & Stories

**Assert behavior**: After simulating interaction (click, type), assert the expected outcome -- not just element existence. Use `getByRole` over `getByText` for interactive elements.

**Deterministic data**: No `Math.random()`, `Date.now()` in stories. Use fixed values. Keep args JSON-serializable (no `Set`, `Map`).

**Canonical mock values**: Import values from actual config (`SPORT_CONFIGS`, enums) rather than guessing position codes or team abbreviations.

### Type Safety

**Explicit interfaces**: Define named interfaces for API responses and tool results. No `Record<string, unknown>` for structured data. No `as never` or `as any`.

**React Native styles**: Use `StyleProp<ViewStyle>`, not raw `ViewStyle`.

### Output & Response

**Cap output**: Tools returning variable-length data must enforce a max size and report `{ truncated: true, totalLines }`.

**Consistent formats**: Within an MCP server, use the same response shape for all tools -- same field names, same error format.

### Regex

**Anchor patterns**: `\.tf$` for extensions, `(/|$)` after URL prefixes, `\b` for word boundaries. Loose patterns match unintended strings.

### Code Reuse

**Search before writing**: Check `lib/utils`, `lib/api`, and sibling files for existing implementations. If logic appears in two places, extract to a shared helper immediately.

### Shell Scripts

**Guard ordering**: Enforcement checks (lockfile detection, pnpm validation) must come _before_ any early-exit paths that bypass them (`SKIP_*` env vars, missing `node_modules` dir checks). If validation appears after an early exit, it is silently skipped.

**Recursive file checks**: Never use `-f package-lock.json` to detect foreign lockfiles at the repo root. Use `git ls-files` piped through a regex to catch nested paths:

```bash
# Bad -- only catches root-level file
if [ -f package-lock.json ]; then ...

# Good -- catches all tracked lockfiles recursively
pkg_locks=$(git ls-files | grep -E '(^|/)package-lock\.json$' || true)
if [ -n "$pkg_locks" ]; then ...
```

**Shell-quote paths in error output**: When emitting remediation commands in Bash error messages, always quote paths to handle spaces and special characters. Note: `printf %q` is a Bash extension — it is not available in POSIX `sh`.

```bash
# Bad
printf "  git rm %s\n" "$lockfile"

# Good (Bash only — printf %q is a Bash extension, not available in POSIX sh)
printf "  git rm -- %q\n" "$lockfile"
```

**Exit code propagation**: When invoking external commands that should block on failure (e.g., `git lfs pre-push`), propagate the exit code:

```bash
# Bad -- LFS failure is silently swallowed
git lfs pre-push "$@"

# Good
git lfs pre-push "$@" || exit $?
```

**POSIX portability**: Shell scripts intended to run on both Linux and macOS must not use GNU-specific extensions:

| GNU-only     | POSIX alternative            |
| ------------ | ---------------------------- |
| `grep -oP`   | `sed`/`awk` with ERE         |
| `base64 -w0` | `base64 &#124; tr -d '\n'`   |
| `base64 -d`  | `base64 -D` (macOS) / detect |

**Derive versions from source**: Never hardcode version strings in scripts that must stay in sync with `package.json`. Parse them instead:

```bash
# Bad
printf "  corepack enable && corepack prepare pnpm@9.12.1 --activate\n"

# Good
printf "  corepack enable && make install\n"
# or derive: node -p "require('./package.json').packageManager"
```

**Accurate prerequisites**: The prerequisites list at the top of a script must list only tools the script actually invokes. Remove any tool listed that the script never calls.

### Node.js HTTP / Download Scripts

**HTTP redirect handling**: Always follow all 3xx redirect status codes (301, 302, 303, 307, 308) before opening a write stream. Creating the file before following redirects causes writes to a closed stream on the redirected response:

```javascript
// Bad -- creates file before redirect is resolved
const file = fs.createWriteStream(dest);
https.get(url, (res) => {
  if (res.statusCode === 302) {
    file.close();
    https.get(res.headers.location, (r2) => r2.pipe(file)); // writes to closed stream
  }
});

// Good -- resolve redirects first, then open file
function download(url, dest) {
  return new Promise((resolve, reject) => {
    function get(url, redirects = 0) {
      if (redirects > 10) return reject(new Error('Too many redirects'));
      https.get(url, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          const location = new URL(res.headers.location, url).toString();
          res.resume();
          return get(location, redirects + 1);
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      });
    }
    get(url);
  });
}
```

**Atomic file writes**: Never write directly to the final destination. Use a temp file and rename on success so a failed download doesn't corrupt the previous artifact:

```javascript
// Bad -- truncates existing file; partial writes on failure corrupt it
const file = fs.createWriteStream(dest);

// Good -- atomic swap
const tmp = dest + '.tmp';
const tmpFile = fs.createWriteStream(tmp);
tmpFile.on('finish', () => {
  fs.renameSync(tmp, dest);
  resolve();
});
tmpFile.on('error', (err) => {
  tmpFile.destroy();
  try {
    fs.unlinkSync(tmp);
  } catch {}
  reject(err);
});
```

**Destroy stream before unlink**: On Windows, calling `fs.unlinkSync` on a file whose stream is still open throws `EBUSY`. Always destroy/close the stream first:

```javascript
// Bad
req.on('error', (err) => {
  fs.unlinkSync(dest);
  reject(err);
});

// Good
req.on('error', (err) => {
  file.destroy();
  try {
    fs.unlinkSync(dest);
  } catch {}
  reject(err);
});
```

**Request timeouts**: All HTTPS requests must set a timeout to prevent indefinite hangs in CI:

```javascript
const req = https.get(url, handler);
req.setTimeout(30_000, () => {
  req.destroy(new Error('Request timed out'));
});
```

**Semver regex**: Match full semver including prerelease/build suffixes:

```javascript
// Bad -- misses prerelease like 7.6.0-rc.1
const version = content.match(/source\s*=.*?([\d.]+)/)?.[1];

// Good
const version = content.match(
  /source\s*=.*?([\d.]+(?:-[-0-9A-Za-z.]+)?(?:\+[-0-9A-Za-z.]+)?)/,
)?.[1];
```

### Terraform / Infrastructure

**CloudWatch log group retention**: Never let AWS auto-create log groups (they default to "Never expire"). Always declare explicit `aws_cloudwatch_log_group` resources with `retention_in_days` and standard tags before any resource that writes logs:

```hcl
resource "aws_cloudwatch_log_group" "runner_cloud_init" {
  name              = "/github-runners/${local.name_prefix}-runner/cloud-init"
  retention_in_days = 30
  tags              = local.tags
}
```

**`depends_on` for module ordering**: When an `aws_cloudwatch_log_group` (or other prerequisite resource) is not wired into a module's inputs, Terraform can create the module in parallel with its dependencies. Add an explicit `depends_on`:

```hcl
module "github_runners" {
  source     = "..."
  depends_on = [aws_cloudwatch_log_group.runner_cloud_init]
}
```

**No string-constructed ARNs or duplicated names**: Reference resource attributes directly to avoid drift:

```hcl
# Bad -- duplicates bucket name, drifts if bucket is renamed
Resource = "arn:aws:s3:::my-project-runner-cache/*"

# Good
Resource = "${aws_s3_bucket.runner_cache[0].arn}/*"
```

Define shared prefixes as locals instead of repeating string interpolations across resources.

**IAM least-privilege for `s3:ListBucket`**: `s3:ListBucket` applies to the bucket ARN, not objects. Always scope it to the relevant prefix with a `Condition` block:

```hcl
{
  Sid      = "ListCacheBucket"
  Effect   = "Allow"
  Action   = ["s3:ListBucket"]
  Resource = aws_s3_bucket.runner_cache[0].arn
  Condition = {
    StringLike = { "s3:prefix" = ["pnpm-store/*"] }
  }
}
```

**S3 `abort_incomplete_multipart_upload`**: All S3 buckets must include this lifecycle rule to prevent orphaned multipart parts from accumulating storage costs when uploads are interrupted (spot termination, background sync failures):

```hcl
abort_incomplete_multipart_upload {
  days_after_initiation = 7
}
```

**SNS publisher least-privilege**: Restrict EventBridge → SNS `Publish` permissions with `aws:SourceArn` (the rule ARN), not just `aws:SourceAccount`. Otherwise any EventBridge rule in the account can publish to the topic:

```hcl
Condition = {
  ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.reminder[0].arn }
}
```

**Secrets in Terraform state**: Never use `secret_string` in `aws_secretsmanager_secret_version` for production secrets — the value is persisted in plaintext in TF state files. Use write-only arguments (AWS provider ≥ 5.x) or manage the secret value entirely outside Terraform and reference only the secret metadata/ARN.

**Background processes under `set -euo pipefail`**: The risk under `errexit` is the _launch_ failing (e.g., `nohup` not found or the subshell erroring before `&`). A later failure _inside_ the backgrounded command generally does **not** fail the parent script unless you `wait` for the job. Use `|| true` to make the launch best-effort — not to suppress background failures:

```bash
# Bad -- launch failure (e.g. nohup missing) can trip set -e
nohup bash -c "tar ... | aws s3 cp ..." &
disown

# Good -- best-effort launch; ignores launch-time failure
(nohup bash -c "tar ... | aws s3 cp ..." >> /tmp/cache.log 2>&1 & disown) || true
# If the background job's success matters, keep its PID and `wait` instead of disowning it.
```

**Tarball extraction security**: When extracting S3-backed tarballs with elevated privileges, extract to a dedicated directory (not `/`) and use `--no-same-owner --no-same-permissions` to avoid ownership/permission restoration. These flags do **not** prevent path traversal — validate tar member paths before extraction and reject absolute paths or entries containing `..`:

```bash
# Bad -- extracts as root to /, honors tar ownership, no path validation
aws s3 cp s3://bucket/cache.tar.gz - | tar xzf - -C /

# Good -- validate archive members before extracting
# (avoid `tar ... | while ...`: without set -o pipefail, tar failures are masked
#  by a successful while; also, the loop runs in a subshell so variable changes
#  inside it do not propagate to the parent shell)
ARCHIVE="$(mktemp)"
ARCHIVE_LIST="$(mktemp)"
aws s3 cp s3://bucket/cache.tar.gz "$ARCHIVE"
tar tzf "$ARCHIVE" > "$ARCHIVE_LIST"

while IFS= read -r entry; do
  case "$entry" in
    /*|*../*|../*|*/..|..)
      echo "Refusing to extract unsafe tar entry: $entry" >&2
      rm -f "$ARCHIVE" "$ARCHIVE_LIST"
      exit 1
      ;;
  esac
done < "$ARCHIVE_LIST"

tar xzf "$ARCHIVE" -C "$PNPM_STORE" --no-same-owner --no-same-permissions
rm -f "$ARCHIVE" "$ARCHIVE_LIST"
chmod -R a+rX "$PNPM_STORE"
```
