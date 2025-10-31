# Custom Scoring Rollout Plan

This guide coordinates the production release of the Custom Fantasy Baseball Scoring Platform. It covers the operational sequence, observability guardrails, and communication work needed to launch the LS-6 epic safely.

## Scope And Owners

- **Release window**: coordinate with the weekly Tuesday 10:00 ET maintenance window; avoid live scoring hours.
- **Primary owners**: Core Platform (deployment + database), League Experience (app + GraphQL), Customer Support (communications + incident response).
- **Systems touched**: PostgreSQL (`league_scoring_*` tables, `scoring_stat_definitions`), `lambdas/db` GraphQL resolvers, `apps/web` scoring views, projections workers, and admin tooling.

## Deployment Checklist

> Run all commands from the repository root in PowerShell. Use the Nx targets in sequence: `npx nx affected -t typecheck; npx nx affected -t lint --fix; npx nx affected -t test; npx nx affected -t build` before packaging artifacts.

1. **Freeze change window**
   - Announce code freeze to LS release Slack channel 24 hours prior.
   - Ensure no unrelated database migrations are queued in `scripts/run-migrations.ps1` manifests.
2. **Database migrations**
   - Review pending migrations in `libs/db-client/migrations` and confirm `league_scoring_profiles` default seeds align with [docs/architecture/database-schema.md](../architecture/database-schema.md#league-scoring-profiles).
   - Execute `scripts/run-migrations.ps1 -Stage prod` during the window; capture transcript to `\fileshare\launches\ls6\migration.log`.
   - Validate seed backfill script `scripts/add-project-tags.js` is not scheduled concurrently.
3. **Backfill scoring defaults**
   - Run `npx nx run data-loaders:seed-scoring-defaults --configuration=prod` to populate new leagues without overrides.
   - Verify `league_scoring_change_log` captures inserted rows by querying `SELECT COUNT(*) FROM league_scoring_change_log WHERE created_at > NOW() - INTERVAL '5 minutes';` via `scripts/run-migrations.ps1 -Stage prod -Script ".\scripts\sql\scoring_backfill_verification.sql"`.
4. **Deploy services**
   - Package Lambdas with `npx nx run lambdas-db:package --configuration=prod`.
   - Apply infrastructure with `./scripts/deploy-lambda-all.ps1 -Environment prod -Service db` and confirm success in the console output.
   - Redeploy projections worker (`npx nx run lambdas-projections:deploy --configuration=prod`) so cached multipliers refresh.
5. **Smoke validation**
   - Run `npx nx run cli:scoring-check --configuration=prod --league=*` to confirm APIs return merged defaults.
   - Hit `/graphql` `leagueScoringProfile` query for a canary league and compare response versus baseline fixture.
   - Open `apps/web` staging canary league and ensure projected points render without errors.
6. **Runbook updates**
   - Append production timestamps and SQL verification outputs to `\fileshare\launches\ls6\rollout-checklist.md`.
   - Notify #release-notes that rollout checklist is complete.

## Observability Plan

### Logging

- **Lambda structured logs**: ensure `lambdas/db/src/services/scoring/ScoringService.ts` emits `scoring.config.load` events with `leagueId`, `defaultProfileId`, and `overrideProfileId` for every request.
- **Migration log**: archive `migration.log` artifact to S3 bucket `ls-ops-artifacts-prod` under `scoring/` prefix for 30-day retention.
- **Client warnings**: enable console warn hooks in `apps/web/src/providers/LeagueScoringProvider.tsx` to log `missing-default-config` when GraphQL returns null multipliers.

### Metrics

- **CloudWatch Metric Filters**:
  - `ScoringMissingConfigCount`: count `scoring.config.load status="missing_default"` per 5 minutes; alert threshold >= 1.
  - `ScoringProjectionFallbackCount`: monitor projections worker fallback path via `projection.scoring.fallback` log key; threshold >= 5 per 15 minutes.
- **RDS Performance Insights**: add watch on `league_scoring_profile_entries` read latency; alert if p95 > 50ms for 2 consecutive intervals.

### Alerts

- Route new alarms to `LS On-Call` PagerDuty service with runbook link `https://confluence.legacysports.io/runbooks/scoring-config-missing`.
- Add temporary Slack alert to `#ops-scoring` for the rollout week mirroring PagerDuty notifications.

## Stakeholder Communication

| Audience              | Channel                           | Timing  | Message Owner            | Notes                                                       |
| --------------------- | --------------------------------- | ------- | ------------------------ | ----------------------------------------------------------- |
| Internal release team | `#release-notes` Slack            | T-24h   | Core Platform lead       | Include freeze window and checklist link                    |
| Customer Support      | `#customer-support` Slack + email | T-6h    | Customer Support manager | Provide FAQ on scoring changes and escalation matrix        |
| League commissioners  | In-app banner + scheduled email   | T-2h    | League Experience PM     | Highlight new scoring defaults, link to help center article |
| Executives            | Weekly status deck                | T+1 day | Product Operations       | Summarize launch status, metrics, incident log              |

### Communication Assets

- **Help Center article**: Zendesk KB-104 "Custom Fantasy Scoring" (ensure screenshots updated before T-6h).
- **Incident playbook**: `docs/security/security-incident-playbook.md` appendix with scoring-specific steps.
- **Status page**: pre-authorize maintenance banner on `status.legacysports.io` with template "Deploying custom scoring defaults; scoring projections may be delayed for 15 minutes.".

## Post-Launch Monitoring

1. Track `ScoringMissingConfigCount` and `ScoringProjectionFallbackCount` for 48 hours; log findings in `\fileshare\launches\ls6\monitoring.md`.
2. Collect support ticket volume tagged `scoring` every 12 hours; escalate spikes > 3 tickets/hour to on-call.
3. Schedule retrospective within one week with Core Platform, League Experience, and Support to document improvements and update this plan.
