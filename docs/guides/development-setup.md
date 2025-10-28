# Development Environment Setup

## 📋 Overview

This guide provides step-by-step instructions for setting up a complete development environment for the Legacy Sports Nx monorepo. Follow these instructions to ensure a consistent and productive development experience.

---

## ⚡ Quick Start (5 Minutes)

For experienced developers who want to get started immediately:

```bash
# 1. Clone repository
git clone <repository-url>
cd legacy-sports

# 2. Install dependencies
pnpm install

# 3. Environment setup
pnpm run sync-env

# 4. Build core libraries
pnpm run build:libs

# 5. Start development
pnpm run dev
```

**That's it!** Your development environment should now be running.

---

## 🛠️ Prerequisites

### **Required Software**

| Tool           | Version | Purpose                                                    | Download Link                                        |
| -------------- | ------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| **Node.js**    | 18+     | Runtime for all JavaScript/TypeScript code                 | [nodejs.org](https://nodejs.org)                     |
| **pnpm**       | 9.12.1  | Workspace package manager (preferred; project uses 9.12.1) | [pnpm.io/installation](https://pnpm.io/installation) |
| **npm**        | 9+      | Installed with Node.js (optional fallback)                 | Built-in                                             |
| **Git**        | Latest  | Version control                                            | [git-scm.com](https://git-scm.com)                   |
| **PowerShell** | 5.1+    | Required for environment sync scripts (Windows)            | Built-in on Windows                                  |

### **Optional Tools**

| Tool               | Purpose                                       | Recommendation                    |
| ------------------ | --------------------------------------------- | --------------------------------- |
| **VS Code**        | Code editor with excellent TypeScript support | Highly recommended                |
| **Docker**         | For running database locally                  | Optional - can use remote DB      |
| **Android Studio** | React Native Android development              | Only if working on mobile         |
| **Xcode**          | React Native iOS development                  | Only if working on iOS (Mac only) |

### **VS Code Extensions (Recommended)**

If using VS Code, install these extensions for the best experience:

```bash
# Essential extensions
code --install-extension ms-vscode.vscode-typescript-next
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension nrwl.angular-console

# Helpful extensions
code --install-extension bradlc.vscode-tailwindcss
code --install-extension GraphQL.vscode-graphql
code --install-extension ms-vscode.vscode-json
```

---

## 📥 Installation Steps

### **Step 1: Clone the Repository**

```bash
# Clone the repository
git clone <repository-url>
cd legacy-sports

# Verify you're in the right place
ls -la  # Should see package.json, nx.json, and other workspace files
```

### **Step 2: Install Dependencies**

```bash
# Ensure pnpm is available (Corepack ships with Node 18)
corepack enable
corepack prepare pnpm@9.12.1 --activate

# Install all workspace dependencies
pnpm install

# This will take 2-5 minutes depending on internet speed
# You should see successful installation of 200+ packages
```

### **Step 3: Environment Configuration**

```bash
# Set up environment variables and database connections
pnpm run sync-env

# This script will:
# - Copy environment templates
# - Set up database credentials
# - Configure AWS access (if available)
# - Validate configuration
```

**What if sync-env fails?**

- Ensure you have proper AWS/database access
- Contact team lead for credential access
- Use `pnpm run sync-env:dry-run` to see what would be configured

### **Step 4: Build Core Libraries**

```bash
# Build shared libraries that other projects depend on
pnpm run build:libs

# This should complete in 1-2 minutes
# You'll see successful builds for ~10 library projects
```

### **Step 5: Validate Installation**

```bash
# Run workspace validation
pnpm run validate

# This checks:
# - Package.json consistency
# - Dependency alignment
# - Security configuration

# Should output: "✅ All workspace dependencies are properly configured"
```

---

## 🚀 Starting Development

### **Development Servers**

Once setup is complete, you can start development servers:

#### **Full Development Environment**

```bash
# Starts all development servers (web + lambdas)
pnpm run dev

# This will start:
# - Web app at http://localhost:3000
# - GraphQL API at http://localhost:4000
# - Lambda functions in dev mode
```

#### **Individual Services**

```bash
# Web application only
pnpm start
# or
pnpm run dev:web

# Mobile application (React Native)
pnpm run android  # Android
pnpm run ios      # iOS (Mac only)

# Individual lambda functions
pnpm run dev:db              # GraphQL API
pnpm run dev:oauth           # OAuth proxy
pnpm run dev:stats           # Stats processing
pnpm run dev:game-selection  # Game selection

# GraphiQL playground
pnpm run graphiql
```

### **Development URLs**

After starting development servers:

- **Web App**: [http://localhost:3000](http://localhost:3000)
- **GraphQL API**: [http://localhost:4000](http://localhost:4000)
- **GraphQL Playground**: [http://localhost:4000/graphql](http://localhost:4000/graphql)
- **GraphiQL**: [http://localhost:3001](http://localhost:3001)
- **Storybook**: `pnpm run storybook` → [http://localhost:6006](http://localhost:6006)

---

## 🔧 Common Development Tasks

### **Building Projects**

```bash
# Build everything
pnpm run build:all

# Build by project type
pnpm run build:libs      # Shared libraries only
pnpm run build:apps      # Applications only
pnpm run build:lambdas   # Lambda functions only

# Build specific project
pnpm exec nx build <project-name>
```

### **Running Tests**

```bash
# Run all tests
pnpm run test:all

# Run tests by project type
pnpm run test:libs       # Library tests
pnpm run test:apps       # Application tests
pnpm run test:lambdas    # Lambda tests

# Run affected tests (only changed code)
pnpm run test:changed
pnpm run affected:test

# Watch mode for development
pnpm run test:watch
```

### **Code Quality & Linting**

```bash
# Fix all linting issues automatically
pnpm run lint:fix:all

# Lint by project type
pnpm run lint:libs
pnpm run lint:apps
pnpm run lint:lambdas

# Type checking
pnpm run typecheck

# Format code
pnpm exec nx run-many --target=format
```

### **Database Operations**

```bash
# Test database connection
pnpm run db:test

# Connect to database CLI
pnpm run db:psql

# Run migrations
pnpm run migrate

# CLI database operations
pnpm run cli:inspect-database
pnpm run cli:test-connection
```

---

## 🚨 Troubleshooting

### **Common Issues & Solutions**

#### **"Module not found" Errors**

```
Error: Cannot find module '@legacy-sports/...'
```

**Solution**: Rebuild libraries

```bash
pnpm run build:libs
```

#### **Environment Variable Issues**

```
Error: Missing environment configuration
```

**Solutions**:

```bash
# 1. Re-run environment sync
pnpm run sync-env

# 2. Check if sync worked
pnpm run sync-env:dry-run

# 3. Manual environment setup (if needed)
cp .env.template .env.local
# Edit .env.local with proper values
```

#### **Database Connection Problems**

```
Error: Connection to database failed
```

**Solutions**:

```bash
# 1. Test connection
pnpm run db:test

# 2. Check credentials
pnpm run db:credentials

# 3. Try production database (if development DB unavailable)
pnpm run db:test:production
```

#### **Port Already in Use**

```
Error: Port 3000 is already in use
```

**Solutions**:

```bash
# 1. Kill processes using the port
pnpm dlx kill-port 3000
pnpm dlx kill-port 4000

# 2. Or change ports in project configuration
# Edit apps/web/project.json or use different port
```

#### **Slow Build Performance**

```
Builds taking longer than expected
```

**Solutions**:

```bash
# 1. Clear Nx cache
pnpm run clean:nx

# 2. Use affected builds instead of full builds
pnpm run affected:build

# 3. Nuclear option - full clean
pnpm run clean:deps
pnpm install
pnpm run build:libs
```

#### **TypeScript Errors**

```
Type checking errors in IDE or build
```

**Solutions**:

```bash
# 1. Restart TypeScript language server (VS Code: Cmd+Shift+P > "TypeScript: Restart TS Server")

# 2. Rebuild type definitions
pnpm run build:libs

# 3. Check for circular dependencies
pnpm exec nx graph

# 4. Clean TypeScript cache
rm -rf node_modules/.cache
pnpm run build:libs
```

#### **React Native Issues**

```
Metro bundler or native build failures
```

**Solutions**:

```bash
# 1. Clear Metro cache
pnpm exec react-native start --reset-cache

# 2. Clean native builds
cd apps/app
pnpm exec react-native run-android --reset-cache

# 3. Rebuild native dependencies
cd apps/app && rm -rf node_modules && pnpm install
```

#### **Lambda Development Issues**

```
Lambda functions not starting or failing
```

**Solutions**:

```bash
# 1. Ensure libraries are built
pnpm run build:libs

# 2. Check lambda-specific dependencies
cd lambdas/<lambda-name>
pnpm install

# 3. Restart lambda services
pnpm run dev:lambdas
```

### **Performance Optimization**

#### **Faster Development Builds**

```bash
# Use affected commands instead of building everything
pnpm run affected:build
pnpm run affected:test
pnpm run affected:lint

# Enable watch mode during active development
pnpm run test:watch
```

#### **Memory Issues**

```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=8192"

# Or add to .bashrc/.zshrc for permanent fix
echo 'export NODE_OPTIONS="--max-old-space-size=8192"' >> ~/.bashrc
```

---

## 📱 Platform-Specific Setup

### **Web Development**

No additional setup required beyond the basic installation.

### **React Native (Mobile) Development**

#### **Android Setup**

1. Install Android Studio
2. Set up Android SDK (API 29+)
3. Configure environment variables:
   ```bash
   export ANDROID_HOME=$HOME/Android/Sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/tools
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```
4. Start Android emulator or connect physical device
5. Run: `pnpm run android`

#### **iOS Setup (Mac only)**

1. Install Xcode from App Store
2. Install Xcode Command Line Tools:
   ```bash
   xcode-select --install
   ```
3. Install CocoaPods:
   ```bash
   sudo gem install cocoapods
   ```
4. Install iOS dependencies:
   ```bash
   cd apps/app/ios && pod install
   ```
5. Run: `pnpm run ios`

---

## 🔍 Health Checks

### **Daily Development Checklist**

Before starting work each day:

```bash
# 1. Pull latest changes
git pull origin main

# 2. Update dependencies (if package.json changed)
pnpm install

# 3. Rebuild libraries (if they changed)
pnpm run build:libs

# 4. Run validation
pnpm run validate

# 5. Start development
pnpm run dev
```

### **Before Committing Changes**

```bash
# 1. Run full validation
pnpm run validate

# 2. Fix any linting issues
pnpm run lint:fix:all

# 3. Run type checking
pnpm run typecheck

# 4. Test affected code
pnpm run test:changed

# 5. Ensure everything builds
pnpm run build:all
```

### **Workspace Health Commands**

```bash
# Check project dependencies
pnpm exec nx graph

# Show project information
pnpm exec nx show project <project-name>

# List all projects
pnpm exec nx show projects

# Check for circular dependencies
pnpm exec nx graph --file=dependency-graph.html
```

---

## 📚 Additional Resources

### **Documentation**

- **Build System**: See `BUILD_SYSTEM.md` for detailed build information
- **Repository Improvements**: See `REPOSITORY_IMPROVEMENTS.md` for ongoing enhancements
- **ESLint Configuration**: See `tools/eslint-config/README.md` for linting setup
- **Agent Instructions**: See `AGENTS.md` for AI agent guidelines

### **Nx Resources**

- **Nx Documentation**: [https://nx.dev](https://nx.dev)
- **Nx Console**: VS Code extension for visual Nx management
- **Dependency Graph**: `pnpm exec nx graph` for visual project relationships

### **Framework Documentation**

- **React**: [https://react.dev](https://react.dev)
- **React Native**: [https://reactnative.dev](https://reactnative.dev)
- **TypeScript**: [https://www.typescriptlang.org](https://www.typescriptlang.org)
- **Tamagui**: [https://tamagui.dev](https://tamagui.dev) (UI framework)
- **GraphQL**: [https://graphql.org](https://graphql.org)

### **Getting Help**

1. **Check existing documentation** in this repository
2. **Search previous issues** in project issue tracker
3. **Ask in team chat** for workspace-specific questions
4. **Review BUILD_SYSTEM.md** for build-related issues
5. **Check troubleshooting section** above for common problems

---

## ⚙️ Advanced Configuration

### **Custom Environment Setup**

For team members who need custom configuration:

```bash
# Copy environment template
cp .env.template .env.local

# Edit with your specific settings
# .env.local is ignored by git, so it's safe for personal config
```

### **Development Database Setup**

If you need a local database instead of remote:

```bash
# Start local PostgreSQL with Docker
docker run --name legacy-sports-db \
  -e POSTGRES_PASSWORD=development \
  -e POSTGRES_DB=legacy_sports \
  -p 5432:5432 \
  -d postgres:15

# Update .env.local to point to local database
DATABASE_URL=postgresql://postgres:development@localhost:5432/legacy_sports
```

### **Performance Tuning**

For faster builds and development:

```bash
# Enable Nx daemon for faster commands
echo "NX_DAEMON=true" >> .env.local

# Increase parallel build workers
echo "NX_PARALLEL=4" >> .env.local

# Enable verbose logging for debugging
echo "NX_VERBOSE_LOGGING=true" >> .env.local
```

---

**✅ Setup Complete!** You should now have a fully functional development environment for the Legacy Sports application.

For questions or issues not covered in this guide, please reach out to the development team or check the troubleshooting section above.

---

_Last Updated: October 12, 2025_  
_Development Environment Version: Node.js 18+, Nx 21.5.2_
