---
name: resolve-merge-conflicts
description: 'Teach agents to reason through merge conflicts intelligently instead of blindly accepting one side; covers the analysis framework for reading both sides, understanding intent, synthesizing correct resolutions, and validating the result. Load this skill alongside rebase-conflicts whenever a rebase produces source-code conflicts that require manual resolution.'
---

# Skill: Intelligent Merge Conflict Resolution

## Overview

The #1 mistake AI agents make when resolving merge conflicts is **blindly picking one side** — either `--ours` or `--theirs` — instead of reasoning about what both sides intended and producing a correct synthesis. This skill teaches the analysis framework agents must follow when resolving any non-trivial source conflict.

**Core principle**: A conflict means two people changed the same code for (usually) different reasons. The correct resolution almost always preserves the intent of **both** changes, not just one.

## When to Use

- A `git rebase` or `git merge` produces conflicts in source files (`.ts`, `.tsx`, `.json`, etc.)
- You're about to run `git checkout --ours` or `git checkout --theirs` on a source file — **STOP and use this skill instead**
- The rebase-conflicts skill directed you here for manual source conflict resolution
- You see conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in a file

## The Anti-Pattern: Picking a Side

❌ **What agents typically do wrong:**

```
# "There's a conflict in utils.ts, I'll just take theirs"
git checkout --theirs lib/utils/src/helpers.ts
git add lib/utils/src/helpers.ts
```

This silently **throws away** all changes the feature branch made to that file. Or the reverse — taking `--ours` throws away everything main added. Either way, you've introduced a regression that may not surface until runtime.

**`--ours` / `--theirs` are only appropriate for:**

- Generated files (regenerate instead)
- Lock files (regenerate instead)
- Auto-generated docs
- Files where you have **verified** that one side's changes fully supersede the other

For everything else, you must **read, reason, and synthesize**.

---

## The Resolution Framework

For every conflicted source file, follow these five steps **in order**:

### Step 1: Read the Full Conflict

Read the entire file — not just the conflict markers. You need surrounding context to understand what the code does.

```powershell
# See the file with conflict markers
Get-Content <file>
```

Identify every conflict block (there may be multiple in one file). A conflict block looks like:

```
<<<<<<< HEAD
// Code from the BASE branch (what you're rebasing onto — usually main)
=======
// Code from YOUR branch (the feature branch being replayed)
>>>>>>> <commit-message>
```

> **During a rebase**, `HEAD` = the base branch (main), and the incoming side = your feature branch. This is the **opposite** of a merge. Don't mix them up.

### Step 2: Understand What Each Side Changed (and Why)

This is the critical step agents skip. For each conflict block, answer these questions:

1. **What did main change?** — Read the HEAD side. Was it a rename? A new parameter? A bug fix? A refactor? An added import?
2. **What did the feature branch change?** — Read the other side. Was it adding new functionality? Modifying behavior? Fixing a different bug?
3. **What was the original code before either change?** — If unclear, check:
   ```powershell
   # See the merge base version of the file
   git show $(git merge-base HEAD REBASE_HEAD):<file-path>
   ```
4. **Are the changes independent or contradictory?**
   - **Independent**: Both sides changed different things in the same region (e.g., one added an import, the other modified a function below it). → **Keep both.**
   - **Overlapping but compatible**: Both sides changed the same thing in compatible ways (e.g., both added items to an array). → **Combine them.**
   - **Contradictory**: Both sides changed the same thing differently (e.g., one renamed a variable, the other changed its type). → **Synthesize** — apply the feature branch's change on top of main's refactoring.

### Step 3: Determine the Correct Resolution

Apply these rules in priority order:

#### Rule 1: Structural Changes from Main Always Win (Then Reapply Feature Changes)

If main **renamed** a function, variable, type, or file:

- Use main's new name/structure
- Reapply the feature branch's behavioral changes using the new names

