# AI Agent Instructions for Legacy Sports

## Overview

This document provides essential guidance for AI agents working on the Legacy Sports codebase. Please read and understand these instructions before making any code changes.

## 🏗️ Platform Components Magic String System

### **CRITICAL: Understanding the Platform Abstraction**

The most important system to understand in this codebase is the **Platform Components Magic String System**. This enables cross-platform compatibility between web and React Native.

#### **How It Works**

1. **Consumer Code** imports from the abstraction layer:

   ```typescript
   import { OAuthProvider, FlatList, Platform } from './platform-components';
   ```

2. **Magic String Resolution** - The file `platform-components/index.ts` exports from:

   ```typescript
   import platformComponents from '__PLATFORM_COMPONENTS__';
   ```

3. **Build-Time Replacement** - Vite resolves the magic string based on target:

   ```typescript
   // vite.config.mts
   resolve: {
     alias: {
       '__PLATFORM_COMPONENTS__': `src/platform-components/${platform}/index.ts`
     }
   }
   ```

4. **Platform-Specific Implementation**:
   - **Web builds**: `__PLATFORM_COMPONENTS__` → `./web/index.ts`
   - **Mobile builds**: `__PLATFORM_COMPONENTS__` → `./mobile/index.ts`

5. **Final Bundle** contains ONLY platform-specific code (no runtime platform detection)

#### **Key Rules for Platform Components**

✅ **DO:**

- Add new platform implementations to both `web/index.ts` AND `mobile/index.ts`
- Export new components through the magic string in `platform-components/index.ts`
- Add shared types to `platform-components/types/` directory
- Use the build-time resolution system for platform differences

❌ **DON'T:**

- Import platform-specific files directly (`./web/ReactNativeEquivalents` ❌)
- Add runtime platform detection in the abstraction layer
- Replace magic string exports with direct imports
- Use dynamic imports/requires (defeats build-time optimization)

#### **Example: Adding a New Platform Component**

1. **Add type definition** in `platform-components/types/platform-exports.ts`:

   ```typescript
   interface PlatformExports {
     // ... existing components
     NewComponent: React.ComponentType<{ prop: string }>;
   }
   ```

2. **Add web implementation** in `platform-components/web/index.ts`:

   ```typescript
   export { WebNewComponent as NewComponent } from './ReactNativeEquivalents';
   ```

3. **Add mobile implementation** in `platform-components/mobile/index.ts`:

   ```typescript
   export { NewComponent } from 'react-native';
   ```

4. **Export from abstraction layer** in `platform-components/index.ts`:
   ```typescript
   export const {
     // ... existing exports
     NewComponent,
   } = validatePlatformExports(platformComponents);
   ```

## 📏 Type Safety Standards

### **Firm Types Policy**

**PRIORITY: Use strong, specific types wherever possible.**

✅ **Preferred Type Patterns:**

```typescript
// Specific object shapes
interface UserData {
  id: number;
  name: string;
  email: string;
}

// Union types for known values
type Status = 'loading' | 'success' | 'error';

// Generic constraints
interface ApiResponse<T> {
  data: T;
  status: number;
}

// Platform-safe property types
style?: React.CSSProperties; // For web-compatible styles
platformStyle?: Record<string, unknown>; // For cross-platform styles
```

❌ **Avoid `any` Types:**

```typescript
// BAD
const userData: any = fetchUser();
const styles: any = getStyles();

// GOOD
const userData: UserData = fetchUser();
const styles: React.CSSProperties = getStyles();
```

### **When `any` is Acceptable**

Only use `any` in these specific cases (with explanatory comments):

1. **Complex External Library Types:**

   ```typescript
   // Tamagui config has complex generic constraints
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   tamaguiConfig: any;
   ```

2. **React Native Animation API:**

   ```typescript
   // React Native Animated.Value has complex interpolation methods
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   animatedValue: any;
   ```

3. **Platform Compatibility:**

   ```typescript
   // Platform-specific global object modification
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   (window as any).StyleSheet = StyleSheet;
   ```

4. **Test/Example Code:**
   ```typescript
   // Mock configuration for examples only
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   const mockConfig = {} as any;
   ```

## � GraphQL API Architecture

### **CRITICAL: Understanding the GraphQL Infrastructure**

The Legacy Sports application uses a modern, serverless GraphQL API architecture that exposes career statistics and player data.

#### **Technology Stack**

**GraphQL Server:**

- **Apollo Server** (`@apollo/server`) - Industry-standard GraphQL implementation
- **Pothos** (`@pothos/core`) - Code-first, type-safe schema builder
- **AWS Lambda** - Serverless runtime for the GraphQL endpoint
- **AWS API Gateway** - HTTP routing and CORS handling

**Database Layer:**

- **PostgreSQL RDS** - Primary database with career statistics views
- **Drizzle ORM** - Type-safe database query builder
- **Database Views** - Pre-aggregated career statistics (`career_batting`, `career_pitching`, `career_fielding`)

#### **Key Architecture Files**

```
lambdas/db/
├── src/
│   ├── index.ts              # Main Lambda handler
│   ├── schema/
│   │   ├── builder.ts        # Pothos schema builder configuration
│   │   ├── players.ts        # Player GraphQL resolvers
│   │   ├── statistics.ts     # Career statistics resolvers
│   │   ├── users.ts          # User GraphQL resolvers
│   │   └── index.ts          # Schema assembly
│   └── dev.ts               # Local development server
├── package.json             # Dependencies (Apollo, Pothos, etc.)
└── CAREER_STATS_QUERIES.md  # Example GraphQL queries

terraform/
├── lambda-graphql.tf        # Lambda function infrastructure
├── api_gateway.tf           # API Gateway + routing configuration
└── outputs.tf              # GraphQL endpoint URLs
```

#### **Database Schema Integration**

**Season-Level Tables (Source Data):**

