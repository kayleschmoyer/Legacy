# @legacy-sports/mcp-jobs

Shared background-job runner for the in-repo MCP servers (`tools/mcp/*`),
extracted from `tools/mcp/nx-server/src/jobs.ts` (LS-8564).

Cloud Claude Code sessions enforce a ~60s MCP transport timeout on every tool
call, so no tool may block longer than `MAX_WAIT_MS` (55s) in a single call.
Long-running work is spawned as a background job; callers get a `jobId`
immediately (or after a bounded sync budget via `runJobWithBudget`) and poll
with the server's wait/status tool.

One battle-tested implementation of:

- **`MAX_WAIT_MS` 55s cap** — every blocking wait stays under the transport timeout.
- **`runJobWithBudget`** — sync-then-handle: fast jobs finish in one call, slow
  jobs hand back a `jobId` to poll.
- **Process-tree kill** — `taskkill /T` on Windows, process-group `SIGTERM` on
  POSIX. `child.kill()` alone kills only the direct child and leaves
  grandchildren (nx/node) running.
- **Disk-persisted metadata** — job metadata lives next to the log file under
  the OS tmpdir, so a restarted MCP server can still report on jobs it did not
  spawn.
- **Exit-code sidecar** — non-`shell` jobs run through a platform trampoline
  (`sh` / `powershell.exe`, materialized into the job's tmpdir on first use —
  see `ensureWrapperScript` in `src/index.ts`) that writes the wrapped
  command's real exit code to `<jobId>.exit` when it exits. Because
  the trampoline is a genuine OS-level parent of the command (not a Node
  `close` event handler), a disk-recovered job resolves to its true `done` /
  `failed` outcome from this sidecar even if the MCP server process that
  spawned it died first — instead of reporting `orphaned` with an
  unrecoverable outcome (LS-8358). Jobs opted into `shell: true` (Windows
  npm-wrapper `.cmd` commands with pre-escaped args) keep the direct Node
  shell spawn and do not get this cross-restart recovery.
- **Orphan detection** — disk-recovered jobs with no exit-code sidecar whose
  pid has exited (or whose process deadline passed) are reported as
  `orphaned` instead of waiting forever.
- **Idempotency joining** — `idempotencyKey` re-joins an in-flight job instead
  of spawning a duplicate.

## Usage

Each server creates one runner, namespaced by id prefix and tmpdir directory:

```ts
import { createJobRunner, MAX_WAIT_MS } from '@legacy-sports/mcp-jobs';

const runner = createJobRunner({
  idPrefix: 'nx',
  dirName: 'nx-mcp-jobs',
  waitHint: (jobId) =>
    `Job still running. Call nx_job_wait({ jobId: "${jobId}" }) to continue waiting.`,
});

const { jobId } = runner.startJob({
  command: 'make',
  args: ['pc-typecheck'],
  cwd: worktreePath,
  label: 'pc-typecheck',
  timeoutMs: 600_000,
});
const snapshot = await runner.waitForJob(jobId);
```

Consumers: `tools/mcp/nx-server` (via its `src/jobs.ts` binding),
`tools/mcp/make-server` (`make-run-bg.ts`), `tools/mcp/aws-server`
(`packer-build.ts`). Import via the `@legacy-sports/mcp-jobs` path alias
(`tsconfig.base.json` + per-server tsconfig paths + per-server jest
`moduleNameMapper`), the same wiring as `@legacy-sports/mcp-format`.
