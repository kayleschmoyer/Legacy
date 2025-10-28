# Jest Configuration for Changed Files Only

This document describes the Jest configuration updates that enable running tests only for changed files by default.

## 🎯 Overview

The Jest configuration has been updated to run only tests related to changed files by default, improving developer productivity and CI performance.

## 📋 Configuration Changes

### 1. **Updated Jest Preset (`jest.preset.js`)**

```javascript
const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  // Enable watch mode optimizations
  watchman: true,
  // Cache test results for better performance
  cache: true,
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // Configure change detection for onlyChanged
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/index.{js,jsx,ts,tsx}',
  ],
};
```

**Benefits:**

- **Watchman Integration**: Faster file change detection
- **Caching**: Improved test performance through result caching
- **Clean Mocks**: Prevents test interference
- **Better Coverage**: Excludes non-testable files from coverage

### 2. **Root Package.json Scripts**

```json
{
  "scripts": {
    "test": "echo 'Use test:changed or test:all for running tests'",
    "test:all": "nx run-many -t test",
    "test:changed": "nx affected -t test",
    "test:watch": "nx run-many -t test --watch"
  }
}
```

**Available Commands:**

- `pnpm run test:changed` - Run tests only for affected projects (default behavior)
- `pnpm run test:all` - Run tests for all projects
- `pnpm run test:watch` - Run tests in watch mode

### 3. **Individual Project Scripts**

Example from `lib/shared-components/package.json`:

```json
{
  "scripts": {
    "test": "jest --onlyChanged",
    "test:watch": "jest --watch --onlyChanged",
    "test:all-files": "jest",
    "test:coverage": "jest --coverage"
  }
}
```

**Benefits:**

- `test` - Only runs tests for changed files
- `test:all-files` - Runs all tests when needed
- `test:watch` - Watch mode with change detection
- `test:coverage` - Full coverage analysis

## 🚀 Usage Examples

### **Development Workflow**

```bash
# Run tests for changed files only (recommended for daily development)
pnpm run test:changed

# Run tests for all files (useful for pre-commit or CI)
pnpm run test:all

# Run tests in watch mode for active development
pnpm run test:watch
```

### **Individual Project Testing**

```bash
# In any project directory
cd lib/shared-components

# Run tests for changed files only
npm test

# Run all tests for this project
pnpm run test:all-files

# Run in watch mode
pnpm run test:watch
```

### **NX Integration**

```bash
# Test specific projects
pnpm exec nx test shared-components

# Test affected projects (based on git changes)
pnpm exec nx affected -t test

# Test all projects
pnpm exec nx run-many -t test
```

## 🎯 How It Works

### **Change Detection**

Jest's `--onlyChanged` flag works by:

1. **Git Integration**: Compares current working directory with last commit
2. **File Tracking**: Identifies modified, added, or renamed files
3. **Test Mapping**: Finds tests that import or test the changed files
4. **Dependency Analysis**: Includes tests for files that depend on changed modules

### **NX Affected Algorithm**

NX's affected detection considers:

1. **File Changes**: Modified files since base branch
2. **Project Dependencies**: Projects that depend on changed projects
3. **Configuration Changes**: Updates to build configs, package.json, etc.
4. **Implicit Dependencies**: Shared configurations and global files

### **Example Scenarios**

| Change                           | Tests Run                                             |
| -------------------------------- | ----------------------------------------------------- |
| Modify `lib/utils/src/index.ts`  | Tests in `lib/utils` + any project that imports utils |
| Update `package.json` dependency | All affected projects that use that dependency        |
| Change only documentation        | No tests (unless docs affect build)                   |
| Modify shared component          | Component tests + any app/lib that imports it         |

## 🔧 Customization Options

### **Override for Specific Cases**

```bash
# Force run all tests regardless of changes
jest --all

# Run tests with specific pattern
jest --testPathPattern=auth

# Run tests for specific files
jest src/components/Button.test.tsx
```

### **CI/CD Configuration**

```yaml
# GitHub Actions example
- name: Run Tests (Changed Files)
  run: pnpm run test:changed

- name: Run Tests (Full Suite - on main)
  if: github.ref == 'refs/heads/main'
  run: pnpm run test:all
```

## 📊 Performance Benefits

### **Local Development**

- **Faster Feedback**: Only relevant tests run
- **Reduced Resource Usage**: Less CPU and memory consumption
- **Improved Focus**: Test output only shows relevant failures

### **CI/CD Performance**

- **Faster Builds**: Significantly reduced test execution time
- **Efficient Resource Usage**: Less compute time on build servers
- **Parallel Optimization**: NX can better parallelize smaller test suites

### **Example Metrics**

- Full test suite: ~7-10 minutes
- Changed files only: ~30 seconds - 2 minutes (typical)
- Watch mode: ~5-15 seconds per change

## 🛠️ Troubleshooting

### **No Tests Found Message**

```
No tests found related to files changed since last commit.
Run Jest without `-o` or with `--all` to run all tests.
```

**Solution**: This is normal when no relevant files have changed. Use `pnpm run test:all-files` to run all tests.

### **Missing Test Dependencies**

If tests don't run when they should:

1. **Check Git Status**: Ensure files are properly tracked by git
2. **Verify Imports**: Make sure test files properly import the modules they test
3. **Clear Cache**: Run `jest --clearCache` if needed
4. **Check Patterns**: Verify Jest `testMatch` patterns include your test files

### **Performance Issues**

If tests are slow even with `--onlyChanged`:

1. **Enable Watchman**: Ensure `watchman: true` in jest.preset.js
2. **Check Cache**: Verify `cache: true` is enabled
3. **Review Coverage**: Adjust `collectCoverageFrom` patterns
4. **Parallel Execution**: Use `--maxWorkers` flag for CPU optimization

## 📚 Best Practices

### **Commit Workflow**

1. Make incremental changes
2. Run `pnpm run test:changed` before committing
3. Ensure all affected tests pass
4. Use `pnpm run test:all` periodically to catch integration issues

### **Code Review**

1. Review test output in PR checks
2. Verify that appropriate tests are being run
3. Request full test suite for major changes

### **Debugging**

1. Use `test:all-files` when debugging mysterious failures
2. Check git status if expected tests aren't running
3. Use Jest's `--verbose` flag for detailed output

This configuration provides an optimal balance between speed and thoroughness, making testing more efficient during development while maintaining confidence in code quality.
