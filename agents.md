# AI Agent Documentation

Welcome! If you're an AI agent working on the Legacy Sports codebase, this is your starting point.

## 🚀 Quick Start

### First Time Working on This Project?

**Start here**: [AI Agent Contribution Workflow](docs/guides/ai-agent-contribution-workflow.md)

This comprehensive guide covers the complete development lifecycle:

- Planning work with Jira tickets (using `acli`)
- Creating branches with `twig`
- Implementing changes in the Nx monorepo
- Running pre-commit validations
- Committing and creating pull requests
- Updating Jira ticket statuses throughout

### Already Familiar? Quick Reference

**Quick Commands**: See [Quick Reference](#-quick-reference) below

**CSV Guidelines**: [Structured Agent Instructions](docs/agents/README.md)

---

## 📚 Essential Documentation

### 🎯 Core Workflow

- **[AI Agent Contribution Workflow](docs/guides/ai-agent-contribution-workflow.md)** - Complete step-by-step process
- **[Branch Tree Management](docs/guides/branch-tree-management.md)** 🌳 - Twig tree management for clean dependent branches
- **[Development Setup](docs/guides/development-setup.md)** - Environment configuration
- **[Troubleshooting Guide](docs/guides/troubleshooting.md)** - Common issues and solutions

### 🤖 Structured Guidelines (CSV Format)

All CSV files are located in [`docs/agents/`](docs/agents/):

- **[Contribution Workflow CSV](docs/agents/contribution-workflow.csv)** ⭐ - Complete workflow patterns
- **[Development Workflow CSV](docs/agents/development-workflow.csv)** - Daily workflows and best practices
- **[Common Pitfalls CSV](docs/agents/common-pitfalls.csv)** - Mistakes to avoid
- **[Platform Components CSV](docs/agents/platform-components.csv)** - Cross-platform patterns
- **[Type Safety CSV](docs/agents/type-safety.csv)** - TypeScript standards
- **[ESLint Standards CSV](docs/agents/eslint-standards.csv)** - Code quality rules
- **[Security Guidelines CSV](docs/agents/security-guidelines.csv)** - Security best practices
- **[Testing Strategy CSV](docs/agents/testing-strategy.csv)** - Testing patterns

**Full CSV Index**: [docs/agents/README.md](docs/agents/README.md)

### 🏗️ Architecture & Systems

- **[Cross-Platform System](docs/architecture/cross-platform-system.md)** - Magic strings and platform resolution
- **[Build System](docs/architecture/build-system.md)** - Nx monorepo structure
- **[GraphQL Integration](docs/architecture/graphql-integration.md)** - API design
- **[Database Schema](docs/architecture/database-schema.md)** - Data models

### 🔐 Authentication & Security

- **[Authentication Guide](docs/guides/authentication-guide.md)** - OAuth implementation
- **[Security & Secrets](docs/guides/security-and-secrets.md)** - Secrets management
- **[Security Audit Status](docs/security/security-audit-status.md)** - Current security posture

### ⚙️ CI/CD & Deployment

- **[CI System Documentation](docs/ci-cd/ci-system-documentation.md)** - Pipeline overview
- **[CI Troubleshooting](docs/ci-cd/ci-troubleshooting-guide.md)** - Debugging CI issues
- **[AWS Infrastructure](docs/deployment/aws-infrastructure.md)** - Cloud architecture

---

## 🎯 Quick Reference

### 🤖 AI Agent Tools

**Twig MCP Server**: This repository includes a Twig MCP (Model Context Protocol) server for AI agents. If your AI environment supports MCP, you can use native twig commands through the MCP interface instead of terminal commands. See `.vscode/settings.json` for configuration.

**Benefits of MCP**:
- Direct access to twig operations without terminal commands
- Structured responses for better parsing
- Automatic error handling and retry logic

### Essential Commands

```powershell
# Refresh PATH if acli not found
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Jira ticket management
acli issue view LS-1234                          # View ticket
acli issue transition LS-1234 "In Progress"      # Start work
acli issue transition LS-1234 "In Review"        # PR created
acli issue transition LS-1234 "Done"             # PR merged

# Branch creation
git checkout main; git pull                      # For new ticket
twig github new-branch LS-1234                   # Create branch from main
twig switch LS-1234 -p                          # Create branch from current

# Verify branch tree structure
twig tree                                        # Check branch dependencies
git log --oneline parent-branch..current-branch  # Verify unique commits only

# Pre-commit validation (run in this order)
npx nx affected -t typecheck                        # 1. Type checking
npx nx affected -t lint --fix                       # 2. Linting with auto-fix
npx nx affected -t test                             # 3. Testing
npx nx affected -t build                            # 4. Building

# Commit and PR
git add .
git commit -m "feat(scope): description"
git push origin HEAD
twig github pr create-pr
```

### Critical Rules

#### ✅ Always Do

- Use **Nx commands** (`npx nx affected -t test`) not direct npm commands
- Use **npx nx** prefix for all Nx commands (not just `nx`)
- Use **PowerShell syntax** (`;` for chaining, `$env:` for variables)
- Update **Jira ticket status** at each workflow stage
- Run validation checks **in order**: typecheck → lint → test → build
- Follow **conventional commit** format: `type(scope): message`
- **Verify branch tree with `twig tree`** before and after creating dependent branches
- **Check commit counts** match expected work (e.g., `[+1]` for single commit branches)

#### ❌ Never Do

- Don't start dev server or GraphQL service (already running)
- Don't use `npm run` directly, use `nx` commands
- Don't suppress errors with `@ts-ignore` or `eslint-disable` without justification
- Don't skip pre-commit validation checks
- Don't create PRs without updating Jira status
- **Don't create dependent branches without verifying unique commits only**
- **Don't ignore duplicate commits** in branch tree (shown by high `[+N]` counts)

#### 🔧 Environment Context

- **Terminal**: PowerShell (Windows)
- **Dev Server**: Already running at `npm start`
- **GraphQL Service**: Already running
- **Monorepo**: Nx workspace
- **Jira Project**: LS

---

## 📋 Workflow Checklist

### For Every Contribution

- [ ] **Plan**: Verify/create Jira ticket → Update to "In Progress"
- [ ] **Branch**: Create branch with twig (from main or current)
- [ ] **Implement**: Write code using Nx commands
- [ ] **Validate**: Run typecheck → lint → test → build (all must pass)
- [ ] **Commit**: Use conventional commit format
- [ ] **PR**: Create with twig → Update Jira to "In Review"
- [ ] **Post-Merge**: Update Jira to "Done"

---

## 🔍 Finding Information

### By Topic

| What You Need             | Where to Look                                                                   |
| ------------------------- | ------------------------------------------------------------------------------- |
| **Complete workflow**     | [AI Agent Contribution Workflow](docs/guides/ai-agent-contribution-workflow.md) |
| **Quick patterns**        | [CSV files](docs/agents/)                                                       |
| **How to fix errors**     | [Troubleshooting Guide](docs/guides/troubleshooting.md)                         |
| **Architecture concepts** | [Architecture docs](docs/architecture/)                                         |
| **CI/CD issues**          | [CI Troubleshooting](docs/ci-cd/ci-troubleshooting-guide.md)                    |
| **Security practices**    | [Security & Secrets](docs/guides/security-and-secrets.md)                       |
| **Database work**         | [Database Schema](docs/architecture/database-schema.md)                         |
| **GraphQL changes**       | [GraphQL Integration](docs/architecture/graphql-integration.md)                 |
| **Mobile/Android**        | [Mobile docs](docs/mobile/)                                                     |
| **Web/Next.js**           | [Web docs](docs/web/)                                                           |

### By Task

| Task                         | Documentation                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Starting a new ticket**    | [Step 1: Planning](docs/guides/ai-agent-contribution-workflow.md#step-1-plan-the-project-jira-ticket-management) |
| **Creating a branch**        | [Step 2: Branching](docs/guides/ai-agent-contribution-workflow.md#step-2-create-feature-branch)                  |
| **Running tests**            | [Step 4: Validation](docs/guides/ai-agent-contribution-workflow.md#step-4-pre-commit-validation)                 |
| **Fixing lint errors**       | [ESLint Standards CSV](docs/agents/eslint-standards.csv)                                                         |
| **Type errors**              | [Type Safety CSV](docs/agents/type-safety.csv)                                                                   |
| **Database migrations**      | [Database Schema](docs/architecture/database-schema.md)                                                          |
| **Adding GraphQL resolvers** | [GraphQL Integration](docs/architecture/graphql-integration.md)                                                  |
| **Cross-platform code**      | [Platform Components CSV](docs/agents/platform-components.csv)                                                   |

---

## 🤝 Contributing Back

### Help Improve These Docs

When you discover new patterns, issues, or solutions:

1. **Update CSV files** in `docs/agents/` with new patterns
2. **Suggest improvements** to the main workflow guide
3. **Document novel solutions** you discover
4. **Add missing patterns** to relevant CSV files

**Format for CSV contributions**:

```csv
Category,Subcategory,Rule_Type,Pattern_Concept,Description,Code_Example,File_Path
your_category,your_area,LEARNED,pattern_name,"Clear description","Practical example","path/to/file"
```

See [Contributing to Agent Knowledge](docs/agents/README.md#-agent-contribution-guidelines) for details.

---

## 📖 Full Documentation Hub

**Main Documentation Index**: [docs/README.md](docs/README.md)

This provides the complete documentation structure organized by:

- Role (Developers, DevOps, QA, etc.)
- Topic (Architecture, CI/CD, Security, etc.)
- Component (Mobile, Web, Lambda, etc.)

---

## 🆘 Need Help?

1. **Common issues**: Check [Troubleshooting Guide](docs/guides/troubleshooting.md)
2. **Workflow questions**: See [AI Agent Contribution Workflow](docs/guides/ai-agent-contribution-workflow.md)
3. **Specific patterns**: Search [CSV files](docs/agents/)
4. **Architecture questions**: Browse [Architecture docs](docs/architecture/)
5. **Can't find it**: Search all docs starting from [docs/README.md](docs/README.md)

---

## 📊 Project Overview

### Repository Structure

```
legacy-sports/
├── apps/           # Applications (web, mobile, CLI)
├── lib/            # Shared libraries
├── lambdas/        # AWS Lambda functions
├── docs/           # All documentation
│   ├── guides/     # Step-by-step guides
│   ├── agents/     # AI agent CSV instructions
│   ├── architecture/  # System design
│   ├── ci-cd/      # Pipeline documentation
│   └── ...
├── scripts/        # Build and utility scripts
└── terraform/      # Infrastructure as code
```

### Tech Stack

- **Frontend**: React Native (mobile), Next.js (web)
- **Backend**: AWS Lambda, GraphQL
- **Database**: PostgreSQL with Drizzle ORM
- **Build**: Nx monorepo
- **CI/CD**: GitHub Actions
- **Infrastructure**: AWS (Terraform)

### Development Tools

- **Jira**: Project management (LS project)
- **acli**: Jira CLI tool
- **twig**: Git branch management
- **Nx**: Monorepo build system
- **PowerShell**: Default shell

---

**Ready to contribute? Start with the [AI Agent Contribution Workflow](docs/guides/ai-agent-contribution-workflow.md)! 🚀**
