# Legacy Sports Documentation Hub

Welcome to the comprehensive documentation for the Legacy Sports platform - a modern cross-platform sports data management system built with React Native, Next.js, and AWS serverless architecture.

> 📘 **Documentation recently reorganized!** All docs are now categorized into clear sections for easier navigation. See [DOCUMENTATION_STRUCTURE.md](DOCUMENTATION_STRUCTURE.md) for a visual guide.

## 🚀 Quick Navigation

### 🎯 **Getting Started** → [`/guides/`](guides/)
*Start here if you're new to the project*
- [📖 Development Setup](guides/development-setup.md) - Complete environment setup guide
- [🔐 Authentication Guide](guides/authentication-guide.md) - OAuth and user management
- [🛠️ Troubleshooting](guides/troubleshooting.md) - Common issues and solutions
- [🔒 Security & Secrets](guides/security-and-secrets.md) - Security best practices
- [🤖 Agent Commands](guides/agent-commands.md) - AI assistant commands reference

### 🏗️ **Architecture & Design** → [`/architecture/`](architecture/)
*Understanding how the system works*
- [🏗️ Build System](architecture/build-system.md) - Dependency order and build workflows
- [📱 Cross-Platform System](architecture/cross-platform-system.md) - Magic strings and native resolution
- [💾 Database Schema](architecture/database-schema.md) - Complete database documentation
- [🔗 GraphQL Integration](architecture/graphql-integration.md) - API design and implementation
- [✅ Schema Validation](architecture/schema-validation.md) - Drizzle schema patterns

### 🔐 **Authentication** → [`/authentication/`](authentication/)
*OAuth, user management, and access control*
- [🔑 CLI OAuth Authentication](authentication/CLI_OAUTH_AUTHENTICATION.md) - Command-line OAuth flow
- [� OAuth Auto-Provisioning](authentication/oauth-auto-provisioning.md) - Automatic user creation
- [🎫 Invite Code System](authentication/INVITE_CODE_IMPLEMENTATION.md) - Invite-based registration
- [⚡ Two-Lambda Authentication](authentication/two-lambda-authentication.md) - Architecture pattern
- [🌐 Google OAuth Domain Setup](authentication/google-oauth-domain-setup.md) - Google workspace config

### ⚙️ **CI/CD & Pipelines** → [`/ci-cd/`](ci-cd/)
*Continuous integration and deployment automation*
- [📋 CI System Documentation](ci-cd/ci-system-documentation.md) - Complete CI/CD overview
- [� CI Troubleshooting](ci-cd/ci-troubleshooting-guide.md) - Debugging pipeline issues
- [🎯 Intelligent DTE Detection](ci-cd/intelligent-dte-detection.md) - Smart task distribution
- [🏷️ Badge Setup](ci-cd/CI_BADGES_SETUP.md) - Status badges configuration
- [🔀 Merge Queue Guide](ci-cd/merge-queue-guide.md) - GitHub merge queue setup

### 🔧 **Build & Tooling** → [`/build-and-tooling/`](build-and-tooling/)
*Nx, Jest, and development tools*
- [☁️ Nx Cloud Optimization](build-and-tooling/nx-cloud-optimization-strategy.md) - Performance tuning
- [⚡ Nx Cloud CI Strategy](build-and-tooling/nx-cloud-ci-strategy.md) - CI integration
- [🧪 Jest Configuration](build-and-tooling/jest-changed-files-config.md) - Test setup
- [📦 Package.json Standards](build-and-tooling/package-json-standards.md) - Package conventions
- [🎯 E2E Testing](build-and-tooling/e2e-testing-migration.md) - End-to-end tests

### ☁️ **Deployment** → [`/deployment/`](deployment/)
*AWS infrastructure and deployment processes*
- [☁️ AWS Infrastructure](deployment/aws-infrastructure.md) - Complete AWS setup
- [� Cost Optimization](deployment/cost-optimization.md) - Cost management strategies
- [⚡ Lambda Build Strategy](deployment/lambda-build-strategy.md) - Serverless deployment
- [🔒 Deployment Security](deployment/deployment-security.md) - Security best practices
- [🌐 HTTPS Certificate Setup](deployment/https-certificate-setup.md) - SSL/TLS configuration
- [📦 **Terraform** →](deployment/terraform/) Infrastructure as Code
  - [� Lambda Deployment](deployment/terraform/terraform-lambda-deployment.md)
  - [💾 State Management](deployment/terraform/terraform-state-solution.md)
  - [📖 Quick Reference](deployment/terraform/terraform-quick-reference.md)

### 🛡️ **Security** → [`/security/`](security/)
*Security scanning, secrets management, and audits*
- [� Security Audit Status](security/security-audit-status.md) - Current security posture
- [🔐 Secrets Management](security/GITHUB_SECRETS_GUIDE.md) - GitHub secrets guide
- [🛡️ Security Scanning](security/security-scanning-implementation.md) - Automated scanning
- [⚡ Scanning Optimization](security/security-scanning-optimization.md) - Performance tuning

