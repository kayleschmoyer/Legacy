# Runner Operations

How to diagnose and recover self-hosted CI runners, rotate the GitHub App key, and verify runner health.

## Architecture

Runners are event-driven, not ASG-based. When a `workflow_job` webhook fires:

1. GitHub → API Gateway → `legacy-sports-dev-runner-webhook` Lambda → SQS
2. `legacy-sports-dev-runner-scale-up` Lambda reads from SQS and calls `ec2:RunInstances` using the launch template
3. The new EC2 instance boots, registers with GitHub, picks up the job
4. `legacy-sports-dev-runner-scale-down` Lambda terminates idle instances on a CloudWatch schedule

The SSM path `/github-action-runners/legacy-sports-dev-runner/` holds all runtime config. The GitHub App credentials under `.../app/` are what the scale-up Lambda uses to register new runner instances.

### Scale-down: job heartbeat

The `scale-down` Lambda is a **patched** build of the upstream control-plane bundle (see `terraform/runners/lambda-patches/`). The design and its evolution are recorded in [ADR 0013 — Runner survival via a runner-level job heartbeat](../../../../docs/decisions/0013-runner-job-heartbeat.md). A single guard stops it from reclaiming a runner that is mid-job when GitHub's `busy` flag intermittently reads false:

- **Job heartbeat (LS-7874 / LS-7877)** — while **any** self-hosted job runs, the runner-level job hooks (`ACTIONS_RUNNER_HOOK_JOB_STARTED`/`COMPLETED`, wired through the runner userdata in `terraform/runners/github-runners.tf`) tag **its own** instance `ghr:job_heartbeat=<unix-seconds>` once a minute and delete the tag when the job ends. While that tag is fresher than `SCALE_DOWN_HEARTBEAT_TTL_SECONDS` (default 180) the Lambda treats the runner as active and skips removal. Because the heartbeat lives at the runner level it covers every self-hosted job (integration, e2e shards, the android build) automatically — no per-workflow steps. A genuinely idle runner emits no heartbeat (the hooks only run during a job), so scale-to-zero still works.

> The earlier **idle-strike debounce** (LS-7870, `ghr:idle_strikes` / `SCALE_DOWN_IDLE_STRIKES`) was retired in LS-7877 once the runner-level heartbeat covered every self-hosted job. There is no longer an `idle_strikes` tag.

