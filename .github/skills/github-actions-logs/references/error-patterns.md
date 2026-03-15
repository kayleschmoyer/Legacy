# CI Error Pattern Details

Detailed search commands and evidence examples for each CI error type.

## 1. Module Loading Errors (Root Cause)

**Pattern:**

```
(node:3665) Warning: Failed to load the ES module: /path/to/jest.config.web.ts
Make sure to set "type": "module" in the nearest package.json
```

**How to find:**

```powershell
# Find module loading failures
gh run view RUN_ID --log-failed | Select-String "Failed to load.*module"

# Find ES module errors
gh run view RUN_ID --log-failed | Select-String "ES module" -Context 3

# Find jest config issues
gh run view RUN_ID --log-failed | Select-String "jest.config" -Context 5

# Find node warnings (often the root cause)
gh run view RUN_ID --log-failed | Select-String "\(node:\d+\) Warning" -Context 10
```

**Why this matters:** Module loading errors cause test runners to fail, which then shows as "FAIL" in logs. The test failure is the symptom, not the cause.

## 2. Test Failures (Often a Symptom)

**Pattern:**

```
FAIL   project-name  path/to/test.spec.ts
  ● Test Suite Name › Test Name
    Error: expect(received).toBe(expected)
```

**How to find:**

```powershell
# Search logs for test failures
gh run view RUN_ID --log | Select-String "FAIL.*spec\.ts"

# Get CONTEXT before the failure (may show root cause)
gh run view RUN_ID --log | Select-String -Context 20,5 "FAIL.*shared-components"

# Extract test error context
gh run view RUN_ID --log | Select-String -Context 5 "Error: expect"
```

**⚠️ Important:** If you see a test failure, ALWAYS look at the 10-20 lines BEFORE it for warnings or configuration errors.

## 3. Configuration Errors (Root Cause)

**Pattern:**

```
Error: Cannot find module '@project/package'
package.json is missing "type": "module"
tsconfig.json: Cannot find name 'X'
```

**How to find:**

```powershell
# Find configuration file errors
gh run view RUN_ID --log-failed | Select-String "package\.json|tsconfig|jest\.config" -Context 5

# Find missing module errors
gh run view RUN_ID --log-failed | Select-String "Cannot find module" -Context 3

# Find type: module issues
gh run view RUN_ID --log-failed | Select-String "type.*module" -Context 5
```

## 4. Outdated Dependencies (Root Cause)

**Pattern:**

```
[baseline-browser-mapping] The data in this module is over two months old.
To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`
```

**How to find:**

```powershell
# Find outdated package warnings
gh run view RUN_ID --log-failed | Select-String "over.*months old|please update|npm i.*latest"

# Find all npm/pnpm warnings
gh run view RUN_ID --log-failed | Select-String "\[.*\].*update|deprecated" -Context 3
```

## 5. Type Errors

**Pattern:**

```
error TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'
```

**How to find:**

```powershell
# Find TypeScript errors
gh run view RUN_ID --log | Select-String "error TS\d+"

# Get file and line number
gh run view RUN_ID --log | Select-String "\.ts\(\d+,\d+\): error"
```

## 6. Lint Failures

**Pattern:**

```
✖ 10 problems (5 errors, 5 warnings)
/path/to/file.ts
  123:4  error  'variable' is assigned a value but never used
```

**How to find:**

```powershell
# Find lint errors
gh run view RUN_ID --log | Select-String "error  "

# Find specific file with errors
gh run view RUN_ID --log | Select-String "db-client.*\.ts"
```

## 7. Build Failures

**Pattern:**

```
NX   Running target build for X projects failed
Failed tasks:
- project-name:build
```

**How to find:**

```powershell
# Find build failures
gh run view RUN_ID --log | Select-String "Failed tasks:"

# Find which projects failed
gh run view RUN_ID --log | Select-String -Context 10 "Running target .* failed"
```

## 8. React/Component Warnings

**Pattern:**

```
console.error
  React does not recognize the `propName` prop on a DOM element
```

**How to find:**

```powershell
# Find React warnings
gh run view RUN_ID --log | Select-String "React does not recognize"

# Find component issues
gh run view RUN_ID --log | Select-String "console\.(error|warn)"
```

## 9. Process Exit Errors

**Pattern:**

```
##[error]Process completed with exit code 130.
```

**How to find:**

```powershell
# Find exit code errors
gh run view RUN_ID --log | Select-String "exit code \d+"

# Context around the error
gh run view RUN_ID --log | Select-String -Context 20 "exit code"
```
