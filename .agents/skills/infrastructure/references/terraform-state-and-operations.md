# Terraform Operations & State Management Reference

## Common Terraform Operations

### View Resources

```powershell
# List all resources
terraform state list

# Show specific resource
terraform state show aws_lambda_function.db

# Show outputs
terraform output
```

### Import Existing Resources

```powershell
# Import existing AWS resource to state
terraform import aws_lambda_function.db legacy-sports-dev-db

# Import with -target
terraform import -target=aws_lambda_function.db aws_lambda_function.db legacy-sports-dev-db
```

### Refresh State

```powershell
# Update state from AWS (no changes)
terraform refresh

# Refresh specific resource
terraform refresh -target=aws_lambda_function.db
```

## Terraform State Management

### State Location

- **Remote**: S3 bucket (configured in backend.tf)
- **Lock**: DynamoDB table for locking
- **Local**: `.terraform/` directory (gitignored)

### State Commands

```powershell
# List resources
terraform state list

# Remove resource from state (doesn't destroy)
terraform state rm aws_lambda_function.old

# Move resource in state
terraform state mv aws_lambda_function.old aws_lambda_function.new
```

## Terraform File Structure

```
terraform/
├── main.tf              # Main configuration
├── variables.tf         # Input variables
├── outputs.tf           # Output values
├── backend.tf           # Remote state configuration
├── versions.tf          # Terraform version constraints
├── lambda-*.tf          # Lambda configurations
├── database.tf          # Database resources
├── networking.tf        # VPC, subnets, etc.
└── security.tf          # Security groups, IAM
```

## Sensitive Resources

**Extra caution needed**:

- **Database** - Don't destroy accidentally
- **State bucket** - Contains all state
- **IAM roles** - Can break access
- **Lambdas** - Can disrupt service
- **API Gateway** - Can break API

## State-serial assertion (LS-9966)

### Incident

During the LS-9877 slice-4 apply (PR #7740, `LS-9933`), `lambda-terraform-apply.yml` re-replaced 23 IAM policies/attachments that a slice-3 apply (PR #7739, `LS-9932`) had **already** applied roughly 15 minutes earlier — with no wall-clock overlap between the two runs' `Apply Infrastructure Changes` steps. The end state converged correctly (no orphaned resources — `create_before_destroy` on both the policy and its attachment did its job), but Terraform did a full extra destroy+create cycle on resources that were already correct, purely because the plan it applied was computed against a state view that didn't yet reflect the immediately-preceding apply.

### Why "S3 eventual consistency" is not the mechanism

The original hypothesis was S3 backend read-after-write lag on the state file. That doesn't hold up under inspection:

- `terraform/main/main.tf`'s `backend "s3"` block sets `use_lockfile = true` — Terraform's **S3-native lock**, implemented as a conditional `PutObject` on a `.tflock` marker (a real mutex), not the legacy DynamoDB table. `terraform plan` and `terraform apply` both acquire this lock before touching state.
- AWS S3 has provided **strict read-after-write consistency for all operations, in all regions**, since December 2020 — a `GetObject` immediately following a completed `PutObject` cannot observe a stale version. There is no window where S3 itself serves old data after a confirmed write.

So a purely sequential apply → (lock released, state durably written) → later plan → (lock acquired, state read) can't see stale data from S3's side. If the ticket's timestamps are accurate (no overlap in the apply steps), the state view was wrong for some other reason — most likely something in the workflow's own concurrency model (this workflow is invokable both via `workflow_call` from `deploy.yml` **and** via a separate `workflow_run` off "Upload Lambdas" completing; both funnel into the same `concurrency: group: terraform-lambda-infrastructure`, but a burst of merges close together can still produce more plan/apply attempts in flight than the single-apply-step timestamps make visible) rather than an S3 consistency lag. This investigation did not have access to the actual run logs for the two applies (the CI log MCP server was unavailable this session) to pin the exact interleaving down further.

### The guard

Regardless of the exact interleaving that produced the LS-9877 incident, the workflow had **zero protection** against the state changing out from under a run between when it plans and when it applies — contrast with the existing SSM-lambda-version race guard (`Re-check SSM Versions After Plan` / `Re-plan if Versions Changed` in the same workflow), which exists precisely because that race is expected and already guarded.

LS-9966 adds the equivalent guard for the state file itself, in `.github/workflows/lambda-terraform-apply.yml`:

1. **`Plan Infrastructure Changes`** (and **`Re-plan if Versions Changed`**, when it runs) end with `terraform state pull`, capturing the state's `serial` and `lineage` as step outputs — the identity of the exact state the just-written `tfplan` file is valid for.
2. **`Verify State Serial Before Apply`** (new step, runs immediately before `Apply Infrastructure Changes`) re-pulls state and compares `serial`+`lineage` against whichever of the two capture points ran most recently. A mismatch means another apply wrote to the backend in that window — the step fails loudly (`exit 1`) instead of letting a stale `tfplan` apply, and the job's existing `Cleanup on Failure` step still releases the lock.
3. `Apply Infrastructure Changes` now also requires `steps.verify-serial.outcome == 'success'`.

This does not lean on any assumption about S3 consistency — it directly asserts the one invariant that matters (this run's plan and apply agree on which state they're operating against) and fails loudly rather than silently re-applying, per the LS-9966 acceptance criteria. Terraform's own built-in "saved plan is stale" check already covers a stale-lineage/serial mismatch **at apply time within a single command**; this guard covers the wider, previously-unguarded gap between the plan **step** and the apply **step** in this specific CI workflow.
