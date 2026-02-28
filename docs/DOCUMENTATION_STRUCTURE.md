# Documentation Structure Guide

## 📚 Quick Reference

This document provides a bird's-eye view of the entire documentation structure and helps you quickly find what you need.

---

## 🗂️ Main Categories

### 🚀 **Getting Started** → `/guides/`
*Start here if you're new to the project*

- Setting up your development environment
- Authentication and security basics
- Common troubleshooting steps
- Agent commands reference

**Best for**: New developers, onboarding, quick setup

---

### 🏗️ **Architecture** → `/architecture/`
*Understanding how the system works*

- Build system and dependency management
- Cross-platform architecture
- Database schema and design
- GraphQL API structure
- Schema validation patterns

**Best for**: Understanding system design, making architectural decisions

---

### 🔐 **Authentication** → `/authentication/`
*OAuth, user management, and security*

- OAuth 2.0 implementation
- CLI authentication
- Auto-provisioning users
- Invite code system
- Two-lambda authentication pattern
- Google OAuth domain setup

**Best for**: Auth-related features, user onboarding, security implementation

---

### ⚙️ **CI/CD** → `/ci-cd/`
*Continuous integration and deployment pipelines*

- GitHub Actions workflows
- CI system architecture
- Badge implementation
- Merge queue configuration
- PR automation
- Troubleshooting CI issues
- Intelligent DTE detection

**Best for**: DevOps, pipeline maintenance, CI optimization

---

### 🔧 **Build & Tooling** → `/build-and-tooling/`
*Nx, Jest, and development tools*

- Nx Cloud configuration and optimization
- Jest testing setup
- E2E testing
- Package.json standards
- Build performance optimization
- DTE (Distributed Task Execution)

**Best for**: Build optimization, test configuration, Nx Cloud usage

---

### ☁️ **Deployment** → `/deployment/`
*AWS infrastructure and deployment*

#### Main Deployment Docs:
- AWS infrastructure overview
- Cost optimization strategies
- Lambda deployment
- Route53 and DNS setup
- HTTPS certificates
- Infrastructure changelog

#### Terraform Subdirectory: `/deployment/terraform/`
- Terraform setup and configuration
- State management
- Lambda infrastructure as code
- Lock management
- Quick reference guide

**Best for**: Infrastructure changes, AWS deployment, Terraform operations

---

### 🛡️ **Security** → `/security/`
*Security scanning, secrets, and audits*

- Security audit status
- Scanning implementation
- Security optimization
- GitHub secrets management

**Best for**: Security reviews, secret management, compliance

---

### 📱 **Mobile** → `/mobile/`
*React Native and Android development*

- Android build setup
- Version matrix and compatibility
- Mobile build automation
- Platform-specific considerations

**Best for**: Mobile developers, Android builds, native features

---

### 🌐 **Web** → `/web/`
*Next.js and web application*

- Web build configurations
- Hash routing setup
- Navigation menu structure
- Web-specific optimizations

**Best for**: Web developers, Next.js configuration, frontend features

---

### 💾 **Database** → `/database/`
*Database migrations and schema changes*

- Drizzle ORM upgrades
- Migration analysis
- Database optimization

**Best for**: Database changes, ORM upgrades, schema migrations

---

### 📋 **Migration History** → `/migration-history/`
*Historical records of completed work*

- Feature implementation summaries
- System migrations
- Refactoring records
- Completed improvements

**Best for**: Understanding past decisions, historical context

---

### 🤖 **AI Agents** → `/agents/`
*Structured instructions for AI assistance*

- Platform component rules (CSV)
- Build system guidelines (CSV)
- Security guidelines (CSV)
- Testing strategies (CSV)
- Type safety rules (CSV)

**Best for**: AI-assisted development, automated tooling

---

## 📊 Documentation by Role

### 👨‍💻 **Software Developer**
```
1. /guides/development-setup.md
2. /architecture/cross-platform-system.md
3. /guides/authentication-guide.md
4. /architecture/database-schema.md
5. /guides/troubleshooting.md
```

### ☁️ **DevOps Engineer**
```
1. /deployment/aws-infrastructure.md
2. /ci-cd/ci-system-documentation.md
3. /deployment/terraform/
4. /security/
5. /deployment/cost-optimization.md
```

### 📱 **Mobile Developer**
```
1. /mobile/android-build-setup.md
2. /architecture/cross-platform-system.md
3. /authentication/
4. /guides/troubleshooting.md
5. /mobile/mobile-build-automation.md
```

