# Architecture Documentation

This directory contains technical architecture documentation for the Legacy Sports platform, covering system design, patterns, and technical decisions.

## 📑 Contents

### Core Architecture

- **[Build System](build-system.md)** - Nx monorepo, dependency management, and build workflows
- **[Cross-Platform System](cross-platform-system.md)** - Magic strings and native module resolution
- **[Database Schema](database-schema.md)** - Complete database design and entity relationships
- **[GraphQL Integration](graphql-integration.md)** - API layer design and implementation
- **[Schema Validation](schema-validation.md)** - Drizzle ORM patterns and type safety
- **[Season Selection Architecture](season-selection-architecture.md)** - Per-player season assignment and game selection

## 🎯 Understanding the Architecture

### Start Here

1. **[Build System](build-system.md)** - Learn how the monorepo works
2. **[Cross-Platform System](cross-platform-system.md)** - Understand shared code strategy
3. **[Database Schema](database-schema.md)** - Review data models

### Key Concepts

#### Nx Monorepo

The project uses Nx for workspace management, enabling:

- Shared libraries across web and mobile
- Efficient build caching
- Dependency graph analysis
- Coordinated testing and deployment

See [Build System](build-system.md) for details.

#### Cross-Platform Code Sharing

React Native (mobile) and Next.js (web) share:

- Business logic
- Data models
- UI components (via Tamagui)
- API client code

See [Cross-Platform System](cross-platform-system.md) for the magic string resolution pattern.

#### GraphQL API Layer

Backend uses:

- AWS Lambda for serverless compute
- GraphQL for flexible API queries
- PostgreSQL for data persistence
- Drizzle ORM for type-safe database access

See [GraphQL Integration](graphql-integration.md) for API design.

## 🏗️ System Components

### Frontend Applications

- **Mobile App**: React Native (iOS + Android)
- **Web App**: Next.js with SSR/SSG
- **CLI Tools**: Node.js command-line utilities

### Backend Services

- **GraphQL API**: AWS Lambda + API Gateway
- **Authentication**: OAuth 2.0 with auto-provisioning
- **Database**: PostgreSQL on AWS RDS

### Infrastructure

- **Compute**: AWS Lambda (serverless)
- **Storage**: S3 for static assets
- **Database**: RDS PostgreSQL
- **DNS**: Route53
- **CDN**: CloudFront (optional)
- **IaC**: Terraform

## 🔗 Related Documentation

### Implementation Details

- [Authentication](../authentication/) - OAuth and auth patterns
- [Database](../database/) - Migrations and ORM
- [Deployment](../deployment/) - Infrastructure setup

### Development Guides

- [Development Setup](../guides/development-setup.md) - Getting started
- [Build & Tooling](../build-and-tooling/) - Nx optimization
- [CI/CD](../ci-cd/) - Pipeline architecture

## 💡 Common Architecture Questions

### How does code sharing work between web and mobile?

See [Cross-Platform System](cross-platform-system.md) for the magic string resolution pattern that enables platform-specific imports.

### How is the build system organized?

See [Build System](build-system.md) for Nx workspace structure, dependency graph, and build order.

### What's the database schema?

See [Database Schema](database-schema.md) for complete entity relationships and table definitions.

### How does the API layer work?

See [GraphQL Integration](graphql-integration.md) for API design, resolvers, and data fetching patterns.

### How is type safety maintained?

See [Schema Validation](schema-validation.md) for Drizzle ORM patterns and TypeScript integration.

## 🔄 Architecture Patterns

### Repository Pattern

- Libraries in `lib/` for shared code
- Apps in `apps/` for deployable applications
- Clear dependency boundaries enforced by Nx

### Magic String Resolution

- Platform-specific code resolution
- `.native.ts` for mobile
- `.web.ts` for web
- Shared code by default

### Type-Safe Database Access

- Drizzle ORM for PostgreSQL
- TypeScript schema definitions
- Type-safe queries and mutations
- Migration management

### Serverless Architecture

- AWS Lambda for API and auth
- API Gateway for routing
- PostgreSQL for persistence
- S3 for static assets

## 📐 Architecture Decisions

For historical context on architecture decisions, see:

- [Migration History](../migration-history/) - Past migrations and refactorings
- [Development Plans](../development-plans/) - Future architecture plans

---

[← Back to Documentation Hub](../README.md)
