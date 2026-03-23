# Development Environment Setup

## 📋 Overview

This guide provides step-by-step instructions for setting up a complete development environment for the Legacy Sports Nx monorepo. Follow these instructions to ensure a consistent and productive development experience.

---

## ⚡ Quick Start (5 Minutes)

For experienced developers who want to get started immediately:

```powershell
# 1. Clone repository
git clone <repository-url>
cd legacy-sports

# 2. Install dependencies
make install

# 3. Environment setup (requires AWS SSO)
make sync-env

# 4. Start development
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

```powershell
# Clone the repository
git clone <repository-url>
cd legacy-sports

# Verify you're in the right place
Get-ChildItem  # Should see package.json, nx.json, and other workspace files
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

```powershell
# Set up environment variables and database connections
make sync-env

# This script will:
# - Copy environment templates
# - Set up database credentials
# - Configure AWS access (if available)
# - Validate configuration
```

**What if sync-env fails?**

- Ensure you have proper AWS SSO access (see `.agents/skills/infrastructure/SKILL.md`)
- Contact team lead for credential access
- Without AWS access, use the dev seed: see `.agents/skills/db-restore-dev/SKILL.md`

### **Step 4: Build Core Libraries**

```powershell
# Build shared libraries that other projects depend on
pnpm exec nx affected -t build

# This should complete in 1-2 minutes
# You'll see successful builds for affected library projects
```

### **Step 5: Validate Installation**

```powershell
# Run workspace validation
make pc

# This checks:
# - Typecheck, lint, test, build across affected projects
# - Must pass before opening a PR
```

---

## 🚀 Starting Development

### **Development Servers**

Once setup is complete, you can start development servers:

#### **Full Development Environment**

```powershell
# Starts all development servers (web + lambdas)
pnpm run dev

# This will start:
# - Web app at http://localhost:3000
# - GraphQL API at http://localhost:4000
# - Lambda functions in dev mode
```

#### **Individual Services**

```powershell
# Web application only
pnpm exec nx dev web

# Mobile application (React Native)
pnpm exec nx android app  # Android
# iOS builds are currently disabled

# Individual lambda functions
pnpm exec nx serve db              # GraphQL API
pnpm exec nx serve oauth-proxy     # OAuth proxy
pnpm exec nx serve stats-lambda    # Stats processing
pnpm exec nx serve game-selection  # Game selection

# GraphiQL playground
pnpm exec nx serve graphql-explorer
```

### **Development URLs**

After starting development servers:

