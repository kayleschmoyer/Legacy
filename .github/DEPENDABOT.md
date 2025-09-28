# Dependabot Configuration - Peer Dependency Management

This repository uses an enhanced Dependabot configuration designed to prevent peer dependency conflicts and maintain ecosystem compatibility.

## 🎯 Key Features

### 📦 **Ecosystem-Aware Grouping**

Dependencies are grouped by ecosystem to ensure related packages are updated together:

- **TypeScript ESLint**: `@typescript-eslint/*`, `eslint`
- **React Ecosystem**: `react`, `react-dom`, `@types/react*`
- **React Native**: All React Native and Expo packages
- **NX Monorepo**: All NX-related packages
- **Jest Testing**: Jest and related testing packages
- **Apollo GraphQL**: GraphQL, Apollo, and Postgraphile packages
- **Storybook**: All Storybook packages
- **Tamagui UI**: Tamagui component library
- **AWS SDK**: AWS-related packages
- **Dev Tools**: TypeScript, Prettier, build tools

### 🚫 **Major Version Ignores**

Major version updates are ignored for packages known to cause peer dependency conflicts:

- ESLint ecosystem (requires manual coordination)
- React/React Native (breaking changes)
- NX (requires migration scripts)
- Jest (testing setup changes)
- Expo (React Native coordination required)
- Storybook (migration required)

### 🔍 **Automatic Validation**

All Dependabot PRs are automatically validated:

- Peer dependency conflict detection
- Legacy peer deps compatibility check
- Basic functionality validation
- TypeScript ESLint configuration validation

### ✅ **Safe Auto-Approval**

Minor and patch updates without peer conflicts are automatically approved if validation passes.

## 📋 **Update Schedule**

- **NPM Dependencies**: Weekly (Mondays at 9 AM)
- **GitHub Actions**: Weekly (Tuesdays at 9 AM)
- **Docker**: Monthly (First Monday at 9 AM)

## 🔧 **Manual Override Process**

For major version updates that are ignored:

1. **Create manual PR** with updated versions
2. **Run validation**: `npm install --dry-run`
3. **Test with legacy peer deps**: `npm ci --legacy-peer-deps`
4. **Validate functionality**: Run tests and builds
5. **Update configs** if breaking changes detected

## 🚨 **Handling Peer Dependency Conflicts**

When Dependabot PRs show peer conflicts:

### 1. **Check the validation workflow output**

- Review peer dependency conflict details
- Check which packages are conflicting

### 2. **Common conflict patterns:**

**ESLint ecosystem conflicts:**

```bash
# Usually requires updating both parser and plugin together
npm install @typescript-eslint/parser@latest @typescript-eslint/eslint-plugin@latest --save-dev
```

**React ecosystem conflicts:**

```bash
# Often requires updating types packages
npm install @types/react@latest @types/react-dom@latest --save-dev
```

**NX ecosystem conflicts:**

```bash
# May require NX migration
npx nx migrate latest
```

### 3. **Resolution strategies:**

**Option A: Accept with legacy peer deps**

- Works for most cases
- Monitor for runtime issues
- Plan future alignment

**Option B: Manual resolution**

- Update conflicting packages manually
- Test thoroughly
- Create single coordinated PR

**Option C: Wait for ecosystem alignment**

- Close Dependabot PR
- Wait for compatible versions
- Re-enable updates later

## 🛠️ **Configuration Files**

- **`.github/dependabot.yml`**: Main configuration with grouping and ignores
- **`.github/workflows/validate-dependabot.yml`**: Validation workflow
- **`package.json`**: Dependency definitions

## 📊 **Monitoring**

Track dependency health:

1. **GitHub Dependency Graph**: Monitor vulnerabilities
2. **Dependabot Alerts**: Security updates
3. **PR Validation**: Peer dependency status
4. **CI/CD Health**: Build and test success rates

## 🔄 **Best Practices**

1. **Review grouped updates carefully** - multiple packages changing together
2. **Test major functionality** after React/React Native updates
3. **Update local environment** regularly to catch issues early
4. **Monitor build times** - dependency conflicts can slow builds
5. **Keep package-lock.json committed** - ensures reproducible builds

## 🚀 **Benefits**

- ✅ **Reduced peer dependency conflicts**
- ✅ **Automatic validation and safety checks**
- ✅ **Ecosystem-aware update coordination**
- ✅ **Safe auto-approval for low-risk updates**
- ✅ **Clear documentation and conflict resolution**
- ✅ **Reduced maintenance overhead**

This setup balances automatic dependency management with the need to maintain a stable, conflict-free dependency tree in a complex React Native/NX monorepo environment.
