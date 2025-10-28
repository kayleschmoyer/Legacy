# Legacy Sports ESLint Configuration

Unified ESLint configuration system that eliminates conflicts and ensures consistency across the Legacy Sports workspace.

## 📋 Overview

This package provides standardized ESLint configurations for different project types in the Legacy Sports Nx monorepo:

- **Base**: Core rules for all TypeScript/JavaScript files
- **React**: Rules for React applications and components (web + React Native)
- **Lambda**: Rules for AWS Lambda functions
- **Library**: Stricter rules for shared libraries
- **E2E**: Permissive rules for end-to-end test files

## 🚀 Usage

### In Project ESLint Files

Replace your existing `.eslintrc.json` with the appropriate configuration:

#### For React Applications/Components

```json
{
  "extends": ["../../tools/eslint-config/react"]
}
```

#### For Lambda Functions

```json
{
  "extends": ["../../tools/eslint-config/lambda"]
}
```

#### For Shared Libraries

```json
{
  "extends": ["../../tools/eslint-config/library"]
}
```

#### For E2E Test Projects

```json
{
  "extends": ["../../tools/eslint-config/e2e"]
}
```

#### For Basic TypeScript Projects

```json
{
  "extends": ["../../tools/eslint-config/base"]
}
```

### Custom Project Overrides

You can add project-specific rules while still using the unified base:

```json
{
  "extends": ["../../tools/eslint-config/react"],
  "rules": {
    "react/jsx-sort-props": "off",
    "custom-rule": "error"
  }
}
```

## 📊 Configuration Details

### Base Configuration

- **Type Safety**: Strict TypeScript rules with no `any` allowed
- **Import Organization**: Automatic import sorting and grouping
- **Module Boundaries**: Nx workspace dependency enforcement
- **Code Quality**: Consistent formatting and best practices

### React Configuration

- **JSX Best Practices**: Self-closing tags, prop sorting, boolean values
- **React Hooks**: Proper hook usage and dependency checking
- **Accessibility**: WCAG compliance rules for web accessibility
- **React Native Support**: Platform-specific rule adjustments

### Lambda Configuration

- **AWS Integration**: Allow AWS SDK and Lambda runtime imports
- **Node.js Environment**: Server-side specific rules
- **Logging**: Console usage allowed for CloudWatch integration
- **Flexible Returns**: Handler functions can have dynamic return types

### Library Configuration

- **Strict Type Safety**: Explicit return types and module boundaries required
- **No Console Logging**: Libraries should use proper logging utilities
- **Export Quality**: Proper accessibility modifiers and clean interfaces
- **Dependency Control**: Strict module boundary enforcement

### E2E Configuration

- **Testing Flexibility**: Relaxed rules for test code patterns
- **Framework Support**: Playwright, Cypress, WebDriverIO configurations
- **Debug-Friendly**: Console logging and flexible typing allowed
- **No Module Boundaries**: Tests can import from anywhere

## 🔧 Rule Philosophy

### Critical Rules (Always Error)

- `@typescript-eslint/no-explicit-any`: Prevents unsafe type usage
- `@nx/enforce-module-boundaries`: Maintains architecture integrity
- `no-console`: Prevents accidental logging (except where appropriate)
- `import/order`: Maintains consistent import organization

### Context-Specific Rules

- **Libraries**: Stricter rules for shared code quality
- **Tests**: More permissive for testing patterns
- **Config Files**: Flexible for build/setup scripts
- **Lambdas**: Node.js and AWS-specific allowances

## 🛠️ Migration Guide

### From Existing .eslintrc Files

1. **Backup your current configuration**:

   ```bash
   cp .eslintrc.json .eslintrc.json.backup
   ```

2. **Choose appropriate configuration**:
   - React apps/components → `react`
   - Lambda functions → `lambda`
   - Shared libraries → `library`
   - E2E tests → `e2e`
   - Other TypeScript → `base`

3. **Update .eslintrc.json**:

   ```json
   {
     "extends": ["../../tools/eslint-config/[TYPE]"]
   }
   ```

4. **Test the new configuration**:

   ```bash
   pnpm exec nx lint [project-name]
   ```

5. **Fix any new lint errors**:
   ```bash
   pnpm exec nx lint [project-name] --fix
   ```

### Handling Breaking Changes

If the new configuration introduces lint errors:

1. **Review the errors** - many can be auto-fixed
2. **Use project-specific overrides** for legitimate exceptions
3. **Update code patterns** to match new standards
4. **Contact team** if rules seem inappropriate for your use case

## 📝 Customization

### Adding Project-Specific Rules

```json
{
  "extends": ["../../tools/eslint-config/react"],
  "rules": {
    // Override specific rules for this project
    "react/jsx-sort-props": "off"
  },
  "overrides": [
    {
      "files": ["*.stories.tsx"],
      "rules": {
        // Storybook files get different rules
        "@typescript-eslint/no-explicit-any": "off"
      }
    }
  ]
}
```

### Proposing Configuration Changes

If you find rules that should be changed globally:

1. **Discuss with the team** first
2. **Update the appropriate config** in `tools/eslint-config/`
3. **Test across multiple projects**
4. **Document the change** and rationale

## 🔍 Troubleshooting

### Common Issues

**"Cannot find module" errors**:

- Ensure the path to the config is correct: `../../tools/eslint-config/[type]`

**"Parsing error" with TypeScript**:

- Check that `tsconfig.json` is properly configured
- Ensure TypeScript files use `.ts`/`.tsx` extensions

**Module boundary violations**:

- Check project tags in `project.json`
- Verify import paths follow the workspace architecture
- See `BUILD_SYSTEM.md` for dependency order

**Performance issues**:

- Use `.eslintignore` for large generated files
- Consider using `--cache` flag for faster subsequent runs

### Getting Help

1. Check existing configurations in similar projects
2. Review the rule documentation at [eslint.org](https://eslint.org)
3. Ask in team chat for workspace-specific questions
4. File an issue for configuration bugs or improvements

---

_For more information, see the Repository Improvements documentation._