- **Web App**: [http://localhost:3000](http://localhost:3000)
- **GraphQL API**: [http://localhost:4000](http://localhost:4000)
- **GraphQL Playground**: [http://localhost:4000/graphql](http://localhost:4000/graphql)
- **GraphiQL**: [http://localhost:3001](http://localhost:3001)
- **Storybook**: (if configured) [http://localhost:6006](http://localhost:6006)

---

## 🔧 Common Development Tasks

### **Building Projects**

```powershell
# Build affected projects
pnpm exec nx affected -t build

# Build specific project
pnpm exec nx build <project-name>

# Build all projects
pnpm exec nx run-many -t build
```

### **Running Tests**

```powershell
# Run affected tests (only changed code)
pnpm exec nx affected -t test

# Run all tests
pnpm exec nx run-many -t test

# Run specific project tests
pnpm exec nx test <project-name>

# Watch mode for development
pnpm exec nx test <project-name> --watch
```

### **Code Quality & Linting**

```powershell
# Fix all linting issues automatically
pnpm exec nx affected -t lint --fix

# Lint specific project
pnpm exec nx lint <project-name>

# Type checking
pnpm exec nx affected -t typecheck

# Format code
pnpm exec nx format:write
```

### **Database Operations**

```powershell
# Run database queries
.\scripts\db-query.ps1 "SELECT 1"

# Run migrations
pnpm exec nx run db:migrate

# Generate migration after schema changes
pnpm exec nx run db:generate
```

---

## 🚨 Troubleshooting

### **Common Issues & Solutions**

#### **"Module not found" Errors**

```
Error: Cannot find module '@legacy-sports/...'
```

**Solution**: Rebuild libraries

```powershell
pnpm exec nx affected -t build
```

#### **Environment Variable Issues**

```
Error: Missing environment configuration
```

**Solutions**:

```powershell
# 1. Re-run environment sync
make sync-env

# 2. Manual environment setup (if needed)
Copy-Item .env.template .env.local
# Edit .env.local with proper values
```

#### **Database Connection Problems**

```
Error: Connection to database failed
```

**Solutions**:

```powershell
# 1. Test connection
.\scripts\db-query.ps1 "SELECT 1"

# 2. Check credentials in .env file
Select-String -Path .env -Pattern "DB_"

# 3. Start local Docker database if needed
docker compose up -d postgres
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

```powershell
# 1. Clear Nx cache
pnpm exec nx reset

# 2. Use affected builds instead of full builds
pnpm exec nx affected -t build

# 3. Nuclear option - full clean
pnpm run clean
make install
```

#### **TypeScript Errors**

```
Type checking errors in IDE or build
```

**Solutions**:

```powershell
# 1. Restart TypeScript language server (VS Code: Ctrl+Shift+P > "TypeScript: Restart TS Server")

# 2. Rebuild type definitions
pnpm exec nx affected -t build

# 3. Check for circular dependencies
pnpm exec nx graph

# 4. Clean TypeScript cache
Remove-Item -Recurse -Force node_modules\.cache
pnpm exec nx affected -t build
```

#### **React Native Issues**

```
Metro bundler or native build failures
```

**Solutions**:

```powershell
# 1. Clear Metro cache
pnpm exec react-native start --reset-cache

# 2. Clean native builds
Set-Location apps\app
pnpm exec react-native run-android --reset-cache

# 3. Rebuild native dependencies
Set-Location apps\app; Remove-Item -Recurse -Force node_modules; pnpm install
```

#### **Lambda Development Issues**

```
Lambda functions not starting or failing
```

**Solutions**:

```powershell
# 1. Ensure libraries are built
pnpm exec nx affected -t build

# 2. Start lambda dev servers
pnpm run dev:lambdas
```

### **Performance Optimization**

#### **Faster Development Builds**

```powershell
# Use affected commands instead of building everything
pnpm exec nx affected -t build
pnpm exec nx affected -t test
pnpm exec nx affected -t lint

# Enable watch mode during active development
pnpm exec nx test <project-name> --watch
```

#### **Memory Issues**

```powershell
# Increase Node.js memory limit
$env:NODE_OPTIONS = "--max-old-space-size=8192"

# Or add to PowerShell profile for permanent fix
Add-Content $PROFILE '$env:NODE_OPTIONS = "--max-old-space-size=8192"'
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
   ```powershell
   export ANDROID_HOME=$HOME/Android/Sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/tools
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```
4. Start Android emulator or connect physical device
5. Run: `pnpm exec nx android app`

#### **iOS Setup (Mac only)**

> **Note:** iOS builds are currently disabled as we are not actively using the iOS platform.

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

```powershell
# 1. Pull latest changes
git pull origin main

# 2. Update dependencies (if package.json changed)
make install

# 3. Rebuild affected projects
pnpm exec nx affected -t build

# 4. Start development
pnpm run dev
```

### **Before Committing Changes**

```powershell
# Run full pre-commit validation (typecheck + lint + test + build)
make pc

# Or run individual checks:
pnpm exec nx affected -t typecheck   # Type checking
pnpm exec nx affected -t lint --fix  # Lint with auto-fix
pnpm exec nx affected -t test        # Run tests
pnpm exec nx affected -t build       # Build
```

### **Workspace Health Commands**

```powershell
# Check project dependencies
pnpm exec nx graph

# Show project information
pnpm exec nx show project <project-name>

# List all projects
pnpm exec nx show projects
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

_Last Updated: February 28, 2026_  
_Development Environment Version: Node.js 18+, Nx 21.5.2_
