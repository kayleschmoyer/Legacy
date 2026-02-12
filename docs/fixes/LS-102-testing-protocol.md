# LS-102: Testing Console Window Flashing Fix

## Quick Test Protocol

### Test 1: Verify Node.js supports windowsHide

```powershell
# Check Node version (should be 13.2.0+)
node --version

# Test windowsHide in Node REPL
node -e "const {spawn} = require('child_process'); spawn('echo', ['OK'], {shell:true, windowsHide:true, stdio:'inherit'});"
```

### Test 2: Test the wrapper script

```powershell
# Run a simple Nx command via wrapper
.\scripts\nx-wrapper.ps1 show projects --affected

# Run multiple tasks in parallel
.\scripts\nx-wrapper.ps1 run-many -t typecheck --projects=utils,api,db-client --parallel=3
```

### Test 3: Test direct spawn fixes

```powershell
# Test UI previews script (uses spawn internally)
pnpm exec tsx scripts/ui-previews.ts --outDir tmp/previews

# Test dev services (uses spawn for multiple services)
# Note: This will start actual services, use Ctrl+C to stop
pnpm run dev:lambdas
```

### Test 4: Test pre-commit (full validation)

```powershell
# This runs multiple parallel tasks through Nx
make pre-commit
```

### Test 5: Test affected tasks

```powershell
# Make a small change to trigger affected tasks
# Example: edit lib/utils/src/index.ts (add a comment)
"# Test comment" | Out-File -Append lib/utils/src/index.ts

# Run affected tasks
pnpm exec nx affected -t typecheck --parallel=3

# Cleanup
git checkout lib/utils/src/index.ts
```

## Expected Results

### ✅ Success Indicators

- No console windows flash on screen
- Commands execute normally
- Output appears in the terminal as expected
- No performance degradation
- Exit codes are preserved

### ❌ Failure Indicators

- Console windows still flash briefly
- Commands hang or fail
- Missing output or error messages
- Incorrect exit codes

## Troubleshooting

### Issue: Wrapper script doesn't hide windows

**Solution:** Use `-WindowStyle Hidden` variant:

```powershell
# Alternative wrapper approach
Start-Process powershell -ArgumentList "-WindowStyle Hidden -Command `"cd $(Get-Location); pnpm exec nx affected -t test`""
```

### Issue: spawn calls still show windows

**Cause:** `windowsHide` not supported or Node.js version too old

**Solution:** Upgrade Node.js or use alternative approach:

```javascript
// Instead of windowsHide, use shell: false when possible
spawn(command, args, {
  shell: false, // Avoids console window entirely
  stdio: 'inherit',
});
```

### Issue: Commands fail with wrapper

**Cause:** Working directory or environment not set correctly

**Solution:** Check the wrapper script sets `-WorkingDirectory $PWD`

## Performance Testing

```powershell
# Measure execution time before fix
Measure-Command { pnpm exec nx affected -t test --parallel=3 }

# Measure execution time after fix (should be similar)
Measure-Command { .\scripts\nx-wrapper.ps1 affected -t test --parallel=3 }
```

## Regression Testing

```powershell
# Ensure all critical workflows still work

# 1. Build all projects
make build

# 2. Run all tests
make test

# 3. Lint codebase
make lint

# 4. Pre-commit validation
make pre-commit

# 5. Generate project graph
pnpm exec nx graph
```

## Visual Confirmation

### Before Fix:

- Multiple console windows briefly appear and disappear
- Screen flickers during parallel task execution
- Distracting during development

### After Fix:

- No visible console windows
- Smooth execution
- Output only in the terminal that initiated the command

## Automated Test Script

```powershell
# test-ls-102-fix.ps1
Write-Host "Testing LS-102 Fix: Console Window Flashing" -ForegroundColor Cyan

# Test 1: Wrapper script
Write-Host "`n1. Testing wrapper script..." -ForegroundColor Yellow
$result1 = .\scripts\nx-wrapper.ps1 show projects | Out-String
if ($LASTEXITCODE -eq 0) {
    Write-Host " ✓ Wrapper script works" -ForegroundColor Green
} else {
    Write-Host " ✗ Wrapper script failed" -ForegroundColor Red
}

# Test 2: Parallel execution
Write-Host "`n2. Testing parallel execution..." -ForegroundColor Yellow
$result2 = .\scripts\nx-wrapper.ps1 run-many -t typecheck --projects=utils,api --parallel=2
if ($LASTEXITCODE -eq 0) {
    Write-Host " ✓ Parallel execution works" -ForegroundColor Green
} else {
    Write-Host " ✗ Parallel execution failed" -ForegroundColor Red
}

# Test 3: Exit codes preserved
Write-Host "`n3. Testing exit code preservation..." -ForegroundColor Yellow
.\scripts\nx-wrapper.ps1 run-nonexistent-command 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host " ✓ Exit codes preserved" -ForegroundColor Green
} else {
    Write-Host " ✗ Exit codes not preserved" -ForegroundColor Red
}

Write-Host "`n=== Testing Complete ===" -ForegroundColor Cyan
```

## Success Criteria Checklist

- [ ] No console windows flash during parallel Nx tasks
- [ ] Wrapper script executes commands correctly
- [ ] Exit codes are preserved
- [ ] Output is visible in terminal
- [ ] Performance is not degraded
- [ ] All existing scripts work with `windowsHide: true`
- [ ] `make pre-commit` runs smoothly
- [ ] Developer workflow is improved

## Documentation Updates

After successful testing, update:

1. [README.md](d:\code\legacy-sports\README.md) - Add note about Windows experience
2. [.github/copilot/quick-reference.md](d:\code\legacy-sports.github\copilot\quick-reference.md) - Add wrapper script usage
3. [docs/guides/development-setup.md](d:\code\legacy-sports\docs\guides\development-setup.md) - Update Windows setup instructions
