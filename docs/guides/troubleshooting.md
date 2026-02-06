# Troubleshooting Guide

## Quick Resolution Index

### Common Build Issues

**Metro bundler cache issues:**

```bash
# Clear Metro cache
pnpm exec react-native start --reset-cache

# Or from project root
pnpm run clean:metro
```

**Node modules corruption:**

```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
pnpm install

# On Windows
rmdir /s node_modules
del package-lock.json
pnpm install
```

**Nx cache issues:**

```bash
# Clear Nx cache
pnpm exec nx reset

# Clean all build artifacts
pnpm run clean:all
```

### Cross-Platform Issues

**Component not found on mobile:**

- Check if using magic string system (`__PLATFORM_COMPONENTS__`)
- Verify `.native.ts` files exist for utilities
- See [Cross-Platform Architecture](../architecture/cross-platform-system.md)

**Styling differences between web/mobile:**

- Use Tamagui components for consistent styling
- Check platform-specific overrides in theme configuration
- Verify responsive breakpoints

**Import resolution errors:**

```bash
# Check Metro configuration
cat apps/app/metro.config.js

# Verify Vite aliases
cat apps/web/vite.config.mts
```

### Authentication Issues

**OAuth popup blocked:**

- Ensure OAuth triggered by user interaction
- Check browser popup settings
- Verify OAuth client ID configuration

**Token expired errors:**

- Check network connectivity
- Verify Lambda function health
- Review OAuth configuration in environment variables

**Cross-platform auth failures:**

- Verify secure storage implementation
- Check platform-specific OAuth configuration
- Review token storage mechanisms

### Scoring Issues

**UI shows `Unable to load scoring data`:**

- Ensure the signed-in user belongs to the league. `leagueScoringProfile` rejects non-members.
- In GraphQL Playground, run `query { leagueScoringProfile(leagueId: 1) { profileId } }` with the same token to confirm access.
- Run `npx nx run lambdas-db:migrate` to reseed default scoring profiles if tables were truncated.
- Inspect the GraphQL terminal for resolver errors referencing `scoring` or `LeagueScoringService`.
- Call `refetch()` on `useLeagueScoringSettings` or clear local storage to reset the cached provider state.

### Build System Issues

**Wrong build order:**

```bash
# Follow tier dependency order:
# Tier 1: env-utilities, logging, utils
pnpm run build:libs -- --projects=env-utilities,logging,utils

# Tier 2: tamagui-config, ui-abstractions
pnpm run build:libs -- --projects=tamagui-config,ui-abstractions

# Tier 3: Everything else
pnpm run build:libs
```

**TypeScript errors after pull:**

```bash
# Rebuild all dependencies
pnpm run build:libs

# Check for version mismatches
pnpm run check:deps
```

**Linting failures:**

```bash
# Fix lint issues automatically
pnpm run lint:fix

# Check specific project
pnpm exec nx lint shared-components
```

### Database Issues

**Connection failures:**

```bash
# Check database configuration
pnpm run db:status

# Verify environment variables
cat .env | grep DB_
```

**Migration failures:**

```bash
# Reset database (development only)
pnpm run db:reset

# Run migrations manually
pnpm run db:migrate
```

**Schema validation errors:**

- Check Drizzle schema definitions
- Verify database table structure matches schema
- Review migration scripts

### Infrastructure Issues

**AWS CLI encoding errors (Unicode/Emoji):**

```powershell
# Error: 'charmap' codec can't encode character '\U0001f504'
# Solution: Set Python encoding for AWS CLI
$env:PYTHONIOENCODING = "utf-8"
$env:AWS_PAGER = ""

# Then run your command (avoid piping to Select-Object)
aws logs tail /aws/lambda/legacy-sports-dev-stats --since 5m --no-cli-pager

# OR use the wrapper script (recommended)
.\scripts\aws-logs.ps1 -Function stats -Since 5m

# Add to PowerShell profile to make permanent:
echo '$env:PYTHONIOENCODING = "utf-8"' >> $PROFILE
echo '$env:AWS_PAGER = ""' >> $PROFILE

# Note: Piping to Select-Object may still cause errors
# Use --filter-pattern or redirect to file instead
```

**Lambda deployment failures:**

```bash
# Check Terraform state
cd terraform && terraform plan

# Verify AWS credentials
aws sts get-caller-identity

# Check Lambda function logs
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/
```

**API Gateway errors:**

