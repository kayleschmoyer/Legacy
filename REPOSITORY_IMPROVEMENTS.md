# Repository Improvements Plan

## 📋 Overview

This document outlines concrete, actionable improvements for the Legacy Sports Nx monorepo based on current analysis and best practices. Items are prioritized by impact and effort required.

---

## 🔥 Critical Issues (Fix Immediately)

### 1. **Dependency Management Alignment**
**Issue**: 9 projects have misaligned dependency versions, breaking workspace consistency.

**Current State**:
```bash
📁 lambdas\draft-processor:
  ⚠️  Dependency "aws-lambda" should use "*" but has "^1.0.7"
  ⚠️  DevDependency "@types/node" should use "*" but has "^22.7.5"
  ⚠️  DevDependency "typescript" should use "*" but has "^5.6.3"
  ⚠️  DevDependency "vite" should use "*" but has "^6.3.6"

📁 lib\sentry:
  ⚠️  Dependency "tslib" should use "*" but has "^2.3.0"
  ⚠️  Dependency "@sentry/node" should use "*" but has "^7.118.0"
  ⚠️  Dependency "@sentry/react-native" should use "*" but has "^7.118.0"
  ⚠️  Dependency "@sentry/browser" should use "*" but has "^7.118.0"
```

**Action Items**:
1. **Update Lambda Package Dependencies**
   ```bash
   # Files to modify:
   - lambdas/draft-processor/package.json
   - lambdas/game-selection/package.json
   - lambdas/oauth-proxy/package.json
   - lambdas/stats-lambda/package.json
   ```

2. **Update Library Dependencies**
   ```bash
   # Files to modify:
   - lib/sentry/package.json
   - lib/ui-abstractions/package.json
   ```

3. **Automated Fix Script**
   ```javascript
   // Create: scripts/fix-workspace-deps.js
   const fs = require('fs');
   const glob = require('glob');
   
   // Auto-update all workspace dependencies to use "*"
   // when available in root package.json
   ```

**Validation**:
```bash
node scripts/validate-workspace-deps.js
# Should show 0 issues after fixes
```

---

## ⚡ High Priority (Complete This Week)

### 2. **Nx Cloud Configuration**
**Issue**: Invalid CI Access Token causing distributed caching failures.

**Current Error**:
```
Invalid Credentials (CI Access Token): A workspace could not be found with the provided CI Access Token. (code: 401)
```

**Solutions** (Choose One):
```bash
# Option A: Fix Nx Cloud setup
npx nx connect-to-nx-cloud

# Option B: Remove Nx Cloud if not using
# Remove from nx.json:
"nxCloudAccessToken": "..."
```

**Files to Update**:
- `nx.json` - Remove or fix cloud token
- `.github/workflows/*` - Update CI configuration if using cloud

### 3. **Build System Documentation**
**Issue**: Missing clear build order documentation causing developer confusion.

**Create**: `BUILD_SYSTEM.md`
```markdown
# Build System Guide

## Dependency Order
1. **Core Libraries**: env-utilities, logging, utils
2. **Platform Libraries**: tamagui-config, ui-abstractions
3. **Data Libraries**: db-client, api
4. **Feature Libraries**: shared-components, scoring
5. **Applications**: web, app, cli
6. **Lambda Functions**: db, oauth-proxy, draft-processor

## Quick Commands
```bash
# Build everything in correct order
npm run build:all

# Build just libraries
npm run build:libs

# Build for development (with watch)
npm run dev
```
```

### 4. **ESLint Configuration Standardization**
**Issue**: Multiple ESLint configs with potential conflicts.

**Current Files**:
- `.eslintrc.base.json`
- `.eslintrc.json` 
- `.eslintrc.lambda.json`
- `.eslintrc.lib.json`
- `.eslintrc.react.json`

**Action**: Create unified configuration system:
```typescript
// Create: tools/eslint-config/index.js
module.exports = {
  base: require('./base'),
  react: require('./react'),
  lambda: require('./lambda'),
  library: require('./library')
};
```