```typescript
// ❌ WRONG: Take feature branch's version (uses old name)
function calculateScore(player: Player): number {
  return player.points * 2 + player.bonus; // feature branch added bonus
}

// ❌ WRONG: Take main's version (loses the bonus logic)
function computePlayerScore(player: Player): number {
  return player.points * 2;
}

// ✅ CORRECT: Main's rename + feature branch's logic
function computePlayerScore(player: Player): number {
  return player.points * 2 + player.bonus;
}
```

#### Rule 2: Additive Changes from Both Sides Coexist

If both sides **added** new things (imports, array items, object properties, function parameters, switch cases):

- Keep additions from both sides
- Ensure no duplicates
- Maintain alphabetical or logical ordering if the file follows a convention

```typescript
// HEAD (main) added:
import { validateEmail } from './validators';

// Feature branch added:
import { formatName } from './formatters';

// ✅ CORRECT: Keep both imports
import { formatName } from './formatters';
import { validateEmail } from './validators';
```

#### Rule 3: Signature/Interface Changes from Main Must Be Adopted

If main changed a function signature, type definition, or interface:

- Use main's new signature
- Update your feature branch's call sites and usages to match
- Don't just take your branch's old signature — that will break other code that already uses the new one

```typescript
// Main changed the signature to add a required `context` param:
// HEAD:  async function processPlayer(id: string, context: AppContext)
// Ours:  async function processPlayer(id: string)  ← still has old sig

// ✅ CORRECT: Use main's new signature, adapt feature branch's body
async function processPlayer(id: string, context: AppContext) {
  // feature branch's new logic goes here, using the new context param if needed
}
```

#### Rule 4: Deleted Code Should Stay Deleted (Usually)

If main **removed** code that your branch modified:

- Main's deletion usually wins — someone deliberately removed it
- But check: was it removed because it moved to a different file? If so, apply your branch's changes in the new location
- If unsure why it was removed, **ask the developer**

#### Rule 5: Configuration and Constant Changes Need Both Intents

If both sides changed a config value, constant, or feature flag:

- Don't just pick one value
- Understand **why** each side changed it and determine the correct current value
- Often the feature branch's value is correct because it's enabling the new feature, but main's surrounding structure should be preserved

```typescript
// HEAD changed MAX_RETRIES and added TIMEOUT_MS
// Feature branch changed MAX_RETRIES differently and added BATCH_SIZE

// ✅ CORRECT: Keep main's structural additions, use correct values for each
const MAX_RETRIES = 5; // Feature branch's value (needed for new feature)
const TIMEOUT_MS = 30000; // Main's addition (keep it)
const BATCH_SIZE = 100; // Feature branch's addition (keep it)
```

### Step 4: Write the Resolution

After reasoning through the correct resolution:

1. **Remove all conflict markers** (`<<<<<<<`, `=======`, `>>>>>>>`)
2. **Write the merged code** that preserves both sides' intent
3. **Check for consistency** — if you adopted a rename from main, make sure ALL references in the file use the new name
4. **Stage the file**:
   ```powershell
   git add <file>
   ```

### Step 5: Validate the Resolution

After resolving all conflicts in a commit and continuing the rebase:

```powershell
# Check for leftover conflict markers (MUST be zero)
Select-String -Path "**/*.ts","**/*.tsx" -Pattern "^(<<<<<<<|=======|>>>>>>>)" -Recurse

# Typecheck
pnpm exec nx affected -t typecheck --base=origin/main

# Lint
pnpm exec nx affected -t lint --base=origin/main

# Test
pnpm exec nx affected -t test --base=origin/main
```

If typecheck or lint fails, the resolution was likely incomplete. **Don't suppress the errors** — go back and fix the merge.

---

## Worked Examples

### Example 1: Import + Function Body Conflict

**Conflict:**

```typescript
<<<<<<< HEAD
import { db } from '@ls/db-client';
import { logger } from '@ls/logging';
import { validateInput } from './validators';

export async function getTeamRoster(teamId: string) {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    with: { members: true },
  });
=======
import { db } from '@ls/db-client';
import { logger } from '@ls/logging';

export async function getTeamRoster(teamId: string, includeInactive = false) {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    with: { members: true },
  });
>>>>>>> feat: add inactive roster filter
```

**Analysis:**

