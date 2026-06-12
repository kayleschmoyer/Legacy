// packer-orphan-sweeper — LS-7875
//
// Scheduled Lambda that terminates orphaned Packer AMI-builder EC2 instances.
//
// Why this exists:
//   AMI builds (terraform/runners/packer/runner-ami.pkr.hcl) launch a temporary
//   on-demand c7a.xlarge build instance. Packer normally terminates it at the
//   end of the build, and LS-4921 added `run_tags` (Name = "Packer Builder ...")
//   so the runner-ami-builder IAM role can self-terminate FAILED builds via its
//   tag-scoped ec2:TerminateInstances permission.
//
//   That safety net has a hole: Packer applies `run_tags` via a CreateTags call
//   AFTER RunInstances, so there is a window where the instance exists but is
//   untagged. If the build HOST (a self-hosted runner) is killed in that window
//   — exactly the scale-down race in LS-7870 — the instance is left running,
//   never tagged, and therefore un-reapable by the Name-scoped cleanup. We found
//   one such orphan (i-0574f935...) running on-demand for ~2 weeks (~$123/mo).
//
//   The one signal ALWAYS present on a Packer builder is its temporary key pair,
//   named `packer_<uuid>` and set atomically at RunInstances. This sweeper keys
//   off that: any instance with a `packer_*` key older than MAX_AGE_MINUTES is an
//   orphan (the build workflow has a 25-minute timeout, so a 2h cutoff cannot
//   catch a legitimately in-flight build). Before terminating, it stamps the
//   Name tag the IAM policy expects so the tag-scoped TerminateInstances permits
//   the call.
//
// Packaging: zero runtime dependencies. `@aws-sdk/client-ec2` ships with the
// nodejs20.x Lambda runtime, so this file is zipped as-is via data.archive_file
// (terraform/runners/packer-orphan-sweeper.tf) — no bundling step. (Plain
// `console` logging is used deliberately: importing @legacy-sports/logging would
// drag the monorepo dependency graph into what must stay a single-file zip.)

import {
  CreateTagsCommand,
  DescribeInstancesCommand,
  EC2Client,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2';

const ec2 = new EC2Client({});

// Builder key pairs are always named `packer_<uuid>` (Packer's temporary key).
const PACKER_KEY_PREFIX = 'packer_';
// The Name value the runner-ami-builder IAM TerminateInstances condition matches
// ("Packer Builder*"). We stamp it before terminating so an UNTAGGED orphan
// becomes eligible for termination under the same tag-scoped policy.
const REAP_NAME_TAG = 'Packer Builder - orphan-sweep-reaped';

function log(level, message, fields = {}) {
  // Structured single-line JSON so CloudWatch Logs Insights can filter on fields.
  console.log(JSON.stringify({ level, message, ...fields }));
}

export const handler = async () => {
  const maxAgeMinutes = Number(process.env.MAX_AGE_MINUTES ?? '120');
  const dryRun = process.env.DRY_RUN === 'true';
  const now = Date.now();
  const cutoffMs = now - maxAgeMinutes * 60_000;

  const scanned = [];
  const reaped = [];
  const failures = [];
  let nextToken;

  do {
    const page = await ec2.send(
      new DescribeInstancesCommand({
        // key-name supports `*` wildcards; restrict to non-terminated states so a
        // single sweep also clears stopped/stopping leftovers.
        Filters: [
          {
            Name: 'instance-state-name',
            Values: ['pending', 'running', 'stopping', 'stopped'],
          },
          { Name: 'key-name', Values: [`${PACKER_KEY_PREFIX}*`] },
        ],
        NextToken: nextToken,
      }),
    );

    for (const reservation of page.Reservations ?? []) {
      for (const instance of reservation.Instances ?? []) {
        const id = instance.InstanceId;
        const keyName = instance.KeyName ?? '';
        const launchMs = instance.LaunchTime
          ? new Date(instance.LaunchTime).getTime()
          : 0;
        const ageMinutes = launchMs
          ? Math.round((now - launchMs) / 60_000)
          : null;

        // Defense in depth: the filter should already guarantee this, but never
        // act on an instance whose key is not a Packer builder key.
        if (!keyName.startsWith(PACKER_KEY_PREFIX)) {
          continue;
        }

        scanned.push({ id, keyName, ageMinutes });

        if (!launchMs || launchMs > cutoffMs) {
          log('info', 'skip: builder younger than cutoff', {
            id,
            keyName,
            ageMinutes,
            maxAgeMinutes,
          });
          continue;
        }

        if (dryRun) {
          log('warn', 'DRY_RUN: would reap orphaned Packer builder', {
            id,
            keyName,
            ageMinutes,
          });
          reaped.push({ id, keyName, ageMinutes, dryRun: true });
          continue;
        }

        try {
          // Stamp the Name tag the IAM TerminateInstances condition matches.
          await ec2.send(
            new CreateTagsCommand({
              Resources: [id],
              Tags: [{ Key: 'Name', Value: REAP_NAME_TAG }],
            }),
          );
          await ec2.send(new TerminateInstancesCommand({ InstanceIds: [id] }));
          log('warn', 'reaped orphaned Packer builder', {
            id,
            keyName,
            ageMinutes,
          });
          reaped.push({ id, keyName, ageMinutes });
        } catch (err) {
          log('error', 'failed to reap orphaned Packer builder', {
            id,
            keyName,
            ageMinutes,
            error: err instanceof Error ? err.message : String(err),
          });
          failures.push({
            id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    nextToken = page.NextToken;
  } while (nextToken);

  const summary = {
    scannedCount: scanned.length,
    reapedCount: reaped.length,
    failureCount: failures.length,
    maxAgeMinutes,
    dryRun,
    reaped,
  };
  log('info', 'packer-orphan-sweeper complete', summary);

  // Surface failures so the invocation is marked errored (and alarms can fire)
  // without leaving successfully-reaped instances un-acted-on.
  if (failures.length > 0) {
    throw new Error(
      `packer-orphan-sweeper: ${failures.length} instance(s) failed to terminate: ${failures
        .map((f) => f.id)
        .join(', ')}`,
    );
  }

  return summary;
};