- `season_batting` - Batting statistics per player/season
- `season_pitching` - Pitching statistics per player/season
- `season_fielding` - Fielding statistics per player/season

**Career-Level Views (Aggregated):**

- `career_batting` - Lifetime batting totals per player
- `career_pitching` - Lifetime pitching totals per player
- `career_fielding` - Lifetime fielding totals per player

**GraphQL Integration:**

- Views are exposed through `StatisticsService` in `lib/db-client`
- GraphQL resolvers provide computed fields (batting average, ERA, etc.)
- Support for filtering, sorting, and pagination

#### **Available GraphQL Operations**

**Query Examples:**

```graphql
# Top home run hitters
careerBattingStats(limit: 10, orderBy: "homeRuns", minHomeRuns: 100)

# Player-specific career stats
playerCareerBatting(playerId: 123)
playerCareerPitching(playerId: 123)
playerCareerFielding(playerId: 123)

# Top pitchers by wins
careerPitchingStats(limit: 10, orderBy: "wins", minWins: 150)
```

#### **Development vs Production**

**Development:**

- `npm run dev` in `lambdas/db/` → Standalone server on port 5000
- Direct GraphQL Playground access at `http://localhost:5000`
- Local PostgreSQL connection

**Production:**

- AWS Lambda + API Gateway deployment
- Endpoint: `https://{api-id}.execute-api.us-east-1.amazonaws.com/{stage}/graphql`
- RDS PostgreSQL in VPC with connection pooling

#### **Key Rules for GraphQL Development**

✅ **DO:**

- Use Pothos schema builder for type-safe GraphQL definitions
- Add new resolvers in separate files under `lambdas/db/src/schema/`
- Expose database operations through service layer (`lib/db-client`)
- Include computed fields for common statistics (averages, percentages)
- Support filtering and pagination in list queries

❌ **DON'T:**

- Bypass the service layer - always use `DatabaseService` methods
- Add resolvers directly to `builder.ts` - use dedicated schema files
- Ignore null handling - career statistics can have null values
- Forget to register new schema files in `schema/index.ts`

#### **Career Statistics Service Integration**

The `StatisticsService` in `lib/db-client` provides:

```typescript
// Available in DatabaseService.statistics.*
getCareerBattingStats(options); // List with filtering/sorting
getCareerPitchingStats(options); // List with filtering/sorting
getCareerFieldingStats(options); // List with filtering/sorting
getPlayerCareerBatting(playerId); // Individual player stats
getPlayerCareerPitching(playerId); // Individual player stats
getPlayerCareerFielding(playerId); // Individual player stats
```

**Integration Pattern:**

```typescript
// In GraphQL resolver
const dbService = createDatabaseService(getDbOptions());
return dbService.statistics.getCareerBattingStats({
  limit: args.limit,
  orderBy: args.orderBy,
  filters: { minHomeRuns: args.minHomeRuns },
});
```

#### **Testing Career Statistics**

**Local Development:**

1. Start GraphQL server: `npm run dev` in `lambdas/db/`
2. Access GraphQL Playground: `http://localhost:5000`
3. Use example queries from `CAREER_STATS_QUERIES.md`

**Programmatic Testing:**

- GET request to `http://localhost:5000?test=career-stats`
- Runs test queries and outputs results to console
- Useful for validating data and performance

## �🔧 ESLint Standards

### **ESLint Enforcement Policy**

**PRIORITY: Fix the root cause rather than disabling rules.**

✅ **Preferred Solutions:**

```typescript
// Instead of disabling @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any ❌

// Create proper types
interface PlayerData {
  firstName: string;
  lastName: string;
  id: number;
}
const player: PlayerData = getPlayer(); ✅
```

✅ **When ESLint Disabling is Acceptable:**

1. **Documented Platform Compatibility:**

   ```typescript
   // Required for React Native/Web platform abstraction
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   ```

2. **External Library Constraints:**

   ```typescript
   // External library has incompatible type definitions
   // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
   ```

3. **Generated Code:**
   ```typescript
   // Generated by GraphQL codegen
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   ```

❌ **Don't Disable for Convenience:**

```typescript
// BAD - Just avoiding proper typing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = response;

// GOOD - Proper type definition
interface ApiResponse {
  users: User[];
  pagination: PaginationInfo;
}
const data: ApiResponse = response;
```

## 🚀 Development Workflow

### **Before Making Changes**

1. **Sync environment variables** - Run `npm run sync-env` to ensure database credentials are current
2. **Understand the platform implications** - Will this affect web, mobile, or both?
3. **Check existing types** - Look for existing interfaces before creating new ones
4. **Verify platform components** - Ensure both web and mobile implementations exist
5. **Run type checks** - Use `make typecheck` to verify TypeScript compliance

### **�️ Terminal & Command Compatibility**

**PRIORITY: Always check terminal type before running commands to ensure cross-platform compatibility.**

#### **Terminal Detection & Command Adaptation**

Before running any terminal commands, AI agents must:

1. **Check the user's current terminal type** from environment context
2. **Adapt commands for the specific shell** (PowerShell, bash, cmd, etc.)
3. **Use appropriate syntax** for the detected terminal

#### **Common Terminal Types & Command Syntax**

✅ **Windows PowerShell Examples:**

```powershell
# Use semicolons for command chaining
npm install; npm run build

# PowerShell-specific syntax for environment variables
$env:NODE_ENV = "development"; npm start

# Use PowerShell cmdlets where appropriate
Get-ChildItem -Recurse -Name "*.ts"
```

✅ **Bash/Unix Shell Examples:**

```bash
# Use && for command chaining
npm install && npm run build

# Unix-style environment variables
NODE_ENV=development npm start

# Unix commands
find . -name "*.ts" -type f
```

✅ **Cross-Platform Make Commands:**

