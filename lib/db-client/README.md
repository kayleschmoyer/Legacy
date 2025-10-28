# Database Client

Database client library and migration tools for PostgreSQL database management.

## 🗄️ Overview

This library provides:

- **Database client**: Type-safe database access with Drizzle ORM
- **Migrations**: Schema version control and deployment
- **Utilities**: Database connection management and helpers
- **Types**: TypeScript definitions for all database entities

## 🏗️ Technology Stack

- **ORM**: Drizzle ORM for type-safe queries
- **Database**: PostgreSQL 14+
- **Migrations**: Drizzle migration system
- **Connection**: Connection pooling with pg
- **Types**: Generated TypeScript types

## 📦 Package Structure

```
lib/db-client/
├── src/
│   ├── drizzle/
│   │   ├── migrations/     # Database migration files
│   │   ├── schema.ts       # Database schema definitions
│   │   └── index.ts        # Database connection setup
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Database utilities
│   └── index.ts            # Public API exports
├── scripts/                # Migration and utility scripts
└── project.json            # NX build configuration
```

## 🚀 Quick Start

### Database Connection

```typescript
import { db } from '@legacy-sports/db-client';

// Query with type safety
const players = await db.select().from(playersTable);

// Insert with validation
await db.insert(playersTable).values({
  name: 'John Doe',
  position: 'QB',
  team: 'Eagles',
});
```

### Running Migrations

```bash
# Run pending migrations
pnpm run db:migrate

# Generate new migration
pnpm run db:generate

# Reset database (development only)
pnpm run db:reset
```

## 🔧 Configuration

### Environment Variables

```bash
# Database connection
DB_HOST=localhost:5432
DB_NAME=legacy_sports_dev
DB_USER=postgres
DB_PASSWORD=password

# Or use connection string
DATABASE_URL=postgresql://user:password@localhost:5432/legacy_sports
```

### AWS RDS Configuration

For production, database credentials are stored in AWS Secrets Manager:

- Secret name: `legacy-sports-dev-db-creds`
- Auto-rotation enabled
- VPC-only access

## 📊 Database Schema

### Core Tables

**Players**:

- Player information and statistics
- Position and team associations
- Performance metrics

**Games**:

- Game schedules and results
- Team matchups
- Score tracking

**Statistics**:

- Player performance data
- Game-by-game stats
- Season aggregations

**Teams**:

- Team information
- League associations
- Historical data

### Relationships

```
Teams ──< Players
   │
   └──< Games >── Teams
        │
        └──< Statistics >── Players
```

## 🛠️ Development

### Schema Changes

1. **Update schema** in `src/drizzle/schema.ts`
2. **Generate migration**: `pnpm run db:generate`
3. **Review migration** in `src/drizzle/migrations/`
4. **Apply migration**: `pnpm run db:migrate`

### Type Generation

Types are automatically generated from the schema:

- Table types for inserts/selects
- Relationship types
- Query result types

### Local Development

```bash
# Start local PostgreSQL (Docker)
docker run --name postgres-dev \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=legacy_sports_dev \
  -p 5432:5432 \
  -d postgres:14

# Set up database
pnpm run db:setup

# Run migrations
pnpm run db:migrate

# Seed with test data
pnpm run db:seed
```

## 🧪 Testing

### Database Testing

```bash
# Run database tests
pnpm run test:db

# Test migrations
pnpm run test:migrations

# Integration tests
pnpm run test:integration
```

### Test Database

Separate test database for isolated testing:

- Automatic setup/teardown
- Transaction rollback per test
- Seeded test data

## 📦 Migrations

### Migration System

Uses Drizzle migration system:

- SQL-based migrations
- Version tracking
- Rollback support
- Schema validation

### Common Migration Tasks

```bash
# Add new table
pnpm run db:generate -- --name add_players_table

# Add column
pnpm run db:generate -- --name add_player_stats_column

# Create index
pnpm run db:generate -- --name add_player_name_index

# Data migration
pnpm run db:generate -- --name migrate_player_data
```

### Migration Best Practices

- **Backwards compatible**: Don't break existing queries
- **Atomic operations**: Use transactions
- **Data preservation**: Backup before destructive changes
- **Testing**: Test migrations on copy of production data

## 🔍 Query Examples

### Basic Queries

```typescript
import { db, playersTable, gamesTable } from '@legacy-sports/db-client';

// Select all players
const allPlayers = await db.select().from(playersTable);

// Filter by team
const teamPlayers = await db
  .select()
  .from(playersTable)
  .where(eq(playersTable.team, 'Eagles'));

// Join with games
const playerStats = await db
  .select()
  .from(playersTable)
  .leftJoin(gamesTable, eq(playersTable.id, gamesTable.playerId));
```

### Complex Queries

```typescript
// Aggregation
const teamStats = await db
  .select({
    team: playersTable.team,
    totalPoints: sum(playersTable.points),
    avgPoints: avg(playersTable.points),
  })
  .from(playersTable)
  .groupBy(playersTable.team);

// Subqueries
const topPlayers = await db
  .select()
  .from(playersTable)
  .where(
    playersTable.points >
      db.select({ avg: avg(playersTable.points) }).from(playersTable),
  );
```

## 🔒 Security

### Connection Security

- SSL/TLS encrypted connections
- VPC-only database access
- IAM database authentication
- Connection pooling limits

### Query Security

- Parameterized queries (SQL injection prevention)
- Type validation
- Input sanitization
- Rate limiting

## 📊 Performance

### Query Optimization

- Proper indexing strategy
- Query performance monitoring
- Connection pooling
- Read replicas for scaling

### Monitoring

```typescript
// Query timing
const start = Date.now();
const result = await db.select().from(playersTable);
console.log(`Query took ${Date.now() - start}ms`);

// Connection monitoring
console.log(`Active connections: ${pool.totalCount}`);
console.log(`Idle connections: ${pool.idleCount}`);
```

## 🔍 Troubleshooting

### Common Issues

**Connection failures**:

- Check database credentials
- Verify network connectivity
- Review security group settings

**Migration errors**:

- Check migration SQL syntax
- Verify schema conflicts
- Review transaction boundaries

**Performance issues**:

- Analyze query execution plans
- Check index usage
- Monitor connection pool

### Debugging

```bash
# Database logs
docker logs postgres-dev

# Query analysis
EXPLAIN ANALYZE SELECT * FROM players WHERE team = 'Eagles';

# Connection debugging
pnpm run db:debug
```

## 📚 Resources

- [Drizzle ORM Documentation](https://drizzle.team)
- [PostgreSQL Documentation](https://postgresql.org/docs/)
- [AWS RDS for PostgreSQL](https://docs.aws.amazon.com/rds/latest/userguide/CHAP_PostgreSQL.html)
- [Database Design Best Practices](https://www.postgresql.org/docs/14/ddl-best-practices.html)

---

This library provides the foundation for all database interactions across the Legacy Sports platform.