### 🌐 **Web Developer**
```
1. /web/web-build-configurations.md
2. /architecture/cross-platform-system.md
3. /authentication/
4. /web/navigation-menu-reorganization.md
5. /guides/troubleshooting.md
```

### 🧪 **QA Engineer**
```
1. /build-and-tooling/e2e-testing-migration.md
2. /build-and-tooling/jest-changed-files-config.md
3. /ci-cd/ci-system-documentation.md
4. /guides/troubleshooting.md
```

### 🏗️ **Platform Engineer**
```
1. /build-and-tooling/nx-cloud-optimization-strategy.md
2. /ci-cd/
3. /architecture/build-system.md
4. /deployment/
```

---

## 🔍 Finding Documentation

### By Topic

| Topic | Location |
|-------|----------|
| AWS Setup | `/deployment/aws-infrastructure.md` |
| Authentication | `/authentication/` |
| Build Performance | `/build-and-tooling/nx-cloud-optimization-strategy.md` |
| CI/CD Pipeline | `/ci-cd/ci-system-documentation.md` |
| Cross-Platform | `/architecture/cross-platform-system.md` |
| Database Schema | `/architecture/database-schema.md` |
| Deployment | `/deployment/` |
| Development Setup | `/guides/development-setup.md` |
| Docker | `/deployment/aws-infrastructure.md` |
| GitHub Actions | `/ci-cd/` |
| GraphQL | `/architecture/graphql-integration.md` |
| Jest Testing | `/build-and-tooling/jest-changed-files-config.md` |
| Lambda Functions | `/deployment/lambda-build-strategy.md` |
| Mobile Builds | `/mobile/` |
| Nx Cloud | `/build-and-tooling/` (all nx-* files) |
| OAuth | `/authentication/` |
| React Native | `/mobile/` |
| Security | `/security/` |
| Terraform | `/deployment/terraform/` |
| Troubleshooting | `/guides/troubleshooting.md` |
| TypeScript | `/architecture/` |
| Web App | `/web/` |

---

## 📈 Documentation Maturity

### ✅ **Mature & Complete**
- Development guides (`/guides/`)
- Architecture documentation (`/architecture/`)
- CI/CD system (`/ci-cd/`)
- Authentication system (`/authentication/`)

### 🚧 **In Progress**
- API documentation (`/api/`)
- Deployment runbooks (`/deployment/`)
- Security scanning (`/security/`)

### 📝 **Planned**
- Architecture Decision Records (ADRs)
- Component library documentation
- Performance optimization guides
- Disaster recovery procedures

---

## 🎯 Common Tasks

### "I need to deploy a Lambda function"
```
1. /deployment/lambda-build-strategy.md
2. /deployment/terraform/terraform-lambda-deployment.md
3. /deployment/s3-lambda-deployment.md
```

### "I need to set up OAuth"
```
1. /authentication/oauth-auto-provisioning.md
2. /authentication/CLI_OAUTH_AUTHENTICATION.md
3. /guides/authentication-guide.md
```

### "CI is failing"
```
1. /ci-cd/ci-troubleshooting-guide.md
2. /ci-cd/ci-system-documentation.md
3. /build-and-tooling/nx-cloud-quota-fix.md
```

### "I need to optimize build times"
```
1. /build-and-tooling/nx-cloud-optimization-strategy.md
2. /build-and-tooling/intelligent-dte-detection.md
3. /architecture/build-system.md
```

### "Setting up a new developer"
```
1. /guides/development-setup.md
2. /guides/authentication-guide.md
3. /guides/troubleshooting.md
4. /architecture/cross-platform-system.md
```

---

## 🔄 Keeping Documentation Current

### When to Update Documentation

1. **Feature Implementation**: Add to migration-history, update relevant guides
2. **Architecture Changes**: Update architecture/ docs
3. **Deployment Changes**: Update deployment/ docs
4. **CI/CD Changes**: Update ci-cd/ docs
5. **Security Changes**: Update security/ docs

### Documentation Standards

- Use clear, descriptive titles
- Include table of contents for long documents
- Add code examples where applicable
- Link to related documentation
- Include troubleshooting sections
- Date significant changes

---

## 📞 Questions or Issues?

- Can't find documentation? Check `/guides/troubleshooting.md`
- Documentation outdated? Create an issue or PR
- New feature needs docs? Add to appropriate category

---

*Last updated: February 28, 2026*