---

## 🎯 Medium Priority (Complete This Month)

### 5. **Project Tagging System**
**Issue**: Projects lack meaningful tags for better organization and task targeting.

**Current State**: Most projects have `"tags": []`

**Recommended Tagging Strategy**:
```json
// Apps
"tags": ["scope:app", "platform:web"]      // web app
"tags": ["scope:app", "platform:mobile"]   // mobile app  
"tags": ["scope:app", "platform:node"]     // cli

// Libraries  
"tags": ["scope:lib", "type:ui", "platform:shared"]           // shared-components
"tags": ["scope:lib", "type:data", "platform:shared"]         // db-client
"tags": ["scope:lib", "type:config", "platform:shared"]       // tamagui-config

// Lambdas
"tags": ["scope:lambda", "type:api"]       // db lambda
"tags": ["scope:lambda", "type:auth"]      // oauth-proxy
"tags": ["scope:lambda", "type:worker"]    // draft-processor
```

**Benefits**:
```bash
# Target specific groups
nx run-many --target=build --projects=tag:scope:lib
nx run-many --target=test --projects=tag:platform:web
nx run-many --target=lint --projects=tag:type:api
```

### 6. **Improved Build Scripts**
**Issue**: Missing convenient build orchestration scripts.

**Add to `package.json`**:
```json
{
  "scripts": {
    "build:libs": "nx run-many --target=build --projects=tag:scope:lib",
    "build:apps": "nx run-many --target=build --projects=tag:scope:app", 
    "build:lambdas": "nx run-many --target=build --projects=tag:scope:lambda",
    "build:all": "nx run-many --target=build --all",
    "test:libs": "nx run-many --target=test --projects=tag:scope:lib",
    "test:apps": "nx run-many --target=test --projects=tag:scope:app",
    "lint:fix:all": "nx run-many --target=lint --all --fix",
    "clean:nx": "nx reset",
    "clean:deps": "rm -rf node_modules && rm -rf */node_modules && npm install"
  }
}
```

### 7. **Enhanced Validation Scripts**
**Issue**: Limited workspace validation beyond dependency checking.

**Create**: `scripts/validate-workspace.js`
```javascript
#!/usr/bin/env node

/**
 * Comprehensive workspace validation
 * - Dependency alignment
 * - Project structure consistency  
 * - Build configuration validation
 * - Import path validation
 * - Tag consistency
 */

const validations = [
  require('./validate-workspace-deps'),
  require('./validate-project-structure'), 
  require('./validate-import-paths'),
  require('./validate-build-config')
];

// Run all validations with reporting
```

### 8. **Development Environment Setup**
**Issue**: No standardized development environment setup guide.

**Create**: `DEVELOPMENT_SETUP.md`
```markdown
# Development Environment Setup

## Prerequisites
- Node.js 18+ 
- npm 9+
- Git

## Quick Start
```bash
# 1. Clone and install
git clone <repo>
npm install

# 2. Environment setup
npm run sync-env

# 3. Build core libraries
npm run build:libs

# 4. Start development
npm run dev
```

## Troubleshooting
- **Module resolution errors**: Run `npm run build:libs`
- **Database connection issues**: Run `npm run db:test`
- **GraphQL errors**: Ensure `npm run codegen` completed
```

---

## 🚀 Future Enhancements (Complete This Quarter)

### 9. **Nx Workspace Constraints**
**Issue**: No enforcement of dependency rules between projects.

**Add to `nx.json`**:
```json
{
  "workspaceLayout": {
    "appsDir": "apps",
    "libsDir": "lib"
  },
  "implicitDependencies": {
    "package.json": {
      "dependencies": "*",
      "devDependencies": "*"
    },
    "tsconfig.base.json": "*"
  },
  "tasksRunnerOptions": {
    "default": {
      "runner": "nx/tasks-runners/default",
      "options": {
        "cacheableOperations": ["build", "lint", "test", "format"]
      }
    }
  }
}
```

### 10. **Module Boundary Rules**
**Issue**: No enforcement preventing inappropriate cross-project imports.