### 📱 **Mobile Development** → [`/mobile/`](mobile/)
*React Native and Android-specific documentation*
- [🤖 Android Build Setup](mobile/android-build-setup.md) - Android development environment
- [📊 Android Version Matrix](mobile/android-version-matrix.md) - Version compatibility
- [🔨 Mobile Build Automation](mobile/mobile-build-automation.md) - CI/CD for mobile

### 🌐 **Web Development** → [`/web/`](web/)
*Next.js and web application documentation*
- [⚙️ Web Build Configurations](web/web-build-configurations.md) - Build setup
- [🔗 Hash Routing](web/web-hash-routing.md) - Client-side routing
- [📱 Navigation Menu](web/navigation-menu-reorganization.md) - Menu structure

### 💾 **Database** → [`/database/`](database/)
*Database migrations, schema changes, and ORM*
- [📦 Drizzle Upgrade Analysis](database/drizzle-upgrade-analysis.md) - Upgrade planning
- [✅ Drizzle Upgrade Complete](database/drizzle-upgrade-completed.md) - Migration summary

### 📚 **Additional Resources**
- [� API Documentation](api/) - GraphQL schema and endpoints *(Coming Soon)*
- [🤖 AI Agent Instructions](agents/) - Structured CSV files for AI assistance
- [📋 Migration History](migration-history/) - Historical implementation records
- [🗺️ Development Plans](development-plans/) - Future planning documents

## 📋 Documentation by Role

### 👨‍💻 **For Software Developers**
1. [Development Setup](guides/development-setup.md) - Get your environment ready
2. [Cross-Platform Architecture](architecture/cross-platform-system.md) - Understand the system
3. [Authentication Guide](guides/authentication-guide.md) - Implement auth features
4. [Database Schema](architecture/database-schema.md) - Work with data
5. [Troubleshooting](guides/troubleshooting.md) - Fix common issues

### ☁️ **For DevOps Engineers**
1. [AWS Infrastructure](deployment/aws-infrastructure.md) - Understand cloud setup
2. [Terraform Deployment](deployment/terraform/) - Infrastructure as code
3. [CI/CD System](ci-cd/ci-system-documentation.md) - Pipeline management
4. [Security Scanning](security/) - Security automation
5. [Cost Optimization](deployment/cost-optimization.md) - Manage AWS costs

### 📱 **For Mobile Developers**
1. [Android Build Setup](mobile/android-build-setup.md) - Mobile development environment
2. [Cross-Platform System](architecture/cross-platform-system.md) - Shared code patterns
3. [Authentication](authentication/) - Mobile auth implementation
4. [Mobile Build Automation](mobile/mobile-build-automation.md) - CI/CD for mobile

### 🌐 **For Web Developers**
1. [Web Build Configurations](web/web-build-configurations.md) - Next.js setup
2. [Cross-Platform System](architecture/cross-platform-system.md) - Shared components
3. [Authentication](authentication/) - Web auth implementation
4. [Navigation Menu](web/navigation-menu-reorganization.md) - UI structure

### 🧪 **For QA Engineers**
1. [E2E Testing](build-and-tooling/e2e-testing-migration.md) - Automated testing
2. [Jest Configuration](build-and-tooling/jest-changed-files-config.md) - Unit test setup
3. [CI System](ci-cd/ci-system-documentation.md) - Test automation
4. [Troubleshooting](guides/troubleshooting.md) - Debug test issues

### 🏗️ **For Platform Engineers**
1. [Build System](architecture/build-system.md) - Understanding the monorepo
2. [Nx Cloud Optimization](build-and-tooling/nx-cloud-optimization-strategy.md) - Build performance
3. [CI/CD Pipeline](ci-cd/) - Automation infrastructure
4. [Infrastructure](deployment/) - Cloud architecture

## 🏗️ Project Architecture Overview

```
Legacy Sports Platform
├── 📱 Mobile App (React Native)
│   └── iOS + Android native builds
├── 🌐 Web App (Next.js + Vite)
│   └── Server-side rendering + Static generation
├── 🔧 CLI Tools (Node.js)
│   └── Development and deployment utilities
├── 🎨 Shared Components (Cross-platform)
│   └── Tamagui UI + Magic string resolution
├── ⚡ AWS Lambda Functions (Serverless)
│   └── GraphQL API + Authentication
└── 🗄️ Database (PostgreSQL + Drizzle ORM)
    └── Type-safe schema and migrations
```

### **Key Technologies**
- **Frontend**: React Native, Next.js, Tamagui UI
- **Backend**: AWS Lambda, API Gateway, PostgreSQL
- **Build System**: Nx Monorepo, TypeScript, Vite
- **Infrastructure**: Terraform, AWS (Lambda, S3, RDS, Route53)
- **CI/CD**: GitHub Actions, Nx Cloud DTE
- **Cross-Platform**: Magic String System + Metro Native Resolution

