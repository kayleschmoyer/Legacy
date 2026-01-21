# Skill: Affected Projects Check

## Overview
View and analyze which projects are affected by your changes using Nx's dependency graph.

## When to Use
- Want to see impact of your changes
- Planning refactoring work
- Understanding project dependencies
- Before running tests/builds on affected projects
- Debugging why certain projects are being tested

## Command

```powershell
# Show affected projects
pnpm exec nx show projects --affected
```

## Alternative Commands

### Visual Dependency Graph

```powershell
# Open interactive dependency graph in browser
pnpm exec nx graph

# Show only affected projects in graph
pnpm exec nx affected:graph
```

### List Affected Projects with Details

```powershell
# Show affected projects as list
pnpm exec nx show projects --affected

# Show with project types
pnpm exec nx show projects --affected --with-target=build
```

### Check Specific Project

```powershell
# Show project details
pnpm exec nx show project <project-name>

# Example:
pnpm exec nx show project shared-components
```

### See All Projects

```powershell
# List all projects in workspace
pnpm exec nx show projects

# Filter by tag
pnpm exec nx show projects --tag=scope:lib
pnpm exec nx show projects --tag=platform:web
```

## Expected Output
- **Project List**: Names of affected projects
- **Graph View**: Interactive visualization of dependencies
- **Details**: Project configuration and dependencies

## Common Issues

### Issue: No projects shown as affected
**Symptom**: Command shows no affected projects
**Solution**: Verify you have uncommitted changes
```powershell
# Check git status
git status

# If on main, create feature branch first
git checkout -b feature/test
```

### Issue: Too many projects affected
**Symptom**: Changes to shared library affects everything
**Solution**: This is expected - shared libraries impact many projects
```powershell
# See dependency graph to understand why
pnpm exec nx graph

# Consider splitting changes if possible
```

### Issue: Graph won't open
**Symptom**: Browser doesn't open or shows error
**Solution**: Check if port is available
```powershell
# Graph server uses port 4211 by default
# Close other instances or use different port
pnpm exec nx graph --port=4212
```

### Issue: Wrong base branch comparison
**Symptom**: Shows incorrect affected projects
**Solution**: Specify base branch explicitly
```powershell
# Compare against specific branch
pnpm exec nx affected:graph --base=main

# Or compare between two commits
pnpm exec nx affected:graph --base=HEAD~1 --head=HEAD
```

## Best Practices
1. **Check affected before running** expensive operations (tests, builds)
2. **Use visual graph** to understand dependencies
3. **Review impact** before merging large changes
4. **Consider scope** when refactoring shared code
5. **Document dependencies** that aren't obvious

## Understanding the Dependency Graph

### Graph Elements
- **Nodes**: Individual projects (apps, libs, lambdas)
- **Edges**: Dependencies between projects
- **Colors**: Different colors for different project types
- **Highlighted**: Affected projects shown in different color

### Interpreting Dependencies
```
web (app)
 ├── shared-components (lib)
 │    ├── ui-abstractions (lib)
 │    └── tamagui-config (lib)
 └── api (lib)
      └── db-client (lib)
```

If you change `ui-abstractions`:
- `shared-components` is affected (direct dependency)
- `web` is affected (transitive dependency through shared-components)
- Other apps using shared-components also affected

## Integration with Workflow

### Before Running Tests
```powershell
# 1. Check which projects will be tested
pnpm exec nx show projects --affected

# 2. If too many, consider smaller changes
# 3. Run affected tests
pnpm exec nx affected -t test
```

### Planning Refactoring
```powershell
# 1. View current dependencies
pnpm exec nx graph

# 2. Identify affected projects
pnpm exec nx show projects --affected

# 3. Plan changes to minimize impact
# 4. Consider splitting into multiple PRs
```

### Before PR Creation
```powershell
# 1. View affected projects
pnpm exec nx show projects --affected

# 2. Document in PR which projects are affected
# 3. Explain why they're affected
# 4. Note any breaking changes
```

## Common Queries

### Find Projects Using Specific Library
```powershell
# Show project dependencies
pnpm exec nx show project shared-components

# Or use graph to trace usage
pnpm exec nx graph
# Click on the project to see dependents
```

### Check Project Configuration
```powershell
# Show project details
pnpm exec nx show project <project-name>

# Shows:
# - Project type (app, lib, lambda)
# - Available targets (build, test, lint, etc.)
# - Tags
# - Dependencies
```

### Find All Libraries
```powershell
# List all library projects
pnpm exec nx show projects --tag=scope:lib

# List all applications
pnpm exec nx show projects --tag=scope:app

# List all lambdas
pnpm exec nx show projects --tag=scope:lambda
```

## Graph Visualization

### Opening the Graph
```powershell
# Standard graph
pnpm exec nx graph

# Only affected projects
pnpm exec nx affected:graph

# Save graph to file
pnpm exec nx graph --file=dependency-graph.html
```

### Graph Features
- **Search**: Find specific projects
- **Focus**: Click project to highlight dependencies
- **Filter**: Show only specific project types
- **Export**: Save as HTML file
- **Pan/Zoom**: Navigate large graphs

## Affected vs All

### Affected Commands (Faster)
```powershell
# Only tests affected projects
pnpm exec nx affected -t test

# Only builds affected projects
pnpm exec nx affected -t build
```

### Run All (Slower)
```powershell
# Tests everything
pnpm exec nx run-many -t test

# Builds everything
pnpm exec nx run-many -t build
```

## Performance Notes
- **Project list**: Instant
- **Graph generation**: 1-5 seconds
- **Graph rendering**: Opens browser immediately
- **Caching**: Results cached between commands

## Exit Codes
- **0**: Command successful
- **Non-zero**: Error occurred (check error message)

## Related Skills
- [Type Checking](typecheck.md) - Running affected typecheck
- [Testing](test.md) - Running affected tests
- [Building](build.md) - Building affected projects
- [Nx Reset](nx-reset.md) - Clearing cache if graph issues

## Related Documentation
- [Build System](../../../docs/architecture/build-system.md)
- [Nx Documentation](https://nx.dev/nx-api/nx/documents/affected)
- [Dependency Graph](https://nx.dev/nx-api/nx/documents/dep-graph)
