# Bug Fixes & Incident Documentation

Records of production issues, root-cause analyses, and the fixes applied. Use these as reference when encountering similar problems.

## Contents

### Connection & Database

- **[Connection Pool Complete Fix](connection-pool-complete-fix.md)** - Full connection pool overhaul
- **[Connection Pool Exhaustion Fix](connection-pool-exhaustion-fix.md)** - Diagnosing and fixing pool exhaustion
- **[Resolver Connection Pooling Fix](resolver-connection-pooling-fix.md)** - GraphQL resolver connection sharing
- **[Resolver Update Instructions](resolver-update-instructions.md)** - Steps to update resolvers after pool fix
- **[Service Layer DB Parameter](service-layer-db-parameter.md)** - Passing DB clients through service layers
- **[LS-138 Missing Database Indexes](LS-138-missing-database-indexes.md)** - Adding missing indexes for query performance

### Game & Draft Logic

- **[Game Selection Queued State](game-selection-queued-state.md)** - Fix for stuck queued game selections
- **[Matchup Status Premature Completion](matchup-status-premature-completion.md)** - Matchups completing too early

### Infrastructure

- **[Terraform Lock Management Fix](terraform-lock-management-fix.md)** - Handling stale Terraform state locks
- **[Terraform Lock Release Fix (2026-02-11)](terraform-lock-release-fix-2026-02-11.md)** - Emergency lock release procedure
- **[Deployment Automation Fixes (2026-02-04)](deployment-automation-fixes-2026-02-04.md)** - CI/CD deployment pipeline repairs

### Windows / Developer Experience

- **[LS-102 Summary](LS-102-SUMMARY.md)** - Overview of the LS-102 console flashing investigation
- **[LS-102 Testing Protocol](LS-102-testing-protocol.md)** - Reproduction and verification steps
- **[LS-102 Windows Console Flashing Fix](LS-102-windows-console-flashing-fix.md)** - Root cause and resolution

---

[← Back to Documentation Hub](../README.md)