**On-call note:** if an instance **won't scale down** after its job finished, check for a stale `ghr:job_heartbeat` tag — `aws ec2 describe-tags --filters "Name=resource-id,Values=<i-…>"`. A genuinely-finished runner's heartbeat goes stale within the TTL and is then reaped normally; the `job_completed` hook also deletes the tag on job exit. The TTL defaults in the Lambda code (the upstream module's env block is fixed); set `SCALE_DOWN_HEARTBEAT_TTL_SECONDS=0` to disable the heartbeat override.

## Diagnosing Runners Offline

When jobs are stuck in `queued` and all runners show `offline` in GitHub (Settings → Actions → Runners):

### 1. Check the scale-up Lambda logs

```bash
python3 -c "
import subprocess, json, time
start = int((time.time() - 3600) * 1000)
result = subprocess.run([
    'aws', 'logs', 'filter-log-events',
    '--log-group-name', '/aws/lambda/legacy-sports-dev-runner-scale-up',
    '--start-time', str(start),
    '--filter-pattern', 'ERROR',
    '--region', 'us-east-1',
    '--output', 'json'
], capture_output=True, text=True)
for e in json.loads(result.stdout).get('events', []):
    print(e['message'][:300])
"
```

### 2. Check the SQS queue depth

```bash
python3 -c "
import subprocess, json
r = subprocess.run([
    'aws', 'sqs', 'get-queue-attributes',
    '--queue-url', 'https://sqs.us-east-1.amazonaws.com/176661590736/legacy-sports-dev-runner-queued-builds',
    '--attribute-names', 'All',
    '--region', 'us-east-1', '--output', 'json'
], capture_output=True, text=True)
attrs = json.loads(r.stdout)['Attributes']
print('Messages:', attrs.get('ApproximateNumberOfMessages'))
print('In-flight:', attrs.get('ApproximateNumberOfMessagesNotVisible'))
"
```

### 3. Check running EC2 instances

```bash
python3 -c "
import subprocess, json
r = subprocess.run([
    'aws', 'ec2', 'describe-instances',
    '--filters', 'Name=instance-state-name,Values=running,pending',
    '--query', 'Reservations[].Instances[].{Id:InstanceId,State:State.Name,Name:Tags[?Key==\`Name\`]|[0].Value}',
    '--output', 'json', '--region', 'us-east-1'
], capture_output=True, text=True)
for i in json.loads(r.stdout):
    print(i)
"
```

### Common error patterns

| Error in Lambda logs                           | Cause                                                                            | Fix                                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `error:1E08010C:DECODER routines::unsupported` | `github_app_key_base64` SSM param contains raw PEM instead of base64-encoded PEM | See [Rotating the GitHub App Key](#rotating-the-github-app-key)                                   |
| `RequestExpired` / `AuthFailure`               | GitHub App token expired or App permissions revoked                              | Regenerate the private key in GitHub App settings and rotate (see below)                          |
| `No instances launched`                        | No matching AMI found for the launch template filter                             | Run `make ami-build` or trigger the **Rebuild Runner AMI** workflow                               |
| Lambda not firing at all                       | Webhook not reaching API Gateway                                                 | Check webhook deliveries in GitHub App settings; verify `legacy-sports-dev-runner-webhook` Lambda |

---

## Rotating the GitHub App Key

> **Critical**: the SSM parameter is named `github_app_key_base64` and must contain the PEM key **base64-encoded**. Storing the raw PEM directly causes an OpenSSL decoder crash on every scale-up invocation — runners silently stop spawning.

### Step 1 — Generate a new private key

In the GitHub App settings (Settings → Developer settings → GitHub Apps → your app → Private keys), click **Generate a private key**. Download the `.pem` file.

### Step 2 — Base64-encode and upload to SSM

Save the `.pem` file to a local path (e.g. `~/Downloads/app.pem`), then:

```bash
python3 -c "
import subprocess, base64

with open('/path/to/app.pem', 'rb') as f:
    encoded = base64.b64encode(f.read()).decode('utf-8')

# Sanity check — should start with 'LS0t' (base64 of '---')
assert encoded.startswith('LS0t'), 'Encoding error: expected base64 of PEM'
print('Encoded length:', len(encoded), '— looks correct')

result = subprocess.run([
    'aws', 'ssm', 'put-parameter',
    '--name', '/github-action-runners/legacy-sports-dev-runner/app/github_app_key_base64',
    '--value', encoded,
    '--type', 'SecureString',
    '--overwrite',
    '--region', 'us-east-1',
    '--output', 'json'
], capture_output=True, text=True)
print(result.stdout)
print(result.stderr)
"
```

The assertion (`startswith('LS0t')`) is a cheap sanity check: `LS0t` is the base64 encoding of `---`, which is how every PEM header starts.

### Step 3 — Verify the fix

Wait ~60 seconds for the Lambda to pick up the new SSM value (Lambda caches SSM via the AWS Parameters and Secrets Lambda extension or SDK-level caching). Then check for errors:

```bash
python3 -c "
import subprocess, json, time
start = int((time.time() - 120) * 1000)
result = subprocess.run([
    'aws', 'logs', 'filter-log-events',
    '--log-group-name', '/aws/lambda/legacy-sports-dev-runner-scale-up',
    '--start-time', str(start),
    '--filter-pattern', 'ERROR',
    '--region', 'us-east-1', '--output', 'json'
], capture_output=True, text=True)
events = json.loads(result.stdout).get('events', [])
print(f'Errors in last 2 min: {len(events)}')
"
```

### Step 4 — Trigger a job to confirm runners launch

Re-run a queued CI workflow or push a trivial commit. Watch for `Created instance(s): i-xxx` in the scale-up Lambda logs:

```bash
python3 -c "
import subprocess, json, time
start = int((time.time() - 300) * 1000)
result = subprocess.run([
    'aws', 'logs', 'filter-log-events',
    '--log-group-name', '/aws/lambda/legacy-sports-dev-runner-scale-up',
    '--start-time', str(start),
    '--filter-pattern', 'Created instance',
    '--region', 'us-east-1', '--output', 'json'
], capture_output=True, text=True)
for e in json.loads(result.stdout).get('events', []):
    print(e['message'][:200])
"
```

Runners will appear as `online` in GitHub within ~2 minutes of instance launch.

---

## Bootstrap Catch-22: Apply Runner Infrastructure

The `runner-terraform-apply.yml` workflow must run on `ubuntu-latest` (GitHub-hosted), **not** on `ci-runner` (self-hosted). This is intentional: if it ran on self-hosted runners, a complete runner outage would make it impossible to recover via CI.

The `CI_RUNNER_LABEL` repo variable controls which runner label most workflows use. `runner-terraform-apply.yml` hardcodes `ubuntu-latest` specifically to avoid this catch-22 (LS-4255).

If the Terraform apply job is stuck in `queued`, check that `runs-on` in `.github/workflows/runner-terraform-apply.yml` is set to `ubuntu-latest` and not `${{ vars.CI_RUNNER_LABEL }}`.

---

## Verifying Runner Health End-to-End

```bash
# 1. Check GitHub runner registrations
gh api repos/bkrupa/legacy-sports/actions/runners | python3 -c "
import json, sys
runners = json.load(sys.stdin)['runners']
online = [r for r in runners if r['status'] == 'online']
offline = [r for r in runners if r['status'] == 'offline']
print(f'Online: {len(online)}  Offline: {len(offline)}')
for r in online:
    print(f'  {r[\"name\"]}  busy={r[\"busy\"]}')
"

# 2. Check EC2 instances
aws ec2 describe-instances \
  --filters 'Name=instance-state-name,Values=running' \
  --query 'Reservations[].Instances[].{Id:InstanceId,Launch:LaunchTime}' \
  --output table --region us-east-1

# 3. Check for recent scale-up activity
python3 -c "
import subprocess, json, time
start = int((time.time() - 600) * 1000)
r = subprocess.run([
    'aws', 'logs', 'filter-log-events',
    '--log-group-name', '/aws/lambda/legacy-sports-dev-runner-scale-up',
    '--start-time', str(start),
    '--filter-pattern', 'Created instance',
    '--region', 'us-east-1', '--output', 'json'
], capture_output=True, text=True)
events = json.loads(r.stdout).get('events', [])
print(f'Instances launched in last 10 min: {len(events)}')
"
```
