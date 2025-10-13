# Next Agent Instructions: Fix Remaining 8 Failing Targets

## 🎯 Status Overview
**Previous Agent Completed:** Fixed all lint errors in `ui-abstractions`, `shared-components`, and `web` packages.

**Current Status:** 8 targets still failing out of 77 total targets.

**Success Rate:** 69/77 (89.6%) ✅

## 📋 Remaining Failing Targets

### **Critical Failures (Must Fix):**

1. **`shared-components:test:web`** - Component tests failing due to Tamagui Popover.Trigger undefined
2. **`shared-components:test:mobile`** - Same Popover.Trigger issue on mobile platform  
3. **`web:test`** - All 13 tests failing due to Popover.Trigger undefined in `app.tsx:64`
4. **`shared-components:typecheck`** - Cannot find `@legacy-sports/ui-abstractions` module
5. **`draft-processor:test`** - Jest config resolution error
6. **`oauth-proxy:typecheck`** - Type mismatch: `username: string | null` vs `string` 
7. **`stats-lambda:typecheck`** - SQS handler return type mismatch
8. **`game-selection:typecheck`** - Same SQS handler return type mismatch

## 🔥 Priority Order (Fix in this sequence):

### **CRITICAL - Fix First (Blocking Multiple Tests):**

#### **1. Tamagui Popover.Trigger Issue** 
**Affects:** `web:test`, `shared-components:test:web`, `shared-components:test:mobile`

**Root Cause:** `apps/web/src/app/app.tsx:64` - `Popover.Trigger` is undefined
```tsx
// FAILING LINE:
<Popover.Trigger asChild>
```

**Analysis:** 
- Error: `Cannot read properties of undefined (reading 'Trigger')`
- This suggests either:
  - Incorrect Tamagui Popover import
  - Missing Tamagui provider setup in tests
  - Version mismatch in Tamagui components

**Expected Fix Approach:**
```tsx
// Check current import in app.tsx - likely needs correction:
import { Popover } from 'tamagui'; // ❌ May be wrong

// Should probably be:
import { Popover } from '@tamagui/popper'; // ✅ Check actual Tamagui docs
// OR
import { Popover } from '@tamagui/popover'; // ✅ Check actual package
```

**Files to investigate:**
- `apps/web/src/app/app.tsx` (line 64)
- Test setup files for proper Tamagui provider configuration
- `package.json` dependencies for correct Tamagui packages

#### **2. UI Abstractions Module Resolution**
**Affects:** `shared-components:typecheck`

**Root Cause:** Module `@legacy-sports/ui-abstractions` not found
```
src/examples/UIAbstractionsExample.tsx(17,8): error TS2307: Cannot find module '@legacy-sports/ui-abstractions'
src/LoadingPanelMigrated.tsx(2,57): error TS2307: Cannot find module '@legacy-sports/ui-abstractions'
```

**Expected Fix Approach:**
- Build the `ui-abstractions` package first: `npx nx run ui-abstractions:build`
- Check if `ui-abstractions` package.json has correct `main` and `types` fields
- Ensure proper export from `lib/ui-abstractions/src/index.ts`
- Verify `shared-components` has correct dependency on `ui-abstractions` in its `package.json`

### **MEDIUM PRIORITY - Fix After Critical Issues:**

#### **3. Lambda TypeScript Issues**
**Affects:** `oauth-proxy:typecheck`, `stats-lambda:typecheck`, `game-selection:typecheck`

**oauth-proxy issue:**
```typescript
// src/handlers/Google.ts(548,33): Type 'string | null' is not assignable to type 'string'
user.username: string | null  // ❌ Current
user.username: string         // ✅ Expected by TokenResponse type
```

**SQS Lambda issues (stats-lambda & game-selection):**
```typescript
// dev.ts - SQS handler return type mismatch
(event: SQSEvent) => SQSBatchResponse | Promise<SQSBatchResponse>  // ❌ Current
(event: SQSEvent) => Promise<SQSBatchResponse>                     // ✅ Expected
```

#### **4. Jest Configuration Issue**
**Affects:** `draft-processor:test`

**Root Cause:** `Can't find a root directory while resolving a config file path`
```
Provided path to resolve: D:\code\legacy-sports\lambdas\draft-processor\jest.config.ts
```

**Expected Fix:** Check `jest.config.ts` in `lambdas/draft-processor/` for incorrect path references.

## 🛠 Step-by-Step Action Plan

### **Phase 1: Critical Fixes**

1. **Fix Tamagui Popover Issue:**
   ```powershell
   # 1. Check current imports in app.tsx
   # 2. Verify correct Tamagui Popover package
   # 3. Update import statement
   # 4. Ensure test setup has proper Tamagui providers
   ```

2. **Build ui-abstractions Package:**
   ```powershell
   npx nx run ui-abstractions:build
   # This should resolve the module not found errors
   ```

3. **Test Critical Fixes:**
   ```powershell
   npx nx run web:test
   npx nx run shared-components:test:web
   npx nx run shared-components:typecheck
   ```

### **Phase 2: Lambda TypeScript Fixes**

4. **Fix OAuth Proxy Type Issue:**
   - Update `src/handlers/Google.ts:548` to handle null username
   - Either make TokenResponse accept `string | null` or provide fallback value

5. **Fix SQS Handler Return Types:**
   - Update `stats-lambda/src/dev.ts:22` 
   - Update `game-selection/src/dev.ts:20,24`
   - Ensure handlers return `Promise<SQSBatchResponse>` consistently

6. **Fix Jest Config:**
   - Review `lambdas/draft-processor/jest.config.ts`
   - Fix path resolution issues

### **Phase 3: Verification**

7. **Run Full Test Suite:**
   ```powershell
   npm run all
   ```

8. **Verify All Targets Pass:**
   - Should see 77/77 targets successful
   - No more failing builds

## 🎯 Success Criteria

- **All 8 failing targets now pass**
- **Total success rate: 77/77 (100%)**
- **No TypeScript compilation errors**
- **All tests pass including web app tests**
- **UI abstractions package properly built and consumable**

## 📚 Key Resources

- **AGENTS.md** - Comprehensive guidance including:
  - `docs/agents/platform-components.csv` - For cross-platform compatibility  
  - `docs/agents/type-safety.csv` - For handling TypeScript `any` types
  - `docs/agents/troubleshooting.csv` - For systematic error resolution
  - `docs/agents/build-system.csv` - For Nx dependency management

## ⚠️ Important Notes

1. **Build Order:** Always build `ui-abstractions` before `shared-components`
2. **Platform Compatibility:** Remember this is a cross-platform codebase (web + React Native)
3. **Type Safety:** Follow the type safety guidelines from AGENTS.md
4. **Tamagui Version:** Check which Tamagui version/packages are being used consistently
5. **Jest Setup:** Tests may need proper Tamagui provider wrapper setup

## � Debugging Tips

**If Popover.Trigger still fails:**
- Check Tamagui documentation for correct import paths
- Verify test setup includes proper Tamagui configuration
- Look for version conflicts in package.json files

**If module resolution fails:**
- Ensure workspace dependencies are properly configured in nx.json
- Check if packages need to be rebuilt after the lint fixes
- Verify TypeScript path mappings

**If Lambda types fail:**
- Check AWS Lambda type definitions version compatibility
- Look for type declaration files that might need updating

---

**Good luck! The hardest part (lint errors) is done. These are mostly import/build/type issues that should resolve quickly once the Popover import is fixed and ui-abstractions is built properly.** 🚀