**Create**: `.eslintrc.boundaries.js`
```javascript
module.exports = {
  extends: ['@nx/eslint-plugin-nx/recommended'],
  rules: {
    '@nx/enforce-module-boundaries': [
      'error',
      {
        enforceBuildableLibDependency: true,
        allow: [],
        depConstraints: [
          {
            sourceTag: 'scope:app',
            onlyDependOnLibsWithTags: ['scope:lib', 'platform:shared']
          },
          {
            sourceTag: 'scope:lambda', 
            onlyDependOnLibsWithTags: ['scope:lib', 'type:data']
          }
        ]
      }
    ]
  }
};
```

### 11. **Performance Monitoring**
**Issue**: No metrics on build performance and workspace health.

**Create**: `scripts/workspace-metrics.js`
```javascript
// Track and report:
// - Build times by project
// - Cache hit rates
// - Dependency graph complexity  
// - Test coverage by project
// - Bundle size analysis
```

### 12. **Automated Dependency Updates**
**Issue**: Manual dependency management across 24 projects.

**Create**: `.github/workflows/dependency-update.yml`
```yaml
name: Dependency Updates
on:
  schedule:
    - cron: '0 0 * * MON'  # Weekly on Monday
jobs:
  update-deps:
    runs-on: ubuntu-latest
    steps:
      - name: Update workspace dependencies
        run: |
          npm run update-workspace-deps
          npm run validate:workspace
```

### 13. **Docker Development Environment**
**Issue**: Environment inconsistency across developers.

**Create**: `docker-compose.dev.yml`
```yaml
version: '3.8'
services:
  app:
    build: 
      context: .
      dockerfile: Dockerfile.dev
    volumes:
      - .:/workspace
      - node_modules:/workspace/node_modules
    ports:
      - "3000:3000"   # Web app
      - "4000:4000"   # GraphQL API
    environment:
      - NODE_ENV=development
```

---

## 📊 Success Metrics

Track these metrics to measure improvement success:

### **Build Health**
- [ ] Workspace dependency validation: 0 errors (currently 9 errors)
- [ ] Build success rate: 100% (currently ~95%)  
- [ ] Average build time: <2 minutes for full build
- [ ] Cache hit rate: >70% for incremental builds

### **Developer Experience** 
- [ ] Setup time for new developers: <15 minutes
- [ ] Documentation completeness: All major workflows documented
- [ ] Error resolution time: <5 minutes for common issues

### **Code Quality**
- [ ] ESLint errors: 0 across all projects
- [ ] Test coverage: >80% for core libraries
- [ ] TypeScript strict mode: Enabled everywhere
- [ ] Circular dependencies: 0

### **Maintenance Overhead**
- [ ] Manual dependency updates: <1 hour/week
- [ ] Build configuration updates: <30 minutes/month
- [ ] New project setup: <10 minutes

---

## 🛠️ Implementation Timeline

### **Week 1 (Critical Issues)**
- [x] Analyze current state
- [ ] Fix dependency alignment issues
- [ ] Resolve Nx Cloud configuration
- [ ] Create build system documentation

### **Week 2-4 (High Priority)** 
- [ ] Implement project tagging system
- [ ] Add improved build scripts
- [ ] Create validation scripts
- [ ] Write development setup guide

### **Month 2 (Medium Priority)**
- [ ] Implement workspace constraints  
- [ ] Add module boundary rules
- [ ] Set up performance monitoring
- [ ] Create automated dependency updates

### **Quarter 1 (Future Enhancements)**
- [ ] Docker development environment
- [ ] Advanced caching strategies
- [ ] Module federation (if needed)
- [ ] Complete CI/CD pipeline optimization

---

## 📝 Next Steps

1. **Review this document** with the team
2. **Prioritize improvements** based on team needs
3. **Assign ownership** for each improvement area
4. **Set up tracking** for success metrics
5. **Begin implementation** starting with critical issues

---

*Last Updated: October 12, 2025*  
*Status: Ready for Implementation*
