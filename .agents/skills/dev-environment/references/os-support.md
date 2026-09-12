# OS Support Matrix — Run-and-Operate Targets

> Loaded from [dev-environment SKILL](../SKILL.md).

## OS support matrix (run-and-operate targets)

| Target                                | Windows | Linux/macOS | Notes                                                                                                                                                   |
| ------------------------------------- | ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `make install` / `dev*` / `docker-up` | ✅      | ✅          | `install` routes to the modules-pool linker on Windows                                                                                                  |
| `make sync-env`                       | ✅      | ✅          | `.ps1` on Windows, `.sh` elsewhere; both need AWS creds                                                                                                 |
| `make kill-stale`                     | ✅      | ⛔ stub     | Prints "Windows-only"; on Linux, kill your background shells instead                                                                                    |
| `make db-restore-dev` / `db-dump-dev` | ✅      | ⛔ stub     | PowerShell scripts; prints a Windows-only message elsewhere                                                                                             |
| `make db-tunnel`                      | ⛔ stub | ✅          | Prints "requires bash" whenever `OS=Windows_NT` (even under Git Bash); use WSL, or the hosted `db_query` MCP tool ([database](../../database/SKILL.md)) |
| `scripts/db-query.ps1`                | ✅      | ⛔          | Data queries against dev RDS; cross-platform alternative: `ls-cli query-db` or the hosted `db_query` MCP tool ([database](../../database/SKILL.md))     |
| `pnpm run dev:web` wrapper            | ✅      | ⛔          | Plain `make dev-web` works everywhere                                                                                                                   |
