# Self-hosted runner spot capacity (LS-10313)

The self-hosted pools (`ci-runner`, `ci-runner-android` — `terraform/runners/github-runners.tf`) are spot-only. This page records how the fleet is diversified against spot reclamation, what was deliberately left out, and the on-demand option that is **documented but not enabled**.

## Why

Reclamation arrives in storms, not as a steady trickle. CloudTrail `BidEvictedEvent` counts: **86 on 2026-09-22, 195 on 2026-09-29**, and 0–8 on other days. All 153 mid-job runner deaths that week were spot evictions (none came from the scale-down Lambda), 138 of them on 9-29 alone. Before this change the fleet could only land in **4 instance types × 2 AZs = 8 spot pools**, so one correlated reclamation emptied most of it.

## What changed (runners state only)

| Lever               | Before                                  | After                                                                            |
| ------------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| Instance types      | `m7a/m6a/m7i/m6i.xlarge`                | adds `r7a/r6a/r7i/r6i.xlarge` (32 GB, same 4 vCPU): 8 types                      |
| Allocation strategy | `capacity-optimized-prioritized`        | `price-capacity-optimized`                                                       |
| Launch-time ICE     | `ScaleError` → job waits for next retry | `enable_runner_on_demand_failover_for_errors = ["InsufficientInstanceCapacity"]` |
| Pools               | 8                                       | 16 (40 once the AZ follow-up below lands: 8 types × 5 AZs)                       |

Both pools share `var.github_runners_instance_types` and `var.github_runners_on_demand_failover_errors`, so they stay consistent.

**Type constraints** (enforced by review; see the comment on `github_runners_instance_types`):

- x86_64 only. The Ubuntu runner AMI is x64, so Graviton types are out unless the AMI gains arm64.
- ≥16 GB RAM (LS-8693: 8 GB types OOM-kill the test job).
- Exactly 4 vCPU. jest/nx size their worker count from vCPUs, so `c*.2xlarge` (8 vCPU / 16 GB) doubles the workers into the same RAM and brings back the LS-8693 OOM.
- No `m5`/`m5a`/`r5a`. `price-capacity-optimized` would favour them because they're cheapest, but they're older-generation and slower per job. No `m7i-flex` either: its burstable baseline doesn't suit sustained CI load.

All 8 types are offered in us-east-1a/b/c/d/f and in none of them in us-east-1e (`use1-az3`), as checked with `describe-instance-type-offerings` on 2026-09-30.

**Why `price-capacity-optimized`:** it first narrows to the pools with the deepest spare capacity (lowest interruption likelihood), then takes the cheapest of those. The r-family widens the set of pools the fleet can land in during a storm, but it doesn't take over steady-state spend. Under the old strategy the type priority order kept pulling launches back to the m-family pools the storms had emptied.

**On-demand failover scope:** it applies at **launch time only**. If `CreateFleet` returns `InsufficientInstanceCapacity` for a spot launch, the scale-up Lambda relaunches that request as on-demand (module `control-plane/src/aws/runners.ts` → `processFleetResult`). It doesn't protect a job whose instance is reclaimed mid-run, and it never converts a running instance. Cost exposure is limited to the minutes spot capacity is unavailable, and `runners_maximum_count` caps it. EC2 quota headroom: 512 vCPU on-demand standard vs 132 vCPU max fleet (33 runners × 4). Set the variable to `[]` to disable it.

## Follow-up: AZ spread (not in this change)

The runner subnets (`data.aws_subnets.public`, which come from `terraform/main` `aws_subnet.public`) cover only **us-east-1a and us-east-1b** (`var.availability_zones` in `terraform/main`). Adding us-east-1c/d/f takes three changes:

1. new runner-only public subnets in `terraform/main/vpc.tf`, associated with the public route table. Widening `var.availability_zones` itself would also resize the Lambda/DB subnets and route tables.
2. adding their CIDRs to `aws_security_group_rule.rds_from_ci_runners`. Since LS-10423 this is automatic: the rule is `for_each` over the `local.public_subnet_cidrs` and `local.runner_public_subnet_cidrs` locals in `vpc.tf`, one rule per CIDR, so new subnets only add rules. Never put the CIDRs back into one list-valued rule. A `cidr_blocks` change is destroy-then-create, and that is how the LS-10314 apply cut runners off from RDS.
3. granting the CI apply role `ec2:CreateSubnet` / `ec2:ModifySubnetAttribute` / `ec2:AssociateRouteTable` (plus the matching delete/disassociate actions). None of these actions exist in any CI policy today.

That's a different state, apply pipeline and blast radius, so it's tracked separately as **LS-10314**. The runners state picks up any new subnet named `<prefix>-public-*` automatically.

## Documented option: on-demand pool for lint/test/build (NOT enabled)

LS-8261 deferred on-demand capacity on cost. **Don't enable this without owner sign-off.**

**Shape:** a third `github-aws-runners` module instance (or the multi-runner variant) with `instance_target_capacity_type = "on-demand"`, a small `runners_maximum_count` (for example 4–6), and its own label (for example `ci-runner-ondemand`). The `lint`, `test` and `build` jobs of the CI Pipeline would move to that label; everything else stays on spot. It needs its own GitHub App, because one App has only one webhook URL, just as the Android pool does (LS-8910).

**Cost estimate** (us-east-1 Linux, 2026-09-30):

| Type         | Spot $/h (a/b/c/d/f range) | On-demand $/h | OD ÷ spot |
| ------------ | -------------------------- | ------------- | --------- |
| `m6a.xlarge` | 0.073–0.083                | 0.1728        | ~2.2×     |
| `m7a.xlarge` | 0.087–0.115                | 0.2318        | ~2.3×     |

Incremental monthly cost ≈ `share_of_runner_hours × current_spot_spend × (OD÷spot − 1)`. With current spend around $175–215/month (the `github-runners.tf` header estimate), and lint/test/build at 30–50% of runner-hours, that comes to roughly **+$60–150/month**. Measure the actual runner-hours share of those jobs before deciding. The launch-time failover that _is_ enabled costs close to nothing on days without a storm.

## Tracking (AC: eviction count for a week after apply)

After `runner-terraform-apply` runs, compare daily `BidEvictedEvent` counts against the baseline above:

```bash
aws cloudtrail lookup-events --region us-east-1 \
  --lookup-attributes AttributeKey=EventName,AttributeValue=BidEvictedEvent \
  --start-time <day>T00:00:00Z --end-time <day+1>T00:00:00Z \
  --query 'length(Events)'
```

The `aws_cloudtrail_lookup` MCP tool (`eventName: "BidEvictedEvent"`) can do the same lookup, but it caps at 50 events, so use the CLI for storm-day totals. A count of evictions alone doesn't show success. The real signal is **how many jobs die mid-run**, and that should fall even if AWS keeps reclaiming at the same rate, because fewer runners sit in any one pool.
