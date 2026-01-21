# Skill: Formatting

## Overview
Format code files using Prettier to ensure consistent code style across the project.

## When to Use
- Before committing changes (optional, but recommended)
- After writing new code
- When code style is inconsistent
- As part of code review preparation

## Command

```powershell
pnpm exec prettier --write .
```

## Alternative Commands

### Format specific files/directories
```powershell
pnpm exec prettier --write "apps/web/**/*.{ts,tsx,js,jsx}"
```

### Check formatting without writing (dry run)
```powershell
pnpm exec prettier --check .
```

### Format specific file
```powershell
pnpm exec prettier --write path/to/file.ts
```

### Format affected files only (using git)
```powershell
git diff --name-only --diff-filter=ACMR | Where-Object { $_ -match '\.(ts|tsx|js|jsx|json|md)$' } | ForEach-Object { pnpm exec prettier --write $_ }
```

## Expected Output
- **Files formatted**: List of files that were reformatted
- **No changes**: All files already formatted correctly

## Common Issues

### Issue: Conflicting ESLint rules
**Solution**: Configure Prettier and ESLint to work together (already configured in this project)

### Issue: Formatting changes ignored by git
**Solution**: Check `.gitattributes` for line ending settings

### Issue: Specific files/folders formatted incorrectly
**Solution**: Update `.prettierignore` to exclude them

### Issue: Team members use different Prettier versions
**Solution**: Use project-local Prettier via `pnpm exec`

## Best Practices
1. **Format before linting**: Prettier handles style, ESLint handles logic
2. **Use auto-format on save**: Configure VS Code to format on save
3. **Include in pre-commit**: Ensure all committed code is formatted
4. **Don't disable formatting**: Work with the established style
5. **Format entire files**: Avoid partial formatting

## Integration with Workflow

### Recommended Order
```powershell
pnpm exec prettier --write .         # Step 0 (optional)
pnpm exec nx affected -t typecheck   # Step 1
pnpm exec nx affected -t lint --fix  # Step 2
pnpm exec nx affected -t test        # Step 3
pnpm exec nx affected -t build       # Step 4
```

### VS Code Auto-format
Add to `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode"
}
```

## File Types Formatted
- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`)
- JSON (`.json`)
- Markdown (`.md`)
- CSS/SCSS
- HTML
- YAML

## Configuration

### Config File
`.prettierrc` or `prettier.config.js`

### Ignore File
`.prettierignore` - Excludes files/folders from formatting

## Common Formatting Options (Project Defaults)

```javascript
{
  semi: true,              // Use semicolons
  singleQuote: true,       // Use single quotes
  trailingComma: 'es5',    // Trailing commas where valid in ES5
  tabWidth: 2,             // 2-space indentation
  printWidth: 80,          // Line wrap at 80 characters
  arrowParens: 'avoid'     // Omit parens when possible
}
```

## Exit Codes
- **0**: All files formatted successfully
- **Non-zero**: Formatting errors occurred

## Performance Notes
- Very fast for individual files
- Can be slow for entire workspace
- Use affected files only for faster execution
- Parallel execution not needed (fast enough)

## Integration with Git Hooks

### Pre-commit Hook (Husky + lint-staged)
Automatically format staged files before commit:
```json
{
  "*.{ts,tsx,js,jsx,json,md}": "prettier --write"
}
```

## Formatting vs Linting

### Prettier Handles
- Code style (spacing, quotes, semicolons)
- Line breaks and wrapping
- Indentation
- Trailing commas

### ESLint Handles
- Code quality issues
- Best practices
- Potential bugs
- Security concerns

**They complement each other - use both!**

## Related Skills
- [Linting](lint.md)
- [Type Checking](typecheck.md)
