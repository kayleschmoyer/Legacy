# Runner AMI Env-Var Drift Inventory

Phase 1 deliverable for [LS-4947](https://bkrupa.atlassian.net/browse/LS-4947).

This is the source-of-truth ↔ ground-truth ledger for the self-hosted GitHub
Actions runner AMI. The **left side** is what the Packer build claims to set
([`terraform/runners/packer/runner-ami.pkr.hcl`](../../terraform/runners/packer/runner-ami.pkr.hcl)).
The **right side** is what GitHub Actions jobs actually observe at job-time,
captured by the diagnostic workflow at
[`.github/workflows/runner-env-dump.yml`](../../.github/workflows/runner-env-dump.yml).

Every reactive AMI patch (LS-4902 JDK 17 PATH, LS-4934 Gradle pre-bake,
LS-4936 `/opt/actions-runner`) was a drift instance — a thing the Packer
config thought it had configured that didn't actually reach a job step. This
inventory exists so future drift can be diffed against a known baseline
instead of rediscovered by failure.

## Evidence

- **AMI claimed by ticket:** `ami-09604782c3c411107`
  (`legacy-sports-runner-pw1.59.1-1779868205`, built 2026-05-27 07:57 UTC)
- **AMI actually running in the fleet:** `ami-046a766ca62496c37`
  (observed via IMDS on runner `i-0dc9b9f84412187de`, instance type
  `c6a.xlarge`, region `us-east-1`) — **this is itself a drift instance.**
  The launch template was updated more recently than the ticket was written,
  or the ticket cites a stale AMI ID. The inventory below reflects what is
  actually live, not what the ticket claims.
- **Diagnostic run:** [run #26523782942](https://github.com/bkrupa/legacy-sports/actions/runs/26523782942)
  (single job, 52s, push-triggered — see "How to refresh this inventory" for
  the workflow_dispatch flow used post-merge).

## How to refresh this inventory

1. Trigger `runner-env-dump.yml` from the GH UI (Actions → Runner Env Dump
   (Diagnostic) → Run workflow) or via `gh workflow run runner-env-dump.yml`.
   The workflow is `workflow_dispatch` only and intentionally so — it is a
   diagnostic, not a gate.
2. Open the run's job summary — every section is pre-formatted as markdown.
3. Re-diff against the source-of-truth table below and edit the **Verdict**
   column for any tool whose value moved.

## Source-of-truth table (Packer-declared)

The Packer HCL declares both **typed variables with version defaults**
(consumed by `--version`-style assertions in provisioners) and **literal env
exports** (written to `/etc/environment`, `/etc/profile.d/*.sh`, or
`/opt/actions-runner/.env`). The two are not the same — a variable can be
"set" in the build's `environment_vars` block without ever being written to
disk, and vice versa.

### Pinned versions (Packer variable defaults)

| Variable                      | Default         | Tool affected                                                                 | Exported to runtime via                                                                                             |
| ----------------------------- | --------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `node_version`                | `22`            | `node`, `npm`, `corepack`, `npx`                                              | NodeSource apt repo install — binary on default PATH                                                                |
| `pnpm_version`                | `9.12.1`        | `pnpm`                                                                        | Standalone release binary at `/usr/local/bin/pnpm` (LS-4949 — no corepack)                                          |
| `playwright_version`          | `1.59.1`        | `playwright`, browsers                                                        | `npm install -g playwright@<v>`; browsers under `/opt/playwright-browsers` via `PLAYWRIGHT_BROWSERS_PATH`           |
| `serve_version`               | `14.2.4`        | `serve`                                                                       | `npm install -g serve@<v>` — binary on default PATH                                                                 |
| `terraform_version`           | `1.14.0`        | `terraform`                                                                   | Binary at `/usr/local/bin/terraform`                                                                                |
| `snyk_version`                | `1.1293.1`      | `snyk`                                                                        | Binary at `/usr/local/bin/snyk`                                                                                     |
| `runner_version`              | `2.333.1`       | `actions-runner` agent                                                        | Tarball used only to run `installdependencies.sh` — agent itself installed at boot by the github-aws-runners module |
| `docker_version`              | `28.1.1`        | `docker`                                                                      | apt install with version pin                                                                                        |
| `android_api_level`           | `36`            | Android platforms-android-36 (Expo SDK 54 — LS-5032)                          | `ANDROID_HOME=/opt/android-sdk` exported via `/etc/profile.d/android-sdk.sh` AND `/opt/actions-runner/.env`         |
| `android_build_tools_version` | `36.0.0`        | Android `build-tools/36.0.0`                                                  | Path appended in `/etc/profile.d/android-sdk.sh` (login shell only — see drift entry below)                         |
| `android_ndk_version`         | `27.1.12297006` | Android NDK                                                                   | No explicit env export — under `$ANDROID_HOME/ndk/`                                                                 |
| `android_cmdline_tools_build` | `14742923`      | `sdkmanager`, `avdmanager`                                                    | Path appended in `/etc/profile.d/android-sdk.sh` (login shell only)                                                 |
| `gradle_version`              | `8.14.3`        | Pre-baked wrapper dist at `~/.gradle/wrapper/dists/gradle-8.14.3-bin/<hash>/` | No env export — wrapper reads `$GRADLE_USER_HOME`, derived from `$HOME`                                             |

### Literal env exports (Packer-written files)

| File                            | Lines written                                                                                                            | Notes                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/etc/profile`                  | `umask 0022`                                                                                                             | Login-shell umask                                                                                                                  |
| `/etc/login.defs`               | `UMASK 022`                                                                                                              | Login program umask                                                                                                                |
| `/etc/profile.d/playwright.sh`  | `export PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers`                                                               | Login shells only                                                                                                                  |
| `/etc/environment`              | `PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers`                                                                      | **Intended** as a non-login surface, but the runner systemd unit does not read `/etc/environment` — see drift D-1                  |
| `/etc/profile.d/java.sh`        | `export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64`<br>`export PATH=$JAVA_HOME/bin:$PATH`                              | Login shells only                                                                                                                  |
| `/opt/actions-runner/.env`      | `JAVA_HOME=...`<br>`ANDROID_HOME=/opt/android-sdk`<br>`ANDROID_SDK_ROOT=/opt/android-sdk`                                | **Intended** to be read by the runner agent at step-time, but observed clobbered by the runner agent's `config.sh` — see drift D-2 |
| `/etc/profile.d/android-sdk.sh` | `export ANDROID_HOME=/opt/android-sdk`<br>`export PATH=...cmdline-tools/latest/bin:...platform-tools:...build-tools/<v>` | Login shells only — see drift D-3                                                                                                  |

### Shell-context contract (which surface actually reaches which shell)

| Surface                                       | login shell (`bash -l`, SSH)                                      | non-login GH Actions step (default `runs:`)                                          |
| --------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `/etc/environment`                            | ✅ (via PAM)                                                      | ❌ (runner systemd unit has no `PAMName=` and no `EnvironmentFile=/etc/environment`) |
| `/etc/profile`, `/etc/profile.d/*.sh`         | ✅                                                                | ❌                                                                                   |
| `/opt/actions-runner/.env` (post-`config.sh`) | ❌                                                                | ✅                                                                                   |
| Default PATH (set by login or runner agent)   | ✅ (incl. `/usr/lib/jvm/java-17-openjdk-amd64/bin`, Android dirs) | ✅ (`/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin` only)   |

> **Rule of thumb:** the only env vars the runner agent reliably injects into
> job steps are (a) what's left in `/opt/actions-runner/.env` _after_ the
> agent has reconfigured itself at boot, and (b) anything the workflow itself
> exports (`env:`, `$GITHUB_ENV`, `setup-*` actions). `/etc/profile.d/*.sh`
> and `/etc/environment` do **not** reach job steps.

## Ground-truth observations (run #26523782942)

### `/opt/actions-runner/.env` (what the runner agent actually injects into every step)

```
ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/opt/actions-runner/hook_job_completed.sh
LANG=C.UTF-8
```

**This is the entire file.** No `JAVA_HOME`, no `ANDROID_HOME`, no
`ANDROID_SDK_ROOT`, no `PLAYWRIGHT_BROWSERS_PATH`. The Packer build writes
those three Android/Java vars to `.env`, but the runner agent's `config.sh`
overwrites the file at instance boot with only the two values above (which
come from the github-aws-runners cloud-init template, not from Packer).
**The LS-4902 / LS-4936 patches were correct against the Packer build
instance but never actually reached a live runner.**

### PATH

- **Non-login (every GH Actions step):**
  `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin`
- **Login (`bash -l`, only humans SSH-ing in):** above **plus**
  `/usr/lib/jvm/java-17-openjdk-amd64/bin`,
  `/opt/android-sdk/cmdline-tools/latest/bin`,
  `/opt/android-sdk/platform-tools`,
  `/opt/android-sdk/build-tools/35.0.0`.

### Env vars (presence per shell context)

| Var                        | Non-login (GH step) | Login                                   | Expected source                                                          |
| -------------------------- | ------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| `PLAYWRIGHT_BROWSERS_PATH` | ❌ MISSING          | ✅ `/opt/playwright-browsers`           | `/etc/environment` + `/etc/profile.d/playwright.sh`                      |
| `JAVA_HOME`                | ❌ MISSING          | ✅ `/usr/lib/jvm/java-17-openjdk-amd64` | `/etc/profile.d/java.sh` + (clobbered) `/opt/actions-runner/.env`        |
| `ANDROID_HOME`             | ❌ MISSING          | ✅ `/opt/android-sdk`                   | `/etc/profile.d/android-sdk.sh` + (clobbered) `/opt/actions-runner/.env` |
| `ANDROID_SDK_ROOT`         | ❌ MISSING          | ❌ MISSING                              | (clobbered) `/opt/actions-runner/.env` only — never reaches anywhere     |
| `LANG`                     | ✅ `C.UTF-8`        | ✅ `C.UTF-8`                            | `/opt/actions-runner/.env` (preserved by `config.sh`)                    |

### Tool versions (`which` + `--version`, non-login shell)

| Tool                                           | Path                                   | Version observed                         | Packer expected                                        | Verdict                                                        |
| ---------------------------------------------- | -------------------------------------- | ---------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| `node`                                         | `/usr/bin/node`                        | `v22.22.2`                               | `v22.x`                                                | ✅ in-sync                                                     |
| `npm`                                          | `/usr/bin/npm`                         | `10.9.7`                                 | bundled with node 22                                   | ✅ in-sync                                                     |
| `corepack`                                     | `/usr/bin/corepack`                    | `0.35.0`                                 | bundled                                                | ✅ in-sync                                                     |
| `pnpm`                                         | `/usr/local/bin/pnpm`                  | `9.12.1` (after LS-4949 AMI rebuild)     | `9.12.1`                                               | ✅ in-sync — fixed in LS-4949 (standalone binary, no corepack) |
| `npx`                                          | `/usr/bin/npx`                         | `10.9.7`                                 | bundled                                                | ✅ in-sync                                                     |
| `playwright`                                   | `/usr/bin/playwright`                  | `Version 1.59.1`                         | `1.59.1`                                               | ✅ in-sync                                                     |
| `serve`                                        | `/usr/bin/serve`                       | (no version flag — prints update banner) | `14.2.4`                                               | ✅ in-sync (binary present at expected path)                   |
| `terraform`                                    | `/usr/local/bin/terraform`             | `Terraform v1.14.0`                      | `1.14.0`                                               | ✅ in-sync                                                     |
| `uv`                                           | `/usr/local/bin/uv`                    | `uv 0.11.16`                             | latest (script install)                                | ✅ in-sync                                                     |
| `uvx`                                          | `/usr/local/bin/uvx`                   | `uvx 0.11.16`                            | latest                                                 | ✅ in-sync                                                     |
| `snyk`                                         | `/usr/local/bin/snyk`                  | `1.1293.1`                               | `1.1293.1`                                             | ✅ in-sync                                                     |
| `docker`                                       | `/usr/bin/docker`                      | `Docker version 28.1.1, build 4eba377`   | `28.1.1`                                               | ✅ in-sync                                                     |
| `docker compose`                               | `/usr/bin/docker`                      | `Docker Compose version v5.1.4`          | latest plugin                                          | ✅ in-sync                                                     |
| `gh`                                           | `/usr/bin/gh`                          | `gh version 2.92.0 (2026-04-28)`         | latest (apt)                                           | ✅ in-sync                                                     |
| `aws`                                          | `/usr/local/bin/aws`                   | `aws-cli/2.34.54 Python/3.14.5`          | v2.x                                                   | ✅ in-sync                                                     |
| `amazon-cloudwatch-agent-ctl`                  | `/usr/bin/amazon-cloudwatch-agent-ctl` | (status JSON)                            | present                                                | ✅ in-sync                                                     |
| `java`                                         | `/usr/bin/java`                        | `openjdk version "17.0.18" 2026-01-20`   | 17.x                                                   | ✅ in-sync                                                     |
| `javac`                                        | `/usr/bin/javac`                       | `javac 17.0.18`                          | 17.x                                                   | ✅ in-sync                                                     |
| `sdkmanager`                                   | **MISSING**                            | —                                        | `/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager` | ⚠️ **shell-context-dependent** — drift D-3                     |
| `adb`                                          | **MISSING**                            | —                                        | `/opt/android-sdk/platform-tools/adb`                  | ⚠️ **shell-context-dependent** — drift D-3                     |
| `gradle`                                       | **MISSING**                            | —                                        | no system gradle baked (wrapper-only)                  | ✅ expected — wrapper-only by design                           |
| `git`, `jq`, `curl`, `unzip`, `zip`, `python3` | various                                | recent                                   | apt                                                    | ✅ in-sync                                                     |

### File-system landmarks

All Packer-baked paths verified present with expected ownership:

- ✅ `/opt/playwright-browsers` (root:root 755) — contains `chromium-1217/`, `chromium_headless_shell-1217/`, `ffmpeg-1011/`
- ✅ `/opt/android-sdk` (root:root 755) — contains `build-tools/`, `cmdline-tools/`, `ndk/`, `platform-tools/`, `platforms/`
- ✅ `/opt/android-sdk/cmdline-tools/latest/bin` — has `sdkmanager`, `avdmanager`, `apkanalyzer`, etc.
- ✅ `/opt/android-sdk/platform-tools` — has `adb`, `fastboot`
- ✅ `/opt/actions-runner` (**ubuntu:ubuntu 755**) — LS-4936 pre-create succeeded
- ✅ `/opt/actions-runner/.env` (ubuntu:root 644, **89 bytes**) — file exists, content clobbered (see above)
- ✅ `/home/ubuntu/.gradle/wrapper/dists/gradle-8.14.3-bin/` — LS-4934 pre-bake succeeded
- ✅ `/usr/lib/jvm/java-17-openjdk-amd64`
- ✅ `/usr/local/bin/{terraform,snyk,aws,uv}`

### AMI tags (advertised contract)

The diagnostic tried to `aws ec2 describe-images` from the runner's instance
role and was denied:

```
aws: [ERROR]: An error occurred (UnauthorizedOperation) when calling the
DescribeImages operation: User: ...legacy-sports-dev-runner-runner-...
is not authorized to perform: ec2:DescribeImages
```

This is itself a finding: the AMI tags advertise a "contract" that **the
runner itself cannot read at job time**. Any drift-detection that needs to
cross-reference job-time observations against the AMI tags has to either
(a) add `ec2:DescribeImages` to the runner instance role (low cost, narrow
scope), or (b) embed the tag values into the AMI itself (e.g. write a
`/etc/legacy-sports-runner-version` file from Packer with the same K=V pairs
as the tag block, and have the diagnostic read that). **Option (b) is
preferred** — it makes the contract self-contained and survives the
instance role losing the permission.

## Drift instances (numbered for cross-reference)

| ID      | Drift                                                                                           | Symptom                                                                                                                          | Root cause                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Where surfaced                            |
| ------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| **D-1** | ~~`PLAYWRIGHT_BROWSERS_PATH` missing in non-login~~ **Fixed in LS-4948**                        | Playwright redownloads browsers per job (cache miss)                                                                             | `/etc/environment` is not loaded by the runner systemd unit (no `PAMName=`, no `EnvironmentFile=`). Now injected via the `ACTIONS_RUNNER_HOOK_JOB_STARTED` hook → `$GITHUB_ENV`.                                                                                                                                                                                                                                                                             | Env var presence table above              |
| **D-2** | ~~`JAVA_HOME` / `ANDROID_HOME` / `ANDROID_SDK_ROOT` missing in non-login~~ **Fixed in LS-4948** | Gradle/Android jobs fall back to action-managed Java/Android, slowing builds                                                     | The runner agent's `config.sh` clobbers `/opt/actions-runner/.env` at boot. LS-4902 / LS-4936 patches never reached a live runner. Now injected via the `ACTIONS_RUNNER_HOOK_JOB_STARTED` hook → `$GITHUB_ENV`.                                                                                                                                                                                                                                              | `/opt/actions-runner/.env` contents above |
| **D-3** | ~~`sdkmanager`, `adb`, Android build-tools `aapt2` not on non-login PATH~~ **Fixed in LS-4948** | Any direct invocation of these from a workflow step fails with "command not found"                                               | PATH additions live in `/etc/profile.d/android-sdk.sh` — login-only. Now forwarded to `$GITHUB_PATH` via the `ACTIONS_RUNNER_HOOK_JOB_STARTED` hook.                                                                                                                                                                                                                                                                                                         | Tool versions table above                 |
| **D-4** | ~~`pnpm` system binary is **11.3.0**, Packer pins **9.12.1**~~ **Fixed in LS-4949**             | Stale corepack activation. Workflows that rely on the AMI's pnpm (vs. running their own `corepack prepare`) get the wrong major. | Corepack shim at `/usr/bin/pnpm` resolved version from corepack's `lastKnownGood` state, which auto-upgraded via `COREPACK_DEFAULT_TO_LATEST` and/or apt-driven nodejs/corepack version bumps after the AMI bake. No system-wide corepack config existed to lock it. **Fixed in LS-4949**: pnpm now installed as a standalone release binary at `/usr/local/bin/pnpm` (bypasses corepack entirely; `/usr/local/bin` precedes `/usr/bin` on the runner PATH). | Tool versions table above                 |
| **D-5** | Live AMI ID differs from ticket-quoted AMI ID                                                   | The launch template currently points at `ami-046a766ca62496c37`, not the ticket's `ami-09604782c3c411107`                        | Either the LT was rolled forward after the ticket was written, or the ticket cites a stale AMI.                                                                                                                                                                                                                                                                                                                                                              | "Evidence" section above                  |
| **D-6** | Runner instance role can't read its own AMI tags                                                | The advertised AMI-tag "contract" is unverifiable from inside the runner                                                         | Missing `ec2:DescribeImages` on `legacy-sports-dev-runner-runner-*`                                                                                                                                                                                                                                                                                                                                                                                          | "AMI tags" subsection above               |

Pattern across D-1, D-2, D-3: **a value is written somewhere, but that
"somewhere" is not the surface the runner agent reads at job-step time.**
Phase 2 targets this class with a Packer-time assertion that simulates the
runner-agent shell context and fails the AMI build if the contract is broken.

**LS-4948 update:** D-1/D-2/D-3 are now fixed at the cloud-init layer
(`terraform/runners/github-runners.tf` → `runner_hook_job_started`). The
hook sources the existing Packer-baked `/etc/profile.d/*.sh` files at the
start of every job and forwards the resolved values to `$GITHUB_ENV` and
`$GITHUB_PATH`. No AMI rebuild was required — the fix lands on every new
runner boot after `terraform apply`. The reactive Packer-side `.env` writes
in LS-4902 / LS-4936 are now redundant; leaving them in place as a no-op
safety net rather than removing them in the same PR.

## Phase 2 — fix shape (this PR)

The most impactful drift class — **D-1 / D-2 / D-3, "Packer writes env to a
surface that doesn't reach jobs"** — is too large to fully fix in one PR
because the channel that _does_ reach jobs (runner agent .env, post-config)
is owned by the github-aws-runners terraform module, not by Packer. That
fix lands in a follow-up.

What we _can_ defensively land in this PR is the **assertion** that prevents
the same class of bug from recurring:

A new Packer post-provisioner (`verify-runner-env-contract`) simulates the
runner-agent's shell context — minimal PATH from `/etc/environment` only, no
`/etc/profile.d/*.sh` sourcing, no PAM-loaded env — and asserts:

1. Every Packer-tagged version (NodeVersion, PnpmVersion, PlaywrightVersion,
   TerraformVersion, DockerVersion, JdkMajor, GradleVersion, AndroidApiLevel)
   resolves to a binary or expected path **without** sourcing `/etc/profile`.
2. Any env var Packer claims to set for job-time consumption
   (`PLAYWRIGHT_BROWSERS_PATH`, `JAVA_HOME`, `ANDROID_HOME`) is present in
   the simulated env.
3. The AMI tag values match the corresponding Packer variable defaults
   (catches the case where someone bumps a `_version` variable but forgets
   the matching tag, or vice versa).

If any check fails, the AMI build fails with a clear message — the same
shape that catches LS-4902 / LS-4934 / LS-4936-style regressions at build
time instead of "the next CI failure".

This **does not** fix the existing D-1/D-2/D-3 drift on the currently-live
AMI (that requires the follow-up). It **does** mean any future Packer build
that tries to ship the same bug fails loudly. The assertion is the
single-source-of-truth check; the actual injection mechanism is the
follow-up's problem.

Follow-up tickets to file from this inventory:

- **D-1/D-2/D-3 channel fix**: replace `/etc/environment` and Packer
  `.env` writes with either (a) a runner pre-job hook
  (`ACTIONS_RUNNER_HOOK_JOB_STARTED`) that writes the env to `$GITHUB_ENV`,
  or (b) cloud-init append to `/opt/actions-runner/.env` _after_ the runner
  module's `config.sh` runs.
- **D-4 pnpm**: investigate why the live `pnpm --version` (11.3.0) differs
  from the Packer pin (9.12.1). Likely the Packer `corepack prepare` step
  needs to also write a system-wide pin (e.g. `/etc/corepack.json`) or
  workflows should stop relying on the AMI-baked pnpm and always provision
  via `corepack`.
- **D-5 AMI ID drift in ticket**: process-only — ensure ticket descriptions
  capture the live AMI at the moment of writing, or link to the launch
  template rather than a hardcoded AMI ID. **Landed in
  [LS-4950](https://bkrupa.atlassian.net/browse/LS-4950)**: see the "Citing
  Infrastructure Version Refs" section in
  [`.agents/skills/define/SKILL.md`](../../.agents/skills/define/SKILL.md)
  and the "Citing the AMI in Tickets and Docs" section in
  [`.agents/skills/infrastructure/references/ami-build.md`](../../.agents/skills/infrastructure/references/ami-build.md)
  for the canonical guidance and lookup snippet.
- **D-6 `ec2:DescribeImages` on runner role**: add the permission, OR embed
  AMI-tag values into a `/etc/legacy-sports-runner-version` file so the
  runner doesn't need IAM to read its own contract.