- **Main added**: `import { validateInput }` and nothing else changed in the function
- **Feature branch added**: `includeInactive` parameter to the function signature
- These are **independent, additive changes** → keep both

**Resolution:**

```typescript
import { db } from '@ls/db-client';
import { logger } from '@ls/logging';
import { validateInput } from './validators';

export async function getTeamRoster(teamId: string, includeInactive = false) {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    with: { members: true },
  });
```

### Example 2: Both Sides Modified the Same Function

**Conflict:**

```typescript
<<<<<<< HEAD
export function formatPlayerName(player: Player): string {
  if (!player.firstName || !player.lastName) {
    return player.displayName ?? 'Unknown';
  }
  return `${player.firstName} ${player.lastName}`;
}
=======
export function formatPlayerName(player: Player): string {
  const first = player.firstName?.trim() ?? '';
  const last = player.lastName?.trim() ?? '';
  if (!first && !last) {
    return 'Unknown Player';
  }
  return `${first} ${last}`;
}
>>>>>>> feat: trim whitespace in player names
```

**Analysis:**

- **Main added**: fallback to `player.displayName` when name parts are missing
- **Feature branch added**: `.trim()` on name parts and slightly different empty-check logic
- These are **overlapping but compatible** — main's `displayName` fallback is a good improvement; feature branch's trimming is also needed

**Resolution (synthesized):**

```typescript
export function formatPlayerName(player: Player): string {
  const first = player.firstName?.trim() ?? '';
  const last = player.lastName?.trim() ?? '';
  if (!first && !last) {
    return player.displayName ?? 'Unknown Player';
  }
  return `${first} ${last}`;
}
```

Both the trimming logic AND the `displayName` fallback are preserved.

### Example 3: Main Refactored, Branch Added Feature

**Conflict:**

```typescript
<<<<<<< HEAD
// Main extracted this to a service
import { rosterService } from '../services/roster-service';

export const addPlayerResolver = async (_, { input }, ctx) => {
  await rosterService.addPlayerToRoster(input.teamId, input.playerId, ctx);
};
=======
export const addPlayerResolver = async (_, { input }, ctx) => {
  // Check capacity
  const roster = await db.query.teamMembers.findMany({
    where: eq(teamMembers.teamId, input.teamId),
  });
  if (roster.length >= MAX_ROSTER_SIZE) {
    throw new Error('Roster is full');
  }
  // Add player
  await db.insert(teamMembers).values({
    teamId: input.teamId,
    playerId: input.playerId,
  });
  // NEW: Send notification
  await notificationService.send(input.teamId, `Player added to roster`);
};
>>>>>>> feat: send notification on roster add
```

**Analysis:**

- **Main**: extracted inline DB queries into `rosterService` (structural refactor)
- **Feature branch**: added notification sending (new behavior), but still uses old inline queries
- The correct resolution is: **use main's refactored structure** and **add the notification call**

**Resolution:**

```typescript
import { rosterService } from '../services/roster-service';

export const addPlayerResolver = async (_, { input }, ctx) => {
  await rosterService.addPlayerToRoster(input.teamId, input.playerId, ctx);
  // Send notification after successful roster add
  await notificationService.send(input.teamId, `Player added to roster`);
};
```

The notification is added on top of main's refactored code. The inline DB logic is NOT brought back.

---

## Decision Checklist

Before resolving any conflict, the agent should answer each of these. If any answer is "I don't know," investigate further (read git log, check the merge base, or ask the developer).

| #   | Question                                                       | If Yes                                         | If No                        |
| --- | -------------------------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| 1   | Is this a generated file?                                      | Regenerate — never manually merge              | Continue to #2               |
| 2   | Is this a lock file or schema dump?                            | Regenerate                                     | Continue to #3               |
| 3   | Can I identify the intent of BOTH sides?                       | Proceed to resolve                             | Read git log / ask developer |
| 4   | Are the changes independent (different concerns)?              | Keep both                                      | Continue to #5               |
| 5   | Did main rename/refactor/restructure?                          | Use main's structure, reapply feature's intent | Continue to #6               |
| 6   | Did main delete code the feature branch modified?              | Usually accept deletion, verify intent         | Continue to #7               |
| 7   | Did both sides change the same logic differently?              | Synthesize — combine both intents              | Continue to #8               |
| 8   | Is the conflict just in added elements (imports, array items)? | Keep both additions, deduplicate               | Ask developer — unusual case |

