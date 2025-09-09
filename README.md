# Legacy Sports

A modern sports data management platform built with React Native CLI, Next.js web, and AWS serverless backend.

## 🚀 Quick Start

### Prerequisites

- **Node.js**: v18+ (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- **npm**: Latest version
- **Git**: Latest version
- **VS Code**: Recommended IDE with extensions

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/bkrupa/legacy-sports.git
cd legacy-sports

# Install dependencies
npm install

# Configure Python environment (for backend tools)
# This tool will guide you through Python setup
npm run setup:python
```

## 📱 Development

### Available Applications

| App | Description | Command |
|-----|-------------|---------|
| **Mobile App** | React Native CLI app | `npm run app:start` |
| **Web App** | Next.js web application | `npm run web:start` |
| **GraphQL Explorer** | API testing interface | `npm run gql:start` |

### Quick Development Commands

```bash
# Start all development servers
npm run dev

# Run tests across all projects
npm test

# Build all projects
npm run build

# Lint and format code
npm run lint:fix
npm run format
```

### Mobile Development

```bash
# Start Metro bundler
npm run app:start

# Run on Android (requires Android Studio)
npm run app:android

# Run on iOS (requires Xcode - macOS only)
npm run app:ios

# Build Android APK
npm run app:build-android
```

### Web Development

```bash
# Start web development server
npm run web:start

# Build for production
npm run web:build

# Deploy to GitHub Pages (auto-deployed on main branch)
npm run web:deploy
```

## 🏗️ Architecture

### Monorepo Structure

```
legacy-sports/
├── apps/                    # Applications
│   ├── app/                # React Native mobile app
│   ├── web/                # Next.js web app
│   ├── cli/                # Command-line tools
│   └── graphql-explorer/   # GraphQL API explorer
├── lib/                    # Shared libraries
│   ├── shared-components/  # Cross-platform UI components
│   ├── db-client/         # Database client & migrations
│   ├── api/               # API utilities
│   └── utils/             # Common utilities
├── lambdas/               # AWS Lambda functions
│   ├── graphql/           # GraphQL API
│   ├── oauth-proxy/       # Authentication
│   └── stats-lambda/      # Data processing
└── terraform/             # Infrastructure as Code
```

### Technology Stack

- **Frontend**: React Native CLI, Next.js, Tamagui UI
- **Backend**: AWS Lambda, API Gateway, PostgreSQL
- **Tools**: NX Monorepo, TypeScript, GraphQL
- **CI/CD**: GitHub Actions, Terraform

## 🔧 Configuration

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
npm test

# Run tests for specific project
npx nx test web
npx nx test app

# Run tests in watch mode
npx nx test web --watch

# Run E2E tests
npx nx e2e web-e2e
```

## 📦 Building & Deployment

### Web Deployment

The web app automatically deploys to GitHub Pages on pushes to `main`:
- **URL**: https://bkrupa.github.io/legacy-sports/
- **Workflow**: `.github/workflows/deploy-web.yml`

### Mobile App Builds

```bash
# Android APK
npm run app:build-android

# iOS (macOS only)
npm run app:build-ios
```

### Lambda Deployment

AWS Lambda functions are deployed via Terraform:

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

## 🛠️ Development Tools

### NX Commands

```bash
# View project graph
npx nx graph

# Run affected tests only
npx nx affected:test

# Build affected projects
npx nx affected:build

# Show project details
npx nx show project web
```

### Code Quality

```bash
# Lint all projects
npm run lint

# Fix lint issues
npm run lint:fix

# Format code
npm run format

# Validate package.json standards
npm run validate:packages
```

## 🔍 Troubleshooting

### Common Issues

**Metro bundler issues (React Native)**:
```bash
# Clear Metro cache
npx react-native start --reset-cache

# Clean and rebuild
npm run app:clean
npm run app:start
```

**GraphQL connection issues**:
- Verify the endpoint URL in `apps/web/src/lib/apollo-client.ts`
- Check AWS Lambda function logs in CloudWatch

**Build errors**:
```bash
# Clean all build artifacts
npm run clean

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Getting Help

1. Check the [Issues](https://github.com/bkrupa/legacy-sports/issues) page
2. Review recent commits for breaking changes
3. Ensure you're using the correct Node.js version
4. Verify all prerequisites are installed

## 📚 Additional Resources

- **NX Documentation**: https://nx.dev
- **React Native**: https://reactnative.dev
- **Tamagui UI**: https://tamagui.dev
- **AWS Lambda**: https://docs.aws.amazon.com/lambda/

---

Built with ❤️ using modern development tools and practices.
