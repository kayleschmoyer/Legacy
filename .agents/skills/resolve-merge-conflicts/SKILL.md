---
name: resolve-merge-conflicts
description: 'Resolve merge conflicts by analyzing both sides and synthesizing correct resolutions instead of blindly accepting one side. Load alongside rebase-conflicts whenever a rebase produces source-code conflicts that require manual resolution.'
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

## Load-on-Demand References

- **[Worked Examples](references/worked-examples.md)** — 3 detailed conflict resolution examples (import conflicts, overlapping modifications, refactor + feature)
- **[Pitfalls & Escalation](references/pitfalls-and-escalation.md)** — Decision checklist, 5 common pitfalls, when/how to ask the developer for help

## Related Skills

- [rebase-conflicts](../rebase-conflicts/SKILL.md) — Git commands and mechanical rebase workflow
- [fix-types](../fix-types/SKILL.md) — Fix TypeScript errors that emerge after conflict resolution
- [fix-lint](../fix-lint/SKILL.md) — Fix lint errors after resolution
- [no-edit-generated](../no-edit-generated/SKILL.md) — Never manually merge generated files
