# Database Migrations

This directory contains Drizzle migrations for both public and internal schemas.

## Directory Structure

```
migrations/
├── public/          # Public schema migrations
│   ├── meta/        # Migration metadata
│   └── *.sql        # Migration files
└── internal/        # App internal schema migrations
    ├── meta/        # Migration metadata
    └── *.sql        # Migration files
```

## Available Commands

### Generate Migrations

```bash
# Generate migration for public schema
npm run generate:migration:public

# Generate migration for internal schema
npm run generate:migration:internal
```

### Apply Migrations

```bash
# Apply public schema migrations
npm run migrate:public

# Apply internal schema migrations
npm run migrate:internal
```

### Database Introspection

```bash
# Introspect public schema
npm run introspect:public

# Introspect internal schema
npm run introspect:internal
```

### Database Studio

```bash
# Open studio for public schema
npm run studio:public

# Open studio for internal schema
npm run studio:internal
```

## Migration Workflow

1. **Make schema changes** in `src/drizzle/public/models/` or `src/drizzle/internal/`
2. **Generate migration** using appropriate command
3. **Review generated SQL** before applying
4. **Apply migration** to database
5. **Commit both schema and migration files**

## Important Notes

- Always review generated migrations before applying
- Test migrations on development database first
- Keep migration files in version control
- Never edit migration files manually after they've been applied