```bash
# These work consistently across platforms
make install    # Always use make for primary workflows
make dev       # Make handles platform differences internally
make test      # Preferred over direct npm/node commands
```

#### **Detection Strategy**

```typescript
// Example of how to detect and adapt:
const isWindows = process.platform === 'win32';
const shell = process.env.SHELL || process.env.ComSpec;

// Adapt commands accordingly
const buildCommand = isWindows
  ? 'npm run build; npm run test'
  : 'npm run build && npm run test';
```

❌ **DON'T:**

- Assume Unix/bash syntax will work on Windows PowerShell
- Use Linux-specific commands without checking platform
- Ignore shell differences when providing command examples
- Use bare `&&` command chaining in PowerShell (use `;` instead)

✅ **DO:**

- Check environment context for terminal type
- Provide platform-appropriate command syntax
- Use Makefile commands when available (they handle cross-platform logic)
- Test command suggestions against the detected terminal type

### **�🚨 Fail Fast, Fail Early Philosophy**

**PRIORITY: Surface problems immediately rather than hiding or working around them.**

This codebase follows a strict "fail fast, fail early" approach to maintain code quality and developer productivity:

✅ **DO - Let Systems Fail Clearly:**

```typescript
// GOOD - Let TypeScript catch the error
interface UserData {
  id: number;
  name: string;
}
const user: UserData = fetchUser(); // Will fail at compile time if wrong type

// GOOD - Let validation fail immediately
if (!isValidEmail(email)) {
  throw new Error(`Invalid email format: ${email}`);
}

// GOOD - Let builds fail on lint errors
// Don't suppress ESLint rules - fix the root cause instead
```

✅ **DO - Fail Fast in CI/CD:**

- **Validation errors**: Let package.json validation fail the workflow completely
- **Type errors**: Fail builds immediately on TypeScript errors
- **Lint errors**: Fail on ESLint violations, don't suppress them
- **Test failures**: Stop the pipeline, don't continue with broken tests
- **Permission errors**: Fix root cause permissions, don't catch and hide errors

❌ **DON'T - Hide or Work Around Problems:**

```typescript
// BAD - Hiding type errors
const data: any = riskyOperation(); // Defeats type safety

// BAD - Suppressing validation
try {
  validatePackageJson();
} catch {
  console.log('Validation failed, but continuing anyway...'); // ❌
}

// BAD - Overly broad error handling
try {
  await github.rest.issues.createComment();
} catch (error) {
  // Catches ALL errors, not just expected ones ❌
  console.log('Something went wrong, ignoring...');
}
```

✅ **GOOD - Targeted Problem Solving:**

```typescript
// GOOD - Fix root cause with precise conditions
if (github.event_name === 'pull_request' && github.event.pull_request != null) {
  await github.rest.issues.createComment(); // Only when appropriate
}

// GOOD - Handle specific expected errors only
catch (error) {
  if (error.status === 403 && error.message.includes('Resource not accessible')) {
    // Handle this specific known case
  } else {
    throw error; // Re-throw unexpected errors
  }
}
```

#### **Why This Matters**

1. **Faster Debugging**: Problems surface immediately at their source
2. **Cleaner Codebase**: No hidden issues accumulating over time
3. **Better Developer Experience**: Clear error messages guide fixes
4. **Reliable CI/CD**: Pipelines catch issues before they reach production
5. **Maintainable Code**: Future developers understand failure modes clearly

#### **When Working with GitHub Actions**

- **Fix permission issues** by setting correct permissions, not catching errors
- **Fix context issues** by checking proper conditions, not broad try-catch
- **Let validation fail** when standards aren't met - that's the point of validation
- **Surface configuration problems** immediately rather than working around them

### **Code Quality Checks**

```bash
# Required checks before committing
make typecheck          # TypeScript validation
make lint              # ESLint validation
make test              # Unit tests
make build             # Build validation
```

### **Platform Testing**

```bash
# Test both platforms
make build-web         # Verify web build
make build-mobile      # Verify mobile build (if React Native setup available)
```

## 📚 Key Files to Understand

### **Platform Components**

- **`platform-components/index.ts`** - Main abstraction layer
- **`platform-components/types/platform-exports.ts`** - Type definitions
- **`platform-components/web/index.ts`** - Web implementations
- **`platform-components/mobile/index.ts`** - Mobile implementations
- **`vite.config.mts`** - Build-time magic string resolution
- **`.eslintrc.json`** - Linting rules and standards

### **GraphQL API & Database**

- **`lambdas/db/src/schema/index.ts`** - GraphQL schema assembly
- **`lambdas/db/src/schema/statistics.ts`** - Career statistics resolvers
- **`lib/db-client/src/lib/services/StatisticsService.ts`** - Statistics business logic
- **`lib/db-client/src/drizzle/public/models/Statistics.ts`** - Database schema definitions
- **`lambdas/db/CAREER_STATS_QUERIES.md`** - Example GraphQL queries

### **AWS Infrastructure (Terraform)**

- **`terraform/lambda-oauth-proxy.tf`** - OAuth Lambda (private subnets, user management)
- **`terraform/lambda-graphql.tf`** - GraphQL Lambda (private subnets, read-only API)
- **`terraform/database.tf`** - RDS PostgreSQL (private subnets, RDS Proxy)
- **`terraform/vpc.tf`** - VPC, subnets, routing (multi-layer security)
- **`terraform/vpc-endpoints.tf`** - Cost-effective AWS service access
- **`terraform/nat-instance.tf`** - Lightweight internet access (~$3.80/month)
- **`terraform/security_groups.tf`** - Network security rules
- **`terraform/variables.tf`** - Configuration variables (use_nat_instance, enable_rds_proxy)

## 🎯 Success Criteria

When working on this codebase, ensure:

