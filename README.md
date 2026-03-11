# Legacy Sports

A modern sports data management platform built with React Native CLI, Next.js web, and AWS serverless backend.

> 🤖 **AI Agents**: Start here → [agents.md](agents.md) for complete contribution workflow and documentation index

## 🚀 CI Status

[![CI Pipeline](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/CI-Pipeline.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/ci-pipeline.yml)
[![DTE Detection](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/DTE-Detection.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/ci-pipeline.yml)
[![Nx DTE Status](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Nx-DTE-Status.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/ci-pipeline.yml)
[![Change Detection](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Change-Detection.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/ci-pipeline.yml)
[![Execution Plan](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Execution-Plan.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/ci-pipeline.yml)
[![Quality Gates](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Quality-Gates.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/ci-pipeline.yml)
[![Build Validation](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Build-Validation.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/ci-pipeline.yml)
[![E2E Testing](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/E2E-Testing.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/ci-pipeline.yml)
[![Deployment Gate](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Deployment-Gate.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/ci-pipeline.yml)

[![Branch](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Branch.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/ci-pipeline.yml)
[![Last Updated](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Last-Updated.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/ci-pipeline.yml)

## 🚢 Deployment Status

[![Upload Stats Lambda](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Upload-Stats-Lambda.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/upload-lambdas.yml)
[![Upload Game Selection Lambda](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Upload-Game-Selection-Lambda.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/upload-lambdas.yml)
[![Upload OAuth Proxy Lambda](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Upload-OAuth-Proxy-Lambda.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/upload-lambdas.yml)
[![Upload GraphQL Lambda](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Upload-GraphQL-Lambda.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/upload-lambdas.yml)
[![Upload Draft Processor Lambda](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Upload-Draft-Processor-Lambda.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/upload-lambdas.yml)
[![Apply Lambda Infrastructure](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Apply-Lambda-Infrastructure.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/lambda-terraform-apply.yml)
[![Build Android APK](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Build-Android-APK.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/build-android-app.yml)

## 🗄️ Database

[![DB Migrations](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/DB-Migrations.json)](https://github.com/bkrupa/legacy-sports/tree/main/lib/db-client/migrations)

Badge updates automatically whenever a migration is committed to `main`. It shows the total count and the date of the latest migration file in the repo. Run `pnpm run db:migrate` (or `npm run db:migrate` from the root) to apply any pending migrations to your local database.

## 🏥 Lambda Health Status

HTTP lambdas serve their own live badge — shields.io fetches directly from the endpoint on every page load (60-second cache). SQS/WebSocket lambdas have no HTTP surface and are polled every 15 minutes by the [Lambda Health Checks](https://github.com/bkrupa/legacy-sports/actions/workflows/lambda-health-checks.yml) workflow.

[![GraphQL Lambda](https://img.shields.io/endpoint?url=https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/badge)](https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/badge)
[![OAuth Proxy Lambda](https://img.shields.io/endpoint?url=https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/oauth/badge)](https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/oauth/health)
[![Game Selection Lambda](https://img.shields.io/endpoint?url=https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/games/badge)](https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/games/health)
[![Jira Proxy Lambda](https://img.shields.io/endpoint?url=https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/jira/badge)](https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/jira/health)
[![Stats Lambda](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Health-Stats-Lambda.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/lambda-health-checks.yml)
[![Draft Processor Lambda](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Health-Draft-Processor-Lambda.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/lambda-health-checks.yml)
[![WebSocket Lambda](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Health-WebSocket-Lambda.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/lambda-health-checks.yml)

## �🌐 Live Web App

[![Launch Web App](https://img.shields.io/badge/Launch-Web%20App-blue?style=for-the-badge&logo=vercel)](https://bkrupa.github.io/legacy-sports/)

**Production URL:** [https://bkrupa.github.io/legacy-sports/](https://bkrupa.github.io/legacy-sports/)

**Auto-Deploy:** Pushes to `main` branch automatically deploy via GitHub Pages

## 📱 Download Mobile App

### Android APK

[![Download Latest APK](https://img.shields.io/badge/Download-Latest%20APK-green?style=for-the-badge&logo=android)](https://github.com/bkrupa/legacy-sports/releases/latest)

**Latest Release:** [View all Android releases →](https://github.com/bkrupa/legacy-sports/releases)

**Installation Instructions:**

1. Download the APK file from the link above
2. Enable "Install from Unknown Sources" in your Android settings
3. Install the APK on your Android device

> **Note:** iOS builds are currently disabled as we are not actively using the iOS platform.

## � Security

[![Security Status](https://img.shields.io/badge/Security-Verified-green?style=flat-square&logo=shield)]()

All security vulnerabilities have been completely resolved. Run `pnpm audit` to verify **0 vulnerabilities**.

- **esbuild vulnerability (GHSA-67mh-4wv8-2f99):** Fixed via pnpm overrides
- **axios vulnerability (GHSA-4hjh-wcwx-xvwj):** Fixed via overrides + lockfile regeneration
- **Automatic protection:** Post-install script provides additional safety layer

### Security Verification

```powershell
# Verify no vulnerabilities
pnpm audit
# Expected output: found 0 vulnerabilities

# Run comprehensive security check
pnpm audit
```

For complete security details, see: **[Security Audit Status](docs/security/security-audit-status.md)**

## �🚀 Quick Start

### 📚 Documentation Hub

**👉 [Complete Documentation](docs/README.md)** - Central hub for all guides and references

### Essential Guides

- **🛠️ [Development Setup](docs/guides/development-setup.md)** - Complete environment setup
- **🔐 [Authentication Guide](docs/guides/authentication-guide.md)** - OAuth implementation and usage
- **🛠️ [Troubleshooting](docs/guides/troubleshooting.md)** - Common issues and quick fixes
- **🏗️ [Architecture Overview](docs/architecture/cross-platform-system.md)** - System design and patterns

### Prerequisites

- **Node.js**: v18+ (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- **pnpm**: Managed via [Corepack](https://nodejs.org/api/corepack.html)
- **Git**: Latest version
- **VS Code**: Recommended IDE with extensions

### Initial Setup

```powershell
# Clone the repository
git clone https://github.com/bkrupa/legacy-sports.git
cd legacy-sports

# Install dependencies
make install
```

## 📱 Development

### Available Applications

| App                  | Description             | Command                               |
| -------------------- | ----------------------- | ------------------------------------- |
| **Mobile App**       | React Native CLI app    | `pnpm exec nx serve app`              |
| **Web App**          | Next.js web application | `pnpm exec nx dev web`                |
| **GraphQL Explorer** | API testing interface   | `pnpm exec nx serve graphql-explorer` |

### Quick Development Commands

```powershell
# Start all development servers
pnpm run dev

# Run tests across all projects
pnpm exec nx affected -t test

# Build all projects
pnpm exec nx affected -t build

# Lint and format code
pnpm exec nx affected -t lint --fix
pnpm exec nx format:write
```

### Mobile Development

```powershell
# Start Metro bundler
pnpm exec nx start app

# Run on Android (requires Android Studio)
pnpm exec nx android app

# iOS builds are currently disabled

# Build Android APK
pnpm exec nx build-android app
```

### Web Development

```powershell
# Start web development server
pnpm exec nx dev web

# Build for production
pnpm exec nx build web

# Deployment is automatic via GitHub Pages on push to main
```

## 🏗️ Architecture

### Monorepo Structure

```
legacy-sports/
├── apps/                     # Applications
│   ├── app/                  # React Native mobile app
│   ├── web/                  # Next.js web app
│   ├── cli/                  # Command-line tools
│   └── graphql-explorer/     # GraphQL API explorer
├── lib/                      # Shared libraries (19 packages)
│   ├── shared-components/    # Cross-platform UI components
│   ├── db-client/            # Database client & migrations
│   ├── scoring/              # Scoring engine & calculations
│   ├── data-loaders/         # GraphQL data loaders
│   ├── api/                  # API utilities
│   ├── utils/                # Common utilities
│   └── ...                   # analytics, aws-utils, codegen, env-utilities, etc.
├── lambdas/                  # AWS Lambda functions
│   ├── db/                   # GraphQL API (database lambda)
│   ├── draft-processor/      # Draft pick processing (SQS)
│   ├── game-selection/       # Game selection logic
│   ├── oauth-proxy/          # Authentication proxy
│   ├── stats-lambda/         # Statistics data processing
│   ├── websocket/            # Real-time WebSocket connections
│   ├── jira-proxy/           # Jira integration proxy
│   └── layers/               # Shared Lambda layers
└── terraform/                # Infrastructure as Code
```

### Technology Stack

- **Frontend**: React Native CLI, Next.js, Tamagui UI
- **Backend**: AWS Lambda, API Gateway, PostgreSQL
- **Tools**: NX Monorepo, TypeScript, GraphQL
- **CI/CD**: GitHub Actions, Terraform

### Cross-Platform Architecture

Legacy Sports uses a **hybrid platform resolution system** that combines the best of both worlds:

#### 🔧 **Magic String System** (Complex UI Components)

- **Used for**: Icons, Tables, OAuth Providers, Complex React Components
- **Benefits**: Build-time optimization, strong type contracts, dead code elimination
- **Files**: `lib/shared-components/src/platform-components/`

```typescript
// Resolved at build time to platform-specific implementations
import { Icon, Table, OAuthProvider } from '@legacy-sports/shared-components';

<Icon name="search" size={24} />
<Table headers={headers} data={data} />
```

#### 🔧 **Metro Native Resolution** (Simple Utilities)

- **Used for**: DbOptions, AwsSecrets, SecureStorage, Configuration
- **Benefits**: Native Metro support, simple developer experience, CI reliability
- **Pattern**: `.native.ts` files automatically resolved by Metro bundler

```typescript
// Metro automatically picks .native.ts for React Native, .ts for web
import { SecureStorage, getDbOptions } from '@legacy-sports/shared-components';

await SecureStorage.setItem('key', 'value');
const options = getDbOptions();
```

**📚 Learn More**: [Cross-Platform Architecture](./docs/architecture/cross-platform-system.md)

## ⚙️ Configuration

### Environment Variables

Copy the example environment files and configure:

```bash
# Web app configuration
cp apps/web/.env.example apps/web/.env.local

# Configure GraphQL endpoint (defaults to dev environment)
# VITE_GRAPHQL_HOST=https://u65oy98s9d.execute-api.us-east-1.amazonaws.com/dev/graphql
```

### GraphQL API

The application connects to a live GraphQL API hosted on AWS. The endpoint is configured in:

- `apps/web/src/lib/apollo-client.ts`
- Environment variable: `VITE_GRAPHQL_HOST`

## 🧪 Testing

```bash
# Run all tests
pnpm exec nx run-many -t test

# Run tests for specific project
pnpm exec nx test web
pnpm exec nx test app

# Run tests in watch mode
pnpm exec nx test web --watch

# Run E2E tests
pnpm exec nx e2e web-e2e
```

## 🚀 Building & Deployment

### Automated Mobile Builds

Android APKs are automatically built and released on every push to `main`:

- **📱 Download**: [Latest Android APK](https://github.com/bkrupa/legacy-sports/releases/latest)
- **🔄 Auto-builds**: Triggered on app code changes
- **⚙️ Workflow**: `.github/workflows/build-android-app.yml`

Manual builds can also be triggered from [GitHub Actions](https://github.com/bkrupa/legacy-sports/actions/workflows/build-android-app.yml).

### Lambda Deployment

Lambdas use a two-step deployment process:

1. **Upload**: Individual Lambda uploads run in parallel (`.github/workflows/upload-*.yml`)
2. **Terraform Apply**: Single workflow applies all infrastructure changes (`.github/workflows/lambda-terraform-apply.yml`)

This ensures only one Terraform process runs at a time, preventing state lock conflicts.

### Local Mobile Builds

```bash
# Android APK
pnpm run build-android

# iOS builds are currently disabled
```

### Lambda Deployment

AWS Lambda functions are deployed via S3-based Terraform automation:

```powershell
# Deploy individual lambda
.\scripts\deploy-lambda.ps1 db

# Deploy all lambdas
.\scripts\deploy-lambda-all.ps1

# Via Terraform
Set-Location terraform; terraform apply
```

## 🛠️ Development Tools

### NX Commands

```powershell
# View project graph
pnpm exec nx graph

# Run affected tests only
pnpm exec nx affected -t test

# Build affected projects
pnpm exec nx affected -t build

# Show project details
pnpm exec nx show project web
```

### Code Quality

```powershell
# Lint all projects
pnpm exec nx affected -t lint

# Fix lint issues
pnpm exec nx affected -t lint --fix

# Format code
pnpm exec nx format:write

# Validate package.json standards
pnpm run validate:package-json
```

## 🔧 Troubleshooting

### Common Issues

**Metro bundler issues (React Native)**:

```powershell
# Clear Metro cache
pnpm exec react-native start --reset-cache

# Clean and rebuild
pnpm exec nx start app --reset-cache
```

**GraphQL connection issues**:

- Verify the endpoint URL in `apps/web/src/lib/apollo-client.ts`
- Check AWS Lambda function logs in CloudWatch

**Build errors**:

```powershell
# Clean all build artifacts
pnpm run clean

# Reinstall dependencies
Remove-Item -Recurse -Force node_modules, pnpm-lock.yaml
pnpm install
```

### Getting Help

1. Check the [Issues](https://github.com/bkrupa/legacy-sports/issues) page
2. Review recent commits for breaking changes
3. Ensure you're using the correct Node.js version
4. Verify all prerequisites are installed

## 🏗️ Infrastructure

The Legacy Sports backend runs on AWS serverless infrastructure managed with Terraform.

### Current Architecture

- **API Gateway**: `https://dtx9mcsty1.execute-api.us-east-1.amazonaws.com/dev`
- **Lambda Functions**: GraphQL, OAuth, Statistics, Game Selection, User Management
- **Database**: PostgreSQL RDS with VPC networking
- **Storage**: S3 buckets for deployment artifacts

### Recent Updates

**September 26, 2025**: Completed infrastructure cleanup

- Removed 2 legacy API Gateway instances
- Decommissioned unused Lambda function and S3 bucket
- Simplified architecture with cost optimization
- Zero downtime during cleanup process

### Documentation

- **📖 [Complete Documentation Hub](docs/README.md)** - Central documentation portal
- **🚀 [Deployment Guides](docs/deployment/)** - AWS, Terraform, and CI/CD setup
- **🏗️ [Architecture Docs](docs/architecture/)** - System design and technical documentation
- **📚 [Migration History](docs/migration-history/)** - Completed migrations and improvements
- **🤖 [AI Agent Instructions](docs/agents/)** - Structured guidance for AI development

## 📚 Additional Resources

- **NX Documentation**: https://nx.dev
- **React Native**: https://reactnative.dev
- **Tamagui UI**: https://tamagui.dev
- **AWS Lambda**: https://docs.aws.amazon.com/lambda/
- **Terraform**: https://terraform.io

---

Built with ❤️ using modern development tools and practices.

```

```
