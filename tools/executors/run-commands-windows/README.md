# @legacy-sports/run-commands-windows

Windows-optimized Nx executor that prevents console window flashing during parallel task execution.

## Purpose

Solves LS-102: Console windows briefly flash on screen when running Nx tasks in parallel on Windows.

## How It Works

This executor is a drop-in replacement for `nx:run-commands` that adds `windowsHide: true` to all spawned processes:

```typescript
spawn(command, {
  shell: true,
  stdio: 'inherit',
  windowsHide: true, // ← Prevents console flashing on Windows
});
```

## Usage

### In nx.json (Global Default)

```json
{
  "targetDefaults": {
    "typecheck": {
      "executor": "@legacy-sports/run-commands-windows",
      "options": {
        "command": "tsc --noEmit"
      }
    }
  }
}
```

### In project.json (Per-Project)

```json
{
  "targets": {
    "typecheck": {
      "executor": "@legacy-sports/run-commands-windows",
      "options": {
        "command": "tsc --noEmit -p tsconfig.lib.json",
        "cwd": "{projectRoot}"
      }
    }
  }
}
```

## Options

All options from `nx:run-commands` are supported:

| Option     | Type       | Description                                 |
| ---------- | ---------- | ------------------------------------------- |
| `command`  | `string`   | Single command to execute                   |
| `commands` | `string[]` | Array of commands to execute                |
| `cwd`      | `string`   | Working directory (default: workspace root) |
| `env`      | `object`   | Environment variables                       |
| `parallel` | `boolean`  | Run commands in parallel (default: false)   |
| `color`    | `boolean`  | Enable colored output (default: false)      |

## Cross-Platform Compatibility

The `windowsHide` option is:

- ✅ **Active on Windows** - Prevents console flashing
- ✅ **Ignored on Linux/macOS** - No effect, behaves normally
- ✅ **Safe in CI** - GitHub Actions (Linux) unaffected

## Migration

### Before

```json
{
  "executor": "nx:run-commands",
  "options": {
    "command": "tsc --noEmit"
  }
}
```

### After

```json
{
  "executor": "@legacy-sports/run-commands-windows",
  "options": {
    "command": "tsc --noEmit"
  }
}
```

**That's it!** Everything else remains identical.

## Testing

```powershell
# Test single project
pnpm exec nx run utils:typecheck

# Test parallel execution (should not flash)
pnpm exec nx run-many -t typecheck --projects=utils,api --parallel=2

# Test make pre-commit (should not flash)
make pre-commit
```

## Implementation Details

- **Location:** `tools/executors/run-commands-windows/`
- **Entry Point:** `executor.ts`
- **Schema:** `schema.json` (compatible with nx:run-commands)
- **Node.js Version:** Requires v13.2.0+ (we're on v22.19.0)

## Related

- **Issue:** LS-102
- **Documentation:** `docs/fixes/LS-102-windows-console-flashing-fix.md`
- **Summary:** `docs/fixes/LS-102-SUMMARY.md`