✅ **Platform Compatibility** - Code works on both web and React Native  
✅ **Type Safety** - Strong typing with minimal `any` usage  
✅ **Build Success** - All targets compile without errors  
✅ **Lint Compliance** - No ESLint errors or warnings  
✅ **Test Coverage** - Existing tests pass, new features have tests  
✅ **Documentation** - Complex decisions are documented in code comments  
✅ **Fail Fast Philosophy** - Problems surface immediately, no error hiding or workarounds
✅ **Security Compliance** - No authentication credentials or secrets committed to git
✅ **AWS Architecture Compliance** - Lambdas in private subnets, RDS secured, cost-optimized infrastructure
✅ **API Security** - User mutations isolated from public GraphQL API, OAuth operations private

## �️ Database Credential Management

### **CRITICAL: Environment Setup & Credential Synchronization**

**PRIORITY: Always sync environment variables before running database operations.**

The Legacy Sports application uses a sophisticated credential management system that integrates AWS Secrets Manager with local development environments.

#### **🔄 Credential Sync Workflow**

**Before running any database operations (migrations, GraphQL server, etc.), you MUST sync credentials:**

```bash
# Required before any database operations
npm run sync-env

# Then run migrations
make db-migrate

# Or run other database commands
npm run db:test
```

#### **🏗️ How the Credential System Works**

1. **AWS Secrets Manager Storage**: Production database credentials are stored securely in AWS Secrets Manager
2. **Terraform Integration**: Infrastructure outputs provide secret names and database endpoints
3. **Sync Script**: `scripts/sync-env.ps1` pulls credentials and updates `.env` file
4. **Automatic Resolution**: Database clients automatically resolve credentials based on configuration

#### **📋 Credential Configuration Pattern**

```bash
# .env file after running npm run sync-env
USE_LOCAL_CREDENTIALS=false          # Use AWS Secrets Manager
DB_SECRET_NAME=prod/legacy-sports/rds # AWS secret containing credentials
DB_HOST=legacy-sports-proxy.xxx.rds.amazonaws.com # Database endpoint
DB_HOST_DIRECT=legacy-sports.xxx.rds.amazonaws.com # Direct endpoint for admin
```

#### **🔧 Available npm Scripts**

```bash
# Environment Management
npm run sync-env                    # Pull credentials from AWS and update .env

# Database Testing
npm run db:test                     # Test database connection (development)
npm run db:test:production          # Test database connection (production)
npm run db:url                      # Get database connection URL
npm run db:credentials              # Show resolved database credentials

# Database Migrations
make db-migrate                     # Run all pending migrations
npm run migrate:dry-run            # Preview migrations without applying
npm run migrate:status             # Show migration status
```

#### **⚠️ Common Issues & Solutions**

**❌ "Required env var DB_PASSWORD was not specified!"**

- **Solution**: Run `npm run sync-env` first to pull credentials from AWS

**❌ "Failed to resolve AWS credentials"**

- **Solution**: Ensure AWS credentials are configured (`aws sts get-caller-identity`)
- **Solution**: Check that you have access to the required AWS Secrets Manager

**❌ "Connection timeout" or "Connection refused"**

- **Solution**: Verify you're connected to the correct VPN/network for database access
- **Solution**: Check that `DB_HOST` is correctly set in `.env` after sync

#### **🔒 Security Best Practices**

✅ **DO:**

- Always run `npm run sync-env` to get latest credentials
- Use `USE_LOCAL_CREDENTIALS=false` for production/staging environments
- Let the credential system handle AWS Secrets Manager integration
- Use RDS Proxy endpoints for application connections
- Use direct endpoints only for administrative operations

❌ **DON'T:**

- Hardcode database passwords in any files
- Commit `.env` files with real credentials to git
- Bypass the credential sync system
- Use direct database endpoints in production application code

#### **🗂️ Key Files**

- **`scripts/sync-env.ps1`** - Credential sync script (PowerShell)
- **`scripts/sync-env.sh`** - Credential sync script (Bash)
- **`lib/db-client/src/config/credentials.ts`** - Credential resolution logic
- **`lib/db-client/src/config/database.ts`** - Database configuration
- **`.env.example`** - Template showing required environment variables

## �🔐 Authentication & Security Guidelines

### **CRITICAL: Never Commit Authentication Credentials**

**PRIORITY: Protect authentication secrets and credentials at all costs.**

#### **✅ Safe Authentication Practices:**

```bash
# ✅ SAFE - Environment files that should be committed:
apps/web/.env.example          # Template with placeholder values
apps/app/app.example.json      # Template configuration
terraform/terraform.tfvars.example  # Infrastructure template

# ✅ SAFE - These files are automatically ignored by .gitignore:
.env
.env.local
.env.production
.env.staging
.env.development
.env.working
.env.*.local
**/.xcode.env.local
```

#### **❌ NEVER Commit These Files:**

```bash
# ❌ DANGEROUS - These contain real credentials:
.env.local                     # Local environment with real OAuth URLs
.env.production               # Production secrets
terraform/terraform.tfvars   # Real infrastructure variables
terraform/secrets.auto.tfvars # Auto-generated secrets
aws-credentials.json          # AWS credentials
google-credentials.json       # Google OAuth secrets
*.pem                        # Private keys
*.key                        # Certificate keys
```

#### **🔍 Pre-Commit Security Checklist:**

**Before committing any code, verify:**

1. **No Real URLs**: Check that OAuth proxy URLs are placeholder values in committed files
2. **No API Keys**: Ensure no real Google Client IDs or secrets in tracked files
3. **No AWS Credentials**: Verify no AWS account IDs, access keys, or session tokens
4. **No Database Credentials**: Check for database passwords or connection strings
5. **No JWT Secrets**: Ensure no signing keys or encryption secrets

#### **🛡️ Authentication Configuration Pattern:**

