# The Legacy Sports CLI

> Loaded from [dev-environment SKILL](../SKILL.md).

## The Legacy Sports CLI

Admin, data-loading, and debugging commands live in one Commander program: `apps/cli/src/main.ts`. Full catalog (all commands, grouped by task, with options): [references/cli-commands.md](cli-commands.md).

### Invocation per environment

| Environment              | Command                                           | Notes                                                                            |
| ------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Windows PowerShell       | `.\ls-cli.ps1 <command> [options]`                | Sets a 4 GB Node heap for large player loads                                     |
| Linux / macOS / Git Bash | `./ls-cli.sh <command> [options]`                 | Both wrappers run `tsx` directly — need `node_modules/.bin/tsx` (`make install`) |
| Docker stack             | `docker compose run --rm cli <command> [options]` | No local Node env needed; runs against the compose postgres                      |
| Nx                       | `pnpm exec nx start cli -- <command> [options]`   | Equivalent; `--` separates CLI args from nx args                                 |
| pnpm shortcuts           | `pnpm run cli:<name>`                             | Only a subset is registered in root `package.json` `scripts`                     |

### Recovery / admin quick reference

| Situation                                            | Command                                                                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft finished but matchups never generated          | `./ls-cli.sh unblock-league --id <leagueId>`                                                                                                                         |
| Player stats stuck in failed state                   | `./ls-cli.sh retry-failed-players --dry-run` then without `--dry-run`                                                                                                |
| Leaked E2E/integration test leagues                  | `./ls-cli.sh cleanup-test-leagues --dry-run`                                                                                                                         |
| Leaked `int-*@test.legacysports.dev` users (LS-4917) | `./ls-cli.sh cleanup-test-users --dry-run`                                                                                                                           |
| Same person with two accounts (LS-7821)              | `./ls-cli.sh find-duplicate-accounts` → `merge-accounts --dry-run`                                                                                                   |
| Grant a user admin                                   | `./ls-cli.sh set-user-type --email <email> --type admin` — runbook: [docs/operations/promote-user-to-admin.md](../../../../docs/operations/promote-user-to-admin.md) |

Destructive commands (`reset-database`, `delete-league`, `merge-accounts`, `cleanup-*`) require an explicit `--confirm`/`--yes` flag and support `--dry-run` where listed — always dry-run first. More oncall runbooks: [docs/operations/](../../../../docs/operations/README.md).
