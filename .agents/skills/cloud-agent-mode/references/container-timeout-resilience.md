# Container Timeout Resilience

Cloud containers can be reaped mid-run — most often during validation. The spine's ordering already absorbs this: branch pushed → draft PR → checkpoint comment → **then** validate, so a reap during a `pc-*` chunk loses nothing. The gate that still holds: **all seven chunks green before mark-ready** — a draft PR existing earlier is inert (CI and the Reviewer Bot are gated on `draft == false`).

The spine's tracking-task graph (Step 1c) is what survives compaction: with the validation task `blockedBy` the draft-PR task, an agent that loses prose context cannot reorder the gates. See [Read first](../../workflow-overview/references/ticket-to-merge-spine.md#read-first-why-ordering-breaks-and-what-actually-holds-it).

**Checkpoint**: where the `legacy-sports-dev-process` stdio server is loaded (local only — it is in no cloud configuration), use `continuation_post` / `continuation_status`. In every cloud mode, post/read the checkpoint as a PR comment whose first line is `<!-- continuation-plan -->` ([artifact format](../../dev-process/artifacts/continuation-plan.md)). **Resuming after a reap**: fresh container reattaches to the branch, reads the most recent `<!-- continuation-plan -->` comment, and continues from "what's left" — never restart from zero. A stalled-mid-validation session is what [/recover-stall](../../../../.claude/commands/recover-stall.md) recovers.

> Distinct from [Cloud-to-Local Teleport](../SKILL.md#cloud-to-local-teleport) (capability gap); this section handles the time gap.

## Known failure mode: container restarts silently kill in-flight background Bash jobs, no resume (LS-8937)

**Symptom**: a long-running `run_in_background: true` Bash job (most often a `make pc-<chunk>` validation chunk, e.g. `pc-lint`) is in flight when the container restarts. The restart kills the job with no error, no partial-progress marker, and no proactive notification at restart time — the only signal is a reactive `<system-reminder>` ("The container was restarted... background tasks were running and are now stopped") delivered on the _next_ turn. If a `ScheduleWakeup` was already armed expecting the job to still be running, that wakeup fires and finds nothing — the wait was spent on a job that no longer exists.

**Root cause**: `run_in_background` Bash processes have no persistence or checkpoint/resume mechanism across a container restart; only the git working tree survives (confirmed safe — restarts do not lose committed or pushed work, verified via `git status`/`git log` after every restart). There is currently no proactive push at the moment of restart, only the reactive notification on next tool use.

**Guidance**:

- Keep `pc-*` chunk background jobs **short and checkpointed** — run one chunk at a time in the canonical order (never a monolithic `make pc`) so a restart mid-chunk only costs that one chunk's re-run, not the whole validation pass. This is already the mandated degraded-mode path (see [Validation binding](platform-detection.md#validation-binding-safety-critical--read-before-running-anything)); the restart risk is another reason to never batch chunks into one background call.
- **After any restart notification, before assuming a job is still progressing**: always re-verify `git status` (confirm the working tree/branch state you expect) and re-tail or re-check the job's log/output immediately — do not trust a previously scheduled wakeup's assumption that the job is still running. Treat the notification as "the job is gone until proven otherwise," not "the job might still be fine."
- If the job was a `pc-*` validation chunk, just re-launch that one chunk in the background again — cheaper than discovering three restarts in via repeated full re-runs.
- Investigated but not pursued in LS-8937: proactive restart notification and background-job persistence/resume (the ticket's options a/b) both require platform/session-image changes outside this repository's reach — no in-repo hook, MCP tool, or script controls background-job lifecycle across a CCR container restart. This section (option c) is the documentation-only mitigation; if a persistence or proactive-notification primitive is ever added platform-side, update this entry to point to it instead.