```typescript
// ✅ GOOD - Use environment variables with modern AuthProvider pattern
import { AuthProvider } from '@legacy-sports/shared-components';
import type { OAuthConfig } from '@legacy-sports/shared-components';

const oauthConfig: OAuthConfig = {
  oauthProxyUrl:
    import.meta.env.VITE_OAUTH_PROXY_URL || 'http://localhost:5001',
  googleClientId:
    import.meta.env.VITE_GOOGLE_CLIENT_ID || 'placeholder-client-id',
};

<AuthProvider config={oauthConfig}>
  <App />
</AuthProvider>

// ❌ BAD - Hardcoded production values
const oauthConfig: OAuthConfig = {
  oauthProxyUrl:
    'https://u65oy98s9d.execute-api.us-east-1.amazonaws.com/dev/oauth', // ❌
  googleClientId:
    '1025244625243-dpatg6bbda3g86sipjr6eis4olnp6rc3.apps.googleusercontent.com', // ❌
};
```

#### **📋 Environment File Management:**

```bash
# ✅ Template files (safe to commit):
VITE_OAUTH_PROXY_URL=http://localhost:5001
VITE_GOOGLE_CLIENT_ID=your-google-client-id-here

# ✅ Local files (automatically ignored):
VITE_OAUTH_PROXY_URL=https://u65oy98s9d.execute-api.us-east-1.amazonaws.com/dev/oauth
VITE_GOOGLE_CLIENT_ID=1025244625243-dpatg6bbda3g86sipjr6eis4olnp6rc3.apps.googleusercontent.com
```

#### **🚨 If Credentials Are Accidentally Committed:**

1. **Immediately revoke** all exposed credentials
2. **Force push** a commit that removes the credentials
3. **Rotate all secrets** (OAuth clients, AWS keys, etc.)
4. **Update deployment** with new credentials
5. **Review git history** to ensure complete removal

#### **🔐 Secure Development Workflow:**

```bash
# 1. Copy template for local development
cp apps/web/.env.example apps/web/.env.local

# 2. Configure with real values (never commit this file)
# Edit .env.local with actual OAuth proxy URL

# 3. Verify .env.local is ignored before committing
git status  # Should not show .env.local

# 4. Only commit template files
git add apps/web/.env.example  # ✅ Safe
git commit -m "Update environment template"
```

## 🆘 Common Pitfalls

1. **Breaking Platform Abstraction** - Importing platform-specific files directly
2. **Type Shortcuts** - Using `any` instead of proper interfaces
3. **ESLint Avoidance** - Disabling rules instead of fixing root causes
4. **Build Assumptions** - Not testing changes on both web and mobile platforms
5. **Magic String Confusion** - Not understanding how `__PLATFORM_COMPONENTS__` works
6. **Error Suppression** - Catching and hiding errors instead of fixing root causes
7. **Workaround Mentality** - Working around problems instead of solving them properly
8. **🔴 SECURITY CRITICAL: Committing Credentials** - Adding real OAuth URLs, API keys, or secrets to git
9. **Environment File Confusion** - Committing `.env.local` instead of `.env.example`
10. **Hardcoded Authentication Values** - Using production URLs directly in code instead of environment variables
11. **Manual AWS Changes** - Making infrastructure changes through AWS Console instead of Terraform
12. **Terraform State Manipulation** - Modifying or deleting Terraform state files manually
13. **Skipping Terraform Planning** - Running `terraform apply` without reviewing the plan first
14. **🏗️ ARCHITECTURE CRITICAL: Exposing User Mutations** - Adding sensitive user operations to public GraphQL API
15. **Cost Inefficiency** - Using NAT Gateway instead of cost-effective NAT instance for development
16. **Lambda Placement Errors** - Putting OAuth Lambda outside VPC when database access is needed

## 🛠️ Repository Tooling & Architecture

### **Monorepo Structure (Nx Workspace)**

This is an **Nx monorepo** with multiple applications and shared libraries:

```
legacy-sports/
├── apps/                    # Applications
│   ├── app/                # React Native mobile app
│   ├── web/                # Web application (Vite + React)
│   ├── cli/                # CLI tools
│   └── graphql-explorer/   # GraphQL playground
├── lib/                    # Shared libraries
│   ├── shared-components/  # Cross-platform UI components
│   ├── api/               # GraphQL API layer
│   ├── db-client/         # Database utilities
│   ├── tamagui-config/    # UI system configuration
│   └── utils/             # Shared utilities
├── lambdas/               # AWS Lambda functions
│   ├── oauth-proxy/       # Authentication proxy
│   ├── stats-lambda/      # Statistics processing
│   └── game-selection/    # Game selection logic
└── terraform/             # Infrastructure as code
```

### **Build System & Tools**

- **Build Tool**: Vite (fast, modern bundler)
- **Monorepo**: Nx (task runner, dependency graph, caching)
- **Package Manager**: npm (with workspaces)
- **Task Automation**: Make (cross-platform Makefile)
- **Language**: TypeScript (strict mode enabled)
- **Mobile Framework**: React Native 0.79.6
- **UI System**: Tamagui (cross-platform design system)

### **Key Development Tools**

```bash
# Primary Commands
make help              # Show all available commands
make install          # Install all dependencies (Node + Python)
make build            # Build all projects
make test             # Run all tests
make lint             # Run ESLint + fix issues
make dev              # Start development servers

# Platform-specific
make android          # Run Android app
make ios              # Run iOS app
make dev:web          # Start web development server
```

### **Code Quality Stack**

- **Linting**: ESLint (error-level enforcement)
- **Formatting**: Prettier (LF line endings)
- **Type Checking**: TypeScript strict mode
- **Testing**: Jest + Playwright (E2E)
- **Git**: Conventional commits, .gitattributes normalization

## 📦 Package Architecture

### **Application Packages**

1. **`apps/app`** - React Native Mobile App
   - **Platform**: iOS + Android
   - **Framework**: React Native + Expo
   - **Navigation**: React Navigation
   - **State**: Apollo Client (GraphQL)