---

## Common Pitfalls

### Pitfall 1: "I'll just take theirs and fix it later"

There is no "later." The rebase continues, the branch gets pushed, the regression ships. Resolve correctly **now**.

### Pitfall 2: Forgetting to Update All References After a Rename

If main renamed `calculateScore` → `computePlayerScore`, don't just fix the conflict block — search the entire file for the old name and update every occurrence.

```powershell
Select-String -Path <file> -Pattern "calculateScore"
```

### Pitfall 3: Losing Feature Branch Changes in Multi-Conflict Files

A file may have 5 conflict blocks. The agent resolves 3 correctly but picks `--theirs` for the other 2 because they seem "complex." This drops feature work. Resolve **every** block thoughtfully.

### Pitfall 4: Not Checking if the Merge Base Reveals the Original Code

When both sides look very different, seeing the original (pre-both-changes) code clarifies what each side actually changed:

```powershell
git show $(git merge-base HEAD REBASE_HEAD):<file-path>
```

### Pitfall 5: Resolving Types but Not Updating Tests

If the source resolution changed behavior, the corresponding test file probably also needs updating. Check for conflicted test files and resolve them to match your source resolution.

---

## When to Ask the Developer

**Do NOT guess when you're uncertain. Ask.** Some conflicts genuinely require human judgment, and a wrong guess creates a silent regression that's harder to find than the conflict itself. If you've followed the Resolution Framework above and still aren't confident, **stop and ask the developer for help**.

### Escalate when:

- Main deleted a feature and the branch extended it — was the deletion intentional?
- Both sides changed business logic (pricing, scoring rules, draft logic) in contradictory ways
- The conflict involves security-sensitive code (auth, permissions, input validation)
- You cannot determine the intent of one side even after reading git log and the merge base
- The resolution would require changes to files that aren't part of the conflict
- You've resolved the conflict but typecheck/lint still fails and you can't figure out why
- The conflict spans complex logic (state machines, multi-step workflows) where getting it wrong could cause data corruption

### How to ask:

When you need help, provide the developer with a **structured summary** so they can make a fast decision:

1. **The file and conflict location** — include the file path and the full conflict block (both sides)
2. **What each side changed** — one sentence per side explaining the intent
3. **What you've tried** — mention that you checked the merge base, git log, etc.
4. **Your best guess** — propose a resolution and explain why you're not confident
5. **What you need from them** — a specific question ("Should the deletion win, or should I keep the feature branch's extension?")

Example:

> I'm resolving a conflict in `lambdas/db/src/services/draft-service.ts` (lines 45–62).
>
> - **Main** removed the `validateDraftOrder` call — looks like it was replaced by `draftValidationService.validate()` in a refactor.
> - **Our branch** added a new `skipValidation` parameter to `validateDraftOrder`.
>
> I think the correct resolution is to add the `skipValidation` parameter to the new `draftValidationService.validate()` call instead, but I'm not sure that service supports that parameter. Can you confirm?

### What NOT to do when stuck:

- ❌ Pick `--ours` or `--theirs` and move on — this is the exact anti-pattern this skill exists to prevent
- ❌ Make your best guess without telling the developer you were uncertain — if it's wrong, nobody will know until something breaks
- ❌ Abort the entire rebase — ask about the specific conflict first; the rest may be fine

---

## Related Skills

- [rebase-conflicts](../rebase-conflicts/SKILL.md) — Git commands and mechanical rebase workflow
- [fix-types](../fix-types/SKILL.md) — Fix TypeScript errors that emerge after conflict resolution
- [fix-lint](../fix-lint/SKILL.md) — Fix lint errors after resolution
- [no-edit-generated](../no-edit-generated/SKILL.md) — Never manually merge generated files