### **Documentation Organization**
```
docs/
├── guides/              # Getting started tutorials
├── architecture/        # System design documentation
├── authentication/      # OAuth and auth systems
├── ci-cd/              # Pipeline and automation
├── build-and-tooling/  # Nx, Jest, build tools
├── deployment/         # AWS and infrastructure
│   └── terraform/      # Infrastructure as code
├── security/           # Security and secrets
├── mobile/             # React Native/Android
├── web/                # Next.js/Web app
├── database/           # Schema and migrations
├── api/                # API documentation
├── agents/             # AI assistant data
├── migration-history/  # Historical records
└── development-plans/  # Future planning
```

## 🔍 Finding Information

### **Common Tasks Quick Links**

| Task | Documentation |
|------|---------------|
| 🚀 **Deploy Lambda** | [Lambda Build Strategy](deployment/lambda-build-strategy.md) → [Terraform Deploy](deployment/terraform/terraform-lambda-deployment.md) |
| 🔐 **Setup OAuth** | [OAuth Auto-Provisioning](authentication/oauth-auto-provisioning.md) → [CLI OAuth](authentication/CLI_OAUTH_AUTHENTICATION.md) |
| ❌ **CI Failing** | [CI Troubleshooting](ci-cd/ci-troubleshooting-guide.md) → [Nx Cloud Quota](build-and-tooling/nx-cloud-quota-fix.md) |
| ⚡ **Optimize Builds** | [Nx Cloud Optimization](build-and-tooling/nx-cloud-optimization-strategy.md) → [DTE Detection](ci-cd/intelligent-dte-detection.md) |
| 👤 **New Developer** | [Development Setup](guides/development-setup.md) → [Authentication](guides/authentication-guide.md) → [Troubleshooting](guides/troubleshooting.md) |
| 📱 **Build Mobile** | [Android Setup](mobile/android-build-setup.md) → [Build Automation](mobile/mobile-build-automation.md) |
| 🗄️ **Database Change** | [Database Schema](architecture/database-schema.md) → [Schema Validation](architecture/schema-validation.md) |

### **Search Tips**
- 📂 Browse by category in the folders above
- 🔍 Use VS Code search (`Ctrl+Shift+F`) to find specific topics
- 📋 Check [DOCUMENTATION_STRUCTURE.md](DOCUMENTATION_STRUCTURE.md) for detailed guide
- 🤖 Review [agents/](agents/) for structured AI instructions
- 📚 Look in [migration-history/](migration-history/) for historical context

## 📊 Documentation Status

### ✅ **Complete & Well-Organized**
- ✨ Development guides and troubleshooting
- ✨ Cross-platform architecture
- ✨ Authentication and OAuth systems
- ✨ CI/CD pipelines and automation
- ✨ Build system and Nx Cloud
- ✨ AWS infrastructure and deployment
- ✨ Security scanning and secrets

### 🚧 **In Progress**
- 🔨 API documentation (GraphQL schema)
- 🔨 Performance optimization guides
- 🔨 Component library documentation

### 📝 **Planned**
- 📋 Architecture Decision Records (ADRs)
- 📋 Disaster recovery procedures
- 📋 Monitoring and observability guides
- � Advanced troubleshooting playbooks

## 🤝 Contributing to Documentation

### **When to Update Documentation**
- ✏️ **Feature Implementation**: Document new features with examples
- 🏗️ **Architecture Changes**: Update relevant architecture docs
- ☁️ **Infrastructure Changes**: Update deployment and terraform docs
- 🔐 **Security Changes**: Update security documentation
- 🐛 **Bug Fixes**: Update troubleshooting guides if applicable

### **Documentation Standards**
1. **Clear Structure**: Use consistent heading hierarchy (H1 → H2 → H3)
2. **Code Examples**: Include practical, working code samples
3. **Cross-References**: Link to related documentation
4. **Keep Current**: Update docs alongside code changes
5. **Platform Awareness**: Note cross-platform considerations
6. **Visual Aids**: Use diagrams, tables, and emojis for clarity

### **File Naming Conventions**
- Use `kebab-case.md` for new files
- Prefix with topic for clarity (`ci-*.md`, `nx-*.md`, `oauth-*.md`)
- Add to appropriate category folder
- Update category README.md if needed

## 📞 Getting Help

### **Documentation Issues**
- 📖 Can't find something? Check [DOCUMENTATION_STRUCTURE.md](DOCUMENTATION_STRUCTURE.md)
- 🔗 Broken link? Please report it or submit a PR
- ❓ Documentation unclear? Open an issue with suggestions

### **Technical Support**
- 🛠️ **Setup Issues**: [Development Setup](guides/development-setup.md)
- 🐛 **Common Problems**: [Troubleshooting Guide](guides/troubleshooting.md)
- 🏗️ **Architecture Questions**: [Architecture Docs](architecture/)
- ☁️ **Deployment Issues**: [Deployment Guides](deployment/)
- 🔐 **Auth Problems**: [Authentication Docs](authentication/)
- ⚙️ **CI/CD Issues**: [CI/CD Troubleshooting](ci-cd/ci-troubleshooting-guide.md)

---

**📌 Remember**: This documentation is your guide to the Legacy Sports platform. Start with the [Getting Started](#-quick-navigation) section and explore from there. Each category folder contains a README.md for quick orientation.

*Documentation last reorganized: October 15, 2025*