2. **`apps/web`** - Web Application
   - **Platform**: Web browsers
   - **Framework**: React + Vite
   - **Routing**: React Router
   - **State**: Apollo Client (GraphQL)

3. **`apps/cli`** - Command Line Tools
   - **Platform**: Node.js
   - **Purpose**: Development utilities, scripts
   - **Framework**: Commander.js

### **Library Packages**

1. **`lib/shared-components`** - Cross-Platform UI
   - **Purpose**: Shared React components (web + mobile)
   - **Key Feature**: Platform abstraction via magic strings
   - **Storybook**: Component documentation + testing

2. **`lib/api`** - GraphQL API Layer
   - **Purpose**: GraphQL schema, resolvers, data fetching
   - **Framework**: Apollo Server
   - **Database**: PostgreSQL via Drizzle ORM

3. **`lib/tamagui-config`** - Design System
   - **Purpose**: Tamagui configuration (themes, tokens, fonts)
   - **Cross-platform**: Web + React Native styling

4. **`lib/db-client`** - Database Layer
   - **Purpose**: Database connections, migrations, utilities
   - **ORM**: Drizzle (type-safe SQL)
   - **Database**: PostgreSQL
   - **Schema**: Season tables + career aggregation views
   - **Services**: PlayerService, UserService, StatisticsService

### **Lambda Functions**

1. **`lambdas/db`** - GraphQL API Server
   - **Purpose**: Main GraphQL API for player data and career statistics
   - **Runtime**: Node.js on AWS Lambda
   - **Framework**: Apollo Server + Pothos schema builder
   - **Database**: PostgreSQL via Drizzle ORM
   - **Features**: Career statistics views, computed fields, filtering/sorting

2. **`lambdas/oauth-proxy`** - Authentication
   - **Purpose**: OAuth flow handling, token management
   - **Runtime**: Node.js on AWS Lambda
   - **Framework**: Serverless functions

3. **`lambdas/stats-lambda`** - Statistics Processing
   - **Purpose**: Sports statistics calculations
   - **Runtime**: Node.js on AWS Lambda
   - **Data Sources**: External sports APIs

4. **`lambdas/game-selection`** - Game Logic
   - **Purpose**: Game selection algorithms
   - **Runtime**: Node.js on AWS Lambda

### **Infrastructure**

- **Cloud Provider**: AWS
- **Infrastructure as Code**: Terraform
- **Database**: RDS PostgreSQL
- **API Gateway**: AWS API Gateway
- **Authentication**: OAuth 2.0 + JWT

#### **🏗️ AWS Lambda Architecture**

**CRITICAL: Understanding the Secure Lambda Network Architecture**

The Legacy Sports application uses a secure, cost-optimized AWS Lambda architecture with proper network isolation:

**Architecture Components:**

1. **OAuth Proxy Lambda** (`lambdas/oauth-proxy/`):
   - **Location**: Private subnets with VPC configuration
   - **Internet Access**: Via cost-effective NAT instance (~$3.80/month vs $45 NAT Gateway)
   - **Purpose**: Secure user authentication and management
   - **Database Access**: Direct RDS Proxy access for user operations
   - **Security**: No public API exposure for user mutations

2. **GraphQL Lambda** (`lambdas/db/`):
   - **Location**: Private subnets with VPC configuration
   - **Purpose**: Public read-only API for career statistics and player data
   - **Database Access**: RDS Proxy for connection pooling
   - **Security**: No user mutation capabilities, safe for public consumption

3. **Network Security**:
   - **RDS**: Private database subnets, no public accessibility
   - **RDS Proxy**: Private database subnets, connection pooling enabled
   - **VPC Endpoints**: Secrets Manager, CloudWatch Logs, S3 for AWS service access
   - **NAT Instance**: t3.nano instance for cost-effective internet access

**Key Security Benefits:**

- ✅ **Separation of Concerns**: User management isolated from public API
- ✅ **Zero Attack Surface**: Sensitive user operations not exposed publicly
- ✅ **Cost Optimized**: 91% savings vs NAT Gateway (~$492/year savings)
- ✅ **Network Isolation**: Multi-layer subnet security
- ✅ **Public Accessibility**: Both APIs remain accessible via API Gateway

**Architecture Rules:**

- ✅ **DO**: Keep OAuth Lambda in private subnets for security
- ✅ **DO**: Use NAT instance for cost-effective internet access
- ✅ **DO**: Enable RDS Proxy for production workloads
- ❌ **DON'T**: Expose user mutations through public GraphQL API
- ❌ **DON'T**: Place RDS in public subnets
- ❌ **DON'T**: Use expensive NAT Gateway unless high availability required

#### **Terraform Configuration**

**PRIORITY: All AWS resources are managed through Terraform for consistency and reproducibility.**

✅ **Terraform Best Practices:**

- **All infrastructure changes** must be made through Terraform configuration files in `/terraform/`
- **No manual AWS Console changes** - all resources should be defined as code
- **Environment separation** - separate `.tfvars` files for dev/staging/production
- **State management** - Terraform state is stored remotely (S3 backend)
- **Version control** - All `.tf` files are tracked in git, credentials are not

✅ **Key Terraform Files:**

```bash
terraform/
├── main.tf                    # Core infrastructure definitions
├── api_gateway.tf            # API Gateway configuration with CORS
├── lambda-oauth-proxy.tf     # OAuth proxy Lambda (private subnets)
├── lambda-graphql.tf         # GraphQL Lambda (private subnets)
├── lambda-stats.tf           # Statistics Lambda functions
├── lambda-game-selection.tf  # Game selection Lambda
├── database.tf               # RDS configuration (private subnets)
├── vpc.tf                    # VPC, subnets, and routing configuration
├── vpc-endpoints.tf          # VPC endpoints for AWS services
├── nat-instance.tf           # Cost-effective NAT instance setup
├── security_groups.tf        # Network security group rules
├── secrets.tf                # AWS Secrets Manager configuration
├── variables.tf              # Input variables (includes use_nat_instance)
├── outputs.tf                # Output values (API endpoints)
├── terraform.tfvars.example  # Template for environment variables
└── versions.tf               # Provider version constraints
```

