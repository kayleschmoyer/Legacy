# Package.json Optimization Plan

## Summary

Current install time: ~15 minutes
Target install time: ~8-10 minutes
Total potential savings: ~200MB, 5-7 minutes

## Priority 1: Remove AWS SDK v2 (HIGH IMPACT)

### Issue

- `aws-sdk` v2 is 97MB and deprecated
- Already using AWS SDK v3 (`@aws-sdk/client-*`)
- Only dependency is `aws-lambda` package which just needs types

### Action

```bash
pnpm remove aws-sdk aws-lambda
pnpm add -D @types/aws-lambda
```

### Update imports in lambdas

Replace:

```typescript
import { Handler } from 'aws-lambda';
```

(No change needed - @types/aws-lambda provides same types)

**Estimated savings: 97MB, 2-3 min**

---

## Priority 2: Move Appium to Optional Dependencies (HIGH IMPACT)

### Issue

- `appium-uiautomator2-driver`: 72MB (Android testing)
- `appium-xcuitest-driver`: 42MB (iOS testing)
- Only needed for E2E mobile tests, not unit/integration tests

### Action

Update `package.json`:

```json
{
  "devDependencies": {
    "appium": "^3.1.0"
  },
  "optionalDependencies": {
    "appium-uiautomator2-driver": "^5.0.5",
    "appium-xcuitest-driver": "^10.2.1"
  }
}
```

### Update CI workflows

For jobs that need E2E:

```yaml
- name: Install E2E Dependencies
  if: matrix.test-type == 'e2e'
  run: pnpm add --save-optional appium-uiautomator2-driver appium-xcuitest-driver
```

**Estimated savings: 115MB, 3-4 min (for non-E2E runs)**

---

## Priority 3: Move Storybook to Optional (MEDIUM IMPACT)

### Issue

- 15 Storybook packages totaling ~44MB
- Only needed for component development, not CI validation

### Action

Create separate Storybook installation script:

```json
{
  "scripts": {
    "storybook:install": "pnpm add --save-optional $(cat .storybook-deps.txt)"
  }
}
```

Or use `optionalDependencies` similar to Appium approach.

**Estimated savings: 44MB, 1-2 min**

---

## Priority 4: Remove Duplicate Nx Package (LOW IMPACT)

### Issue

`nx` appears in both dependencies and devDependencies

### Action

```bash
# Remove from dependencies
pnpm remove nx
# Reinstall as devDependency only
pnpm add -D nx@21.5.2
```

**Estimated savings: Minor (deduped), cleanup**

---

## Priority 5: Review Python Tooling (IF UNUSED)

### Issue

`@nxlv/python`: 26MB

### Action

If not using Python projects:

```bash
npm uninstall @nxlv/python
```

Remove Python-related scripts from `package.json`:

- `create-python-project`
- `install:poetry`
- `setup:python`

**Estimated savings: 26MB, 30 seconds (if unused)**

---

## Priority 6: Consolidate Metro Configs (LOW IMPACT)

### Issue

Multiple Metro configs with version mismatches:

- `@expo/metro-config: 0.18.11`
- `metro: 0.82.5`
- `@react-native/metro-config: 0.79.6`

### Action

Audit which one is actually used, remove others.
Usually Expo projects use `@expo/metro-config`.

**Estimated savings: Minor, reduces confusion**

---

## Implementation Strategy

### Phase 1: Quick Wins (Can do now)

1. Remove AWS SDK v2 and aws-lambda
2. Remove duplicate Nx from dependencies
3. Remove unused Python tooling (if confirmed unused)

**Impact: ~120MB, 3-4 min savings**

### Phase 2: CI Optimization (Requires CI changes)

1. Move Appium drivers to optional
2. Update CI workflows to install E2E deps only when needed
3. Move Storybook to optional or separate install

**Impact: ~160MB, 4-6 min savings for most CI runs**

### Phase 3: Maintenance

1. Consolidate Metro configs
2. Review and remove legacy packages
3. Audit unused dependencies quarterly

---

## Testing Checklist

After each change:

- [ ] `pnpm install` completes successfully
- [ ] `pnpm exec nx affected -t typecheck` passes
- [ ] `pnpm exec nx affected -t test` passes
- [ ] `pnpm exec nx affected -t build` passes
- [ ] Lambda builds work
- [ ] Mobile app builds work
- [ ] E2E tests work (for Phase 2)

---

## Before/After Metrics

### Current

- Total dependencies: 94 production + 127 dev = 221
- Install time (cold): ~15 minutes
- node_modules size: ~1.2GB

### Target (After Phase 1)

- Install time (cold): ~10-12 minutes
- node_modules size: ~1.08GB

### Target (After Phase 2)

- Install time (cold, non-E2E): ~8-10 minutes
- Install time (cold, E2E): ~13-15 minutes
- node_modules size: ~900MB (non-E2E)
