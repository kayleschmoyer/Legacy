# db (GraphQL Lambda)

The core GraphQL API Lambda — serves the entire Legacy Sports GraphQL schema via Apollo Server and Pothos. Runs inside the VPC with direct access to RDS PostgreSQL.

## Quick Start

```powershell
# Serve locally
pnpm exec nx serve db

# Build
pnpm exec nx build db

# Run migrations
pnpm exec nx run db:migrate

# Print GraphQL schema
pnpm exec nx run db:print-schema
```

## Related

- [GraphQL Schema Documentation](../../docs/api/graphql-schema.md)
- [GraphQL Integration](../../docs/architecture/graphql-integration.md)
- [Lambda Build Strategy](../../docs/deployment/lambda-build-strategy.md)
- [Dev DB Lambda Skill](../../.agents/skills/dev-db-lambda/SKILL.md)