**Critical Variables for Secure Architecture:**

- `enable_rds_proxy = true` - Enable RDS Proxy for production
- `use_nat_instance = true` - Use cost-effective NAT instance instead of NAT Gateway
- `nat_gateway_count = 0` - Disable expensive NAT Gateway

✅ **Terraform Workflow:**

```bash
# Initialize Terraform (first time setup)
cd terraform
terraform init

# Plan changes (review before applying)
terraform plan -var-file="terraform.tfvars"

# Apply changes (deploy infrastructure)
terraform apply -var-file="terraform.tfvars"

# View current state
terraform show

# Destroy infrastructure (use with caution)
terraform destroy -var-file="terraform.tfvars"
```

❌ **DON'T:**

- Make manual changes in AWS Console that aren't reflected in Terraform
- Commit `terraform.tfvars` files with real credentials
- Apply Terraform changes without reviewing the plan first
- Delete Terraform state files or modify them manually

## 🔧 Development Environment Setup

### **Prerequisites**

```bash
# Required tools
node --version          # Node.js 18+ required
npm --version          # npm 8+ required
make --version         # GNU Make or compatible
git --version          # Git 2.20+ required

# Optional but recommended
poetry --version       # Python package manager
aws --version          # AWS CLI for deployments

terraform --version    # Terraform for infrastructure management
```

### **Initial Setup**

```bash
# 1. Clone and setup
git clone <repo-url>
cd legacy-sports
make install           # Installs Node + Python dependencies

# 2. Verify setup
make typecheck         # Ensure TypeScript compiles
make lint             # Ensure code quality
make test:all         # Run all tests

# 3. Start development
make dev              # Starts all development services
```

### **Development Workflow**

```bash
# Daily workflow
git pull origin main           # Get latest changes
npm run sync-env              # Sync database credentials from AWS
make install                  # Update dependencies
make dev                      # Start development servers

# Before committing
make lint:fix                 # Auto-fix linting issues
make typecheck               # Verify TypeScript
make test:changed            # Run tests for changed files
git add . && git commit      # Commit changes
```

### **Common Development Tasks**

```bash
# Code generation
make codegen                 # Generate GraphQL types, DB schema

# Mobile development
make android                 # Run Android emulator
make ios                    # Run iOS simulator
make build-android          # Build Android APK
make build-ios             # Build iOS IPA

# Web development
make dev:web               # Start web dev server
make build:web            # Build web for production

# Lambda development
make dev:lambdas          # Start local lambda servers
make deploy:lambda        # Deploy to AWS

# Infrastructure management (Terraform)
cd terraform             # Navigate to Terraform directory
terraform plan           # Preview infrastructure changes
terraform apply          # Deploy infrastructure changes
terraform destroy        # Tear down infrastructure (caution)
```

## 🗄️ Database Schema Architecture

### **CRITICAL: Season-to-Career Data Pattern**

The database follows a **season-level source + career-level views** pattern that is essential to understand:

#### **Season-Level Tables (Source Data)**

**Primary Tables:**

- `season_batting` - Individual season batting statistics per player
- `season_pitching` - Individual season pitching statistics per player
- `season_fielding` - Individual season fielding statistics per player

**Key Features:**

- One row per player per season per team
- Composite primary keys: `(player_id, season, team, row_id)`
- Complete granular data for analysis
- Foreign key references to `players` table

#### **Career-Level Views (Aggregated Data)**

**Aggregated Views:**

- `career_batting` - Lifetime batting totals (SUM of all seasons)
- `career_pitching` - Lifetime pitching totals (SUM of all seasons)
- `career_fielding` - Lifetime fielding totals (SUM of all seasons)

**SQL Pattern:**

```sql
-- Example career_batting view
SELECT player_id,
       sum(g) AS g,
       sum(ab) AS ab,
       sum(h) AS h,
       sum(hr) AS hr
FROM season_batting
WHERE lg_id IN ('AL', 'NL')  -- Major league filtering
GROUP BY player_id
```

#### **Architecture Benefits**

✅ **Granular Analysis** - Query specific seasons, teams, or date ranges  
✅ **Performance** - Pre-aggregated views for fast career stats lookups  
✅ **Data Integrity** - Views automatically update when season data changes  
✅ **Filtering** - Built-in league filtering (AL/NL only) in career views  
✅ **Scalability** - Add new seasons without schema changes

#### **GraphQL Integration**

The career views are exposed through the `StatisticsService` and GraphQL resolvers:

```typescript
// Database Service Layer
dbService.statistics.getCareerBattingStats()   // Uses career_batting view
dbService.statistics.getCareerPitchingStats()  // Uses career_pitching view
dbService.statistics.getCareerFieldingStats()  // Uses career_fielding view

// GraphQL Queries
careerBattingStats(limit: 10, orderBy: "homeRuns")
playerCareerBatting(playerId: 123)
```

#### **Key Schema Files**

```
lib/db-client/src/drizzle/public/models/Statistics.ts  # Table/view definitions
lib/db-client/src/lib/services/StatisticsService.ts   # Business logic layer
lambdas/db/src/schema/statistics.ts                   # GraphQL resolvers
```

## 🔧 Development Environment Setup

````

## 🎯 Code Organization Standards

### **Import Organization**

