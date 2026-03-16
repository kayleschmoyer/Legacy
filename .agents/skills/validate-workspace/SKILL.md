---
name: validate-workspace
description: 'Validate workspace integrity, package.json consistency, and dependency alignment across the monorepo; use after installing new dependencies or adding projects.'
---

# Skill: Workspace Validation

## Overview

Validate workspace integrity, package.json consistency, and dependency alignment across the monorepo.

## When to Use

- After installing new dependencies
- Before committing changes
- After major refactoring
- When seeing dependency version mismatches
- Setting up development environment
- Troubleshooting "module not found" errors

## Command

```powershell
# Run all workspace validations
pnpm run validate
```

## Alternative Commands

### Individual Validations

```powershell
# Validate package.json standards
pnpm run validate:package-json

# Validate workspace dependency alignment
pnpm run validate:workspace-deps

# Validate authentication security
pnpm run validate:auth-security

# Validate security configuration
pnpm run validate:security
```

### Fix Issues Automatically

```powershell
# Fix workspace dependency issues
node scripts/fix-workspace-deps.js

# Some validations can auto-fix
```

## Expected Output

- **Success**: "✅ All workspace dependencies are properly configured"
- **Warnings**: List of issues with suggestions
- **Errors**: Critical issues that must be fixed

## Common Issues

### Issue: Dependency version mismatches

**Symptom**: "Version mismatch detected for package X"
**Solution**: Align versions across projects

```powershell
# Run fix script
node scripts/fix-workspace-deps.js

# Reinstall dependencies
pnpm install

# Validate again
pnpm run validate:workspace-deps
```

### Issue: Missing peer dependencies

**Symptom**: "Peer dependency X not found"
**Solution**: Install missing peer dependencies

```powershell
# Install missing dependency
pnpm install <package-name>

# Or add to correct package.json
cd lib/project-name
pnpm add <package-name>
```

### Issue: Invalid package.json format

**Symptom**: "Package.json validation failed"
**Solution**: Fix package.json issues

```powershell
# View detailed errors
pnpm run validate:package-json

# Fix JSON syntax or required fields
# Then validate again
```

### Issue: Security validation fails

**Symptom**: "Security check failed"
**Solution**: Review and fix security issues

```powershell
# Check security issues
pnpm run validate:security

# Common issues:
# - Exposed credentials
# - Insecure dependencies
# - Missing security configuration
```

## Best Practices

1. **Run before commit** to catch issues early
2. **Run after dependency changes** to validate alignment
3. **Fix automatically** when scripts available
4. **Review warnings** even if validation passes
5. **Keep package.json consistent** across workspace

## What Gets Validated

### Package.json Standards

- Required fields present
- Consistent formatting
- Proper dependency categorization
- No duplicate dependencies
- Version format correctness

### Workspace Dependencies

- Version alignment across projects
- No conflicting versions
- Peer dependencies satisfied
- Workspace protocol usage
- Legacy Sports packages properly linked

### Authentication Security

- No hardcoded credentials
- OAuth configuration secure
- Token handling proper
- Secret management correct

### Security Configuration

- No secrets in tracked files
- Git hooks installed
- Security scanning enabled
- Safe default configurations

## Integration with Workflow

### After Installing Dependencies

```powershell
# 1. Install new package
pnpm add <package-name>

# 2. Validate workspace
pnpm run validate

# 3. Fix any issues
node scripts/fix-workspace-deps.js

# 4. Commit changes
git add .
git commit -m "chore: add dependency X"
```

### Pre-commit Validation

```powershell
# Part of pre-commit checklist
make pre-commit

# Or manually:
pnpm run validate
pnpm exec nx affected -t typecheck
pnpm exec nx affected -t lint --fix
pnpm exec nx affected -t test
pnpm exec nx affected -t build
```

### After Major Refactoring

```powershell
# 1. Complete refactoring
# 2. Validate workspace
pnpm run validate

# 3. If issues found, fix them
node scripts/fix-workspace-deps.js

# 4. Reinstall if needed
pnpm install

# 5. Rebuild
pnpm run build:libs
```

## Validation Scripts

### validate-workspace-deps.js

Checks:

- Version consistency across projects
- Workspace protocol usage
- Dependency alignment
- No circular dependencies

### validate-package-json-standards.js

Checks:

- Required fields
- Consistent structure
- No deprecated fields
- Proper dependency organization

### validate-auth-security.js

Checks:

- No hardcoded credentials
- Secure OAuth configuration
- Proper token storage
- Environment variable usage

### verify-security.js

Checks:

- No secrets in git
- Git hooks installed
- Security policies enforced
- Safe configuration

## Fixing Common Issues

### Version Conflicts

```powershell
# Identify conflicts
pnpm run validate:workspace-deps

# Fix automatically
node scripts/fix-workspace-deps.js

# Or manually update package.json files
# Then: pnpm install
```

### Missing Dependencies

```powershell
# Install missing dependencies
pnpm install

# Or for specific project
cd lib/project-name
pnpm install

# Validate
pnpm run validate
```

### Security Issues

```powershell
# Run security validation
pnpm run validate:security

# Fix issues identified
# - Remove hardcoded credentials
# - Use environment variables
# - Update .gitignore

# Reinstall git hooks if needed
pnpm run security:install-hooks
```

## Exit Codes

- **0**: All validations passed
- **Non-zero**: Validation errors found (check output)

## Related Skills

- [Nx Reset](nx-reset.md) - Clearing cache after fixes
- [Building](build.md) - Rebuilding after validation
- [Type Checking](typecheck.md) - Additional validation

## Related Documentation

- [Build System](../../../docs/architecture/build-system.md)
- [Security & Secrets](../../../docs/guides/security-and-secrets.md)
- [Development Setup](../../../docs/guides/development-setup.md)

## Validation Checklist

Before committing:

- [ ] Workspace dependencies aligned
- [ ] Package.json standards met
- [ ] No security issues
- [ ] No exposed credentials
- [ ] All validations pass
- [ ] Build succeeds after fixes