- Check CORS configuration
- Verify API Gateway deployment
- Review Lambda integration settings

**VPC/Security group issues:**

- Verify security group rules
- Check subnet configuration
- Review NAT Gateway requirements

### Development Environment

**Port conflicts:**

```bash
# Check running processes
netstat -ano | findstr :3000
netstat -ano | findstr :4200

# Kill specific process (Windows)
taskkill /PID <PID> /F

# Kill specific process (Mac/Linux)
kill -9 <PID>
```

**Environment variable issues:**

```bash
# Sync environment variables
pnpm run sync-env

# Check current environment
pnpm run env:check

# Validate configuration
pnpm run validate:env
```

**VS Code configuration:**

```bash
# Reset VS Code workspace
rm -rf .vscode/settings.json

# Reinstall recommended extensions
code --install-extension ms-vscode.vscode-typescript-next
```

### Testing Issues

**Jest test failures:**

```bash
# Clear Jest cache
pnpm exec jest --clearCache

# Run tests with verbose output
pnpm run test -- --verbose

# Run specific test file
pnpm exec nx test shared-components --testPathPattern=auth
```

**E2E test failures:**

```bash
# Install Playwright dependencies
pnpm exec playwright install

# Run E2E tests with debugging
pnpm run e2e -- --debug

# Check test artifacts
ls test-results/
```

**Coverage issues:**

```bash
# Generate coverage report
pnpm run test:coverage

# View coverage details
open coverage/index.html
```

### Performance Issues

**Slow build times:**

```bash
# Enable Nx cloud caching
pnpm run nx:login

# Check build performance
pnpm exec nx run-many --target=build --all --parallel=3 --verbose
```

**Runtime performance:**

- Use React DevTools for component profiling
- Check for unnecessary re-renders
- Review bundle size with webpack-bundle-analyzer

**Memory issues:**

```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=8192"

# On Windows
set NODE_OPTIONS=--max-old-space-size=8192
```

## Platform-Specific Troubleshooting

### Android

**Build failures:**

```bash
# Clean Android build
cd apps/app/android
./gradlew clean

# Check Android SDK setup
echo $ANDROID_HOME
```

**APK signing issues:**

- Verify keystore configuration
- Check signing key permissions
- Review build.gradle settings

### iOS (When Enabled)

**Pod installation failures:**

```bash
cd apps/app/ios
pod install --repo-update
```

**Code signing issues:**

- Check provisioning profiles
- Verify team/bundle ID configuration
- Update Xcode if needed

### Web Deployment

**GitHub Pages deployment fails:**

- Check build output in `dist/`
- Verify base path configuration
- Review GitHub Actions logs

**Static asset issues:**

- Check public folder structure
- Verify asset path configuration
- Review Vite build settings

## Emergency Procedures

### Complete Environment Reset

```bash
# 1. Clean everything
pnpm run clean:all
rm -rf node_modules package-lock.json

# 2. Fresh install
pnpm install

# 3. Rebuild libraries in order
pnpm run build:libs

# 4. Run development setup
pnpm run sync-env
pnpm run dev
```

### Database Recovery (Development)

```bash
# 1. Backup current data (if needed)
pnpm run db:backup

# 2. Reset database
pnpm run db:reset

# 3. Run fresh migrations
pnpm run db:migrate

# 4. Seed development data
pnpm run db:seed
```

### Production Rollback

```bash
# 1. Revert to previous commit
git revert <commit-hash>

# 2. Redeploy infrastructure
cd terraform && terraform apply

# 3. Verify health checks
pnpm run health:check
```

## Getting Additional Help

### Internal Resources

1. **Architecture Documentation**: [docs/architecture/](../architecture/)
2. **Deployment Guides**: [docs/deployment/](../deployment/)
3. **Agent Instructions**: [docs/agents/](../agents/) (for AI-assisted debugging)

### External Resources

1. **NX Documentation**: https://nx.dev/troubleshooting
2. **React Native Troubleshooting**: https://reactnative.dev/docs/troubleshooting
3. **Tamagui Issues**: https://tamagui.dev/docs/intro/installation

### Escalation Path

1. Check this troubleshooting guide
2. Search existing GitHub issues
3. Consult agent CSV instructions
4. Create detailed issue with reproduction steps

---

**Remember**: When reporting issues, always include:

- Operating system and version
- Node.js version (`node --version`)
- npm version (`npm --version`)
- Error messages and stack traces
- Steps to reproduce the issue
