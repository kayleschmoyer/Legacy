# Database Documentation

This directory contains database-related documentation including schema management, migrations, and ORM (Drizzle) upgrade information.

## 📑 Contents

### Drizzle ORM

- **[Drizzle Upgrade Analysis](drizzle-upgrade-analysis.md)** - Analysis and planning for Drizzle ORM upgrade
- **[Drizzle Upgrade Completed](drizzle-upgrade-completed.md)** - Completion summary and lessons learned
- **[Drizzle Rollback Migrations](drizzle-rollback-migrations.md)** - Migration system with rollback support

### Migration Policy

- **[Migration Policy](migration-policy.md)** - ⚠️ **REQUIRED READING**: All schema changes MUST use migrations

## 🎯 Quick Start

### Understanding Database Setup

1. Review [Database Schema](../architecture/database-schema.md) for overall design
2. Check [Schema Validation](../architecture/schema-validation.md) for patterns
3. Review Drizzle upgrade docs for ORM details

### Working with Drizzle ORM

1. Review [Drizzle Upgrade Completed](drizzle-upgrade-completed.md) for current state
2. Check [Schema Validation](../architecture/schema-validation.md) for best practices
3. Follow TypeScript patterns for type safety

### Planning Database Changes

1. Review existing schema in [Database Schema](../architecture/database-schema.md)
2. Plan migrations carefully
3. Test in development environment
4. Document changes

## 🔗 Related Documentation

- [Database Schema](../architecture/database-schema.md) - Complete schema documentation
- [Schema Validation](../architecture/schema-validation.md) - Validation patterns
- [GraphQL Integration](../architecture/graphql-integration.md) - API layer integration

## 💡 Common Tasks

### Create Migration

1. Review [Database Schema](../architecture/database-schema.md)
2. Create migration file with Drizzle
3. Test migration locally
4. Apply to staging, then production

### Update Schema

1. Modify schema files in code
2. Generate migration with Drizzle
3. Review [Schema Validation](../architecture/schema-validation.md)
4. Test thoroughly

### Upgrade Drizzle ORM

1. Review [Drizzle Upgrade Analysis](drizzle-upgrade-analysis.md) for planning
2. Check [Drizzle Upgrade Completed](drizzle-upgrade-completed.md) for lessons
3. Follow upgrade steps carefully
4. Test all database operations

### Troubleshoot Database Issues

1. Check connection strings and credentials
2. Review recent migrations
3. Verify schema matches expectations
4. Check [Troubleshooting Guide](../guides/troubleshooting.md)

## 💾 Database Stack

### PostgreSQL

- Production database hosted on AWS RDS
- Local development via Docker or local installation
- Connection pooling configured

### Drizzle ORM

- Type-safe database access
- Migration management
- Schema definition in TypeScript
- See upgrade docs for version info

### Best Practices

- **Type Safety**: Use Drizzle TypeScript types
- **Migrations**: Always create migrations, never modify database directly ([Migration Policy](migration-policy.md))
- **Testing**: Test migrations in development first
- **Backups**: Ensure backups before major changes
- **Documentation**: Keep schema docs updated
- **No Schema Changes in Scripts**: See [Migration Policy](migration-policy.md) for enforcement

---

[← Back to Documentation Hub](../README.md)
