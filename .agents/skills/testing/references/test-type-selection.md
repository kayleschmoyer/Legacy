# Test Type Selection and File Naming

> Loaded from [testing SKILL](../SKILL.md). Scenario→layer decision table and the file-naming convention for each test type.

## Quick Decision Table

| Scenario                                          | Unit | DB  | E2E | Integration |
| ------------------------------------------------- | ---- | --- | --- | ----------- |
| Pure function / utility logic                     | x    |     |     |             |
| FK constraint or schema default enforced          |      | x   |     |             |
| Cascade delete works correctly in DB              |      | x   |     |             |
| Draft pick state machine correctness              |      | x   |     |             |
| React component renders correctly with known data |      |     | x   |             |
| Empty/loading/error states                        |      |     | x   |             |
| Button disabled when input empty                  |      |     | x   |             |
| Data written to DB and visible to another user    |      |     |     | x           |
| Role-based access verified against real identity  |      |     |     | x           |
| Multi-step workflow across multiple users         |      |     |     | x           |
| Backend async processes complete correctly        |      |     |     | x           |

## File Naming Convention

| Test Type                           | File Pattern                                                     | Example                             |
| ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| Unit test                           | `*.spec.ts`                                                      | `scoring.spec.ts`                   |
| DB integration (Jest + PostgreSQL)  | `*.db.spec.ts` in `lambdas/db/src/schema/`                       | `leagues.db.spec.ts`                |
| Mocked E2E (Playwright)             | `*.spec.ts` in `apps/web-e2e/src/tests/`                         | `league-overview.spec.ts`           |
| Full-stack integration (Playwright) | `*.integration.spec.ts` in `apps/web-e2e/src/integration/tests/` | `live-draft-ui.integration.spec.ts` |
