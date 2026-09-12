# pg_stat_statements Reporting — Known-Noise Allowlist

> Loaded from [cloudwatch-archaeology SKILL](../SKILL.md).

## pg_stat_statements Reporting — Known-Noise Allowlist

When ranking the dev/prod RDS by `pg_stat_statements.total_exec_time` (the snapshot query in LS-4687), some of the top-call-count rows are **infrastructure probes, not application queries**. They are 0–1 ms per call, have no actionable per-call performance issue, and exist only to dominate the call-count column. Filter them out before drawing conclusions about app workload.

Append the following predicate to the standard top-20 snapshot query:

```sql
AND query NOT ILIKE '%current_setting%pg_postmaster_start_time%'  -- RDS Proxy session-pinning probe (LS-4699)
```

| Pattern (substring `ILIKE` match)              | Origin                                                                                                                                                                                           | Why it's noise                                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `current_setting … pg_postmaster_start_time()` | RDS Proxy session-pinning / health-check probe. Fires when the proxy hands a backend connection to a new client session to determine whether the client's `SET` state forces connection pinning. | 0.33 ms mean, ~2.7M calls observed on 2026-05-21 (queryid `4396094900050806745`). Volume is a function of client connection churn, not app behavior. Tuning `IdleClientTimeout` on the proxy parameter group can reduce call volume. |

When proposing fixes from a `pg_stat_statements` report, **explicitly skip allowlisted patterns** and call out the skip in the ticket — do not file remediation tickets against them. If a new infrastructure probe shows up that fits the same shape (very high call count, sub-millisecond mean, query references `pg_*` introspection functions or `current_setting`), add it here rather than filing a remediation ticket.