```typescript
// 1. External libraries
import React from 'react';
import { useQuery } from '@apollo/client';

// 2. Internal libraries (lib/)
import { Button } from '@legacy-sports/shared-components';
import { useAuth } from '@legacy-sports/api';

// 3. Platform components (magic string system)
import { Platform, FlatList } from './platform-components';

// 4. Relative imports
import { PlayerCard } from './PlayerCard';
import type { PlayerData } from '../types';
````

### **File Naming Conventions**

```
components/
├── PlayerCard.tsx          # PascalCase for components
├── PlayerCard.test.tsx     # .test. for unit tests
├── PlayerCard.stories.tsx  # .stories. for Storybook
└── index.ts               # Barrel exports

utils/
├── formatDate.ts          # camelCase for utilities
├── api-helpers.ts         # kebab-case for multi-word
└── types.ts              # Shared type definitions

hooks/
├── usePlayer.ts          # camelCase starting with 'use'
├── usePlayerStats.ts     # Clear, descriptive names
└── index.ts             # Barrel exports
```

### **Testing Strategies**

- **Unit Tests**: Jest for business logic, utilities
- **Component Tests**: React Testing Library for UI components
- **Integration Tests**: Playwright for E2E workflows
- **Visual Tests**: Storybook for component visual regression
- **API Tests**: GraphQL schema validation, resolver tests

## 🔄 GraphQL Code Generation

### **Critical GraphQL Codegen Process**

**PRIORITY: Always ensure GraphQL service is running before codegen.**

#### **GraphQL Codegen Requirements:**

1. **Start GraphQL Service First:**

   ```bash
   # Start the GraphQL server locally
   cd lambdas/db
   npm run dev  # Starts Apollo Server on port 5000
   # GraphQL Playground available at http://localhost:5000
   ```

2. **Set Correct Environment Variable:**

   ```bash
   # PowerShell syntax for Windows
   $env:VITE_GRAPHQL_HOST = "http://localhost:5000/graphql"
   make codegen
   ```

3. **Codegen Configuration Location:**

   ```
   lib/shared-components/codegen.ts  # Main codegen config
   schema: process.env.VITE_GRAPHQL_HOST || 'http://localhost:5000/graphql'
   documents: ['src/api/db/**/*.graphql', 'src/features/**/PlayerStatsQueries.ts']
   ```

4. **Available Career Statistics Schema:**
   The GraphQL schema includes comprehensive career statistics types:
   ```graphql
   # Available queries for codegen
   careerBattingStats(limit: Int, orderBy: String, filters: CareerBattingFilters)
   careerPitchingStats(limit: Int, orderBy: String, filters: CareerPitchingFilters)
   careerFieldingStats(limit: Int, orderBy: String, filters: CareerFieldingFilters)
   playerCareerBatting(playerId: Int!)
   playerCareerPitching(playerId: Int!)
   playerCareerFielding(playerId: Int!)
   ```

#### **Common GraphQL Codegen Issues:**

❌ **Schema Mismatch Errors:**

```
Cannot query field "careerBattings" on type "Player"
Unknown type "Cursor"
Unknown argument "first" on field "Query.players"
```

✅ **Resolution Strategy:**

1. Verify GraphQL schema includes expected fields (career statistics are available via dedicated queries)
2. Check if queries match the actual GraphQL endpoint schema (use career\* queries for statistics)
3. Consider if queries expect a different GraphQL service (stats vs basic player data)
4. Use the dedicated career statistics queries rather than nested player fields

#### **When Codegen Fails:**

**Follow AGENTS.md ESLint Policy: "Fix the root cause rather than disabling rules"**

1. **First Priority**: Fix schema/query mismatch
2. **Second Priority**: Create proper TypeScript interfaces based on actual data structure
3. **Last Resort**: Strategic ESLint disables with detailed comments (only for external library constraints)

### **Lint Error Resolution Workflow**

#### **Systematic Approach to Large Lint Error Counts:**

1. **Categorize Errors by Type:**
   - Import ordering issues (auto-fixable)
   - Unused variables/imports (usually fixable)
   - Floating promises (add `void` operator)
   - Type safety issues (create proper interfaces)

2. **Fix in Order of Impact:**

   ```bash
   # 1. Auto-fix what's possible
   make lint:fix

   # 2. Address structural issues
   # - Import ordering
   # - Unused imports
   # - Floating promises

   # 3. Create proper types for GraphQL data
   # - Define interfaces based on actual API responses
   # - Use defensive programming with optional chaining

   # 4. Strategic disables only when necessary
   ```

3. **Progress Tracking Pattern:**
   - Start: 200+ errors → Basic fixes: ~50 errors → Proper types: 0 errors
   - Track error reduction to show progress
   - Focus on categories that yield biggest reductions first

#### **GraphQL Type Safety Best Practices:**

✅ **Create Specific Interfaces:**

```typescript
// GOOD - Specific interface for GraphQL response
interface GraphQLPlayerResponse {
  id: number;
  name: string;
  careerBattings?: {
    nodes?: Array<{
      g?: number;
      pa?: number;
      // ... other optional fields with fallbacks in code
    }>;
  };
}
```

❌ **Don't Use Generic any:**

```typescript
// BAD - Defeats type safety
function transformPlayerData(rawPlayer: any): PlayerWithStats;
```

## 📝 Lint Error Documentation

### **Common Patterns and Solutions:**

1. **Floating Promises:**

   ```typescript
   // Problem
   fetchMore({ after: cursor }); // ❌

   // Solution
   void fetchMore({ after: cursor }); // ✅
   ```

2. **Import Ordering:**

   ```typescript
   // Use ESLint auto-fix: make lint:fix
   // External libraries first, internal second, relative third
   ```

3. **Type Safety with Optional GraphQL Data:**
   ```typescript
   // Use defensive programming with proper interfaces
   const batting = rawPlayer.careerBattings?.nodes?.[0];
   careerBatting.games = batting?.g || 0; // Safe fallback
   ```

---

**Remember**: This codebase prioritizes cross-platform compatibility and type safety. When in doubt, ask for clarification rather than making assumptions that could break the platform abstraction system.
