# GraphQL Test Command

The `graphql-test` command allows you to execute arbitrary GraphQL queries against the Legacy Sports API using your authenticated CLI session.

## Basic Usage

```bash
# Execute a simple query
ppnpm run cli graphql-test --query "query { users { id email } }"

# Execute query from file
ppnpm run cli graphql-test --file ./examples/queries/users.graphql

# Query with variables
ppnpm run cli graphql-test \
  --query "query GetPlayer($id: Int!) { player(id: $id) { name } }" \
  --variables '{"id": 123}'

# Use specific authenticated user
ppnpm run cli graphql-test \
  --query "{ users { id } }" \
  --user admin@example.com

# Raw JSON output (for scripting)
ppnpm run cli graphql-test --query "{ users { id } }" --raw
```

## Command Options

| Option        | Alias | Description                           |
| ------------- | ----- | ------------------------------------- |
| `--query`     | `-q`  | GraphQL query string to execute       |
| `--file`      | `-f`  | Path to file containing GraphQL query |
| `--variables` | `-v`  | JSON string of query variables        |
| `--user`      | `-u`  | Email of user to authenticate as      |
| `--raw`       | `-r`  | Output raw JSON without formatting    |
| `--pretty`    | `-p`  | Pretty print JSON (default: true)     |
| `--headers`   |       | Include response headers in output    |

## Example Queries

### 1. List All Users

```bash
ppnpm run cli graphql-test --file ./examples/queries/users.graphql
```

**Query:**

```graphql
query GetAllUsers {
  users {
    id
    email
    username
    accessLevel
    createdAt
  }
}
```

### 2. Get Player with Statistics

```bash
ppnpm run cli graphql-test \
  --file ./examples/queries/player-with-stats.graphql \
  --variables '{"id": 123}'
```

**Query:**

```graphql
query GetPlayer($id: Int!) {
  player(id: $id) {
    id
    name
    position
    team
    careerBatting {
      gamesPlayed
      atBats
      hits
      homeRuns
      rbis
      battingAverage
    }
  }
}
```

### 3. Paginated Players List

```bash
ppnpm run cli graphql-test \
  --file ./examples/queries/players-paginated.graphql \
  --variables '{"limit": 10, "offset": 0}'
```

### 4. Schema Introspection

```bash
ppnpm run cli graphql-test --file ./examples/queries/introspect.graphql
```

### 5. Create User (Mutation)

```bash
ppnpm run cli graphql-test \
  --file ./examples/queries/create-user.graphql \
  --variables '{
    "input": {
      "email": "newuser@example.com",
      "username": "New User",
      "accessLevel": "user"
    }
  }'
```

## Advanced Usage

### Using Variables

Variables can be passed as JSON strings:

```bash
# Simple variables
--variables '{"id": 123, "name": "John"}'

# Complex nested variables
--variables '{
  "input": {
    "player": {
      "name": "Player Name",
      "position": "1B",
      "team": "Team Name"
    },
    "stats": {
      "season": 2024,
      "gamesPlayed": 162
    }
  }
}'
```

### Multi-User Authentication

If you have multiple users authenticated:

```bash
# Check available users
ppnpm run cli auth list

# Use specific user for query
ppnpm run cli graphql-test \
  --query "{ users { id } }" \
  --user admin@example.com
```

### Scripting and Automation

For scripts and automation, use the `--raw` flag:

```bash
# Get raw JSON output
result=$(ppnpm run cli graphql-test --query "{ users { id } }" --raw)
echo $result | jq '.users | length'
```

### File-Based Queries

Create `.graphql` files for complex queries:

```graphql
# queries/complex-query.graphql
query ComplexPlayerQuery($season: Int!, $minGames: Int!) {
  players {
    name
    seasonBatting(season: $season) {
      gamesPlayed
      battingAverage
    }
  }
}
```

```bash
ppnpm run cli graphql-test \
  --file queries/complex-query.graphql \
  --variables '{"season": 2024, "minGames": 100}'
```

## Response Format

The command provides detailed output including:

### Success Response

```
🔍 Executing GraphQL query from command line...
🔐 Authenticating as: user@example.com (admin)

📋 Query Details:
────────────────────────────────────────────────────────────
Query:
query { users { id email } }
────────────────────────────────────────────────────────────

⚡ Executing query...

✅ Query completed in 245ms
📊 Status: 200 OK

📋 Response:
════════════════════════════════════════════════════════════
✅ Data:
{
  "users": [
    {
      "id": 1,
      "email": "admin@example.com"
    }
  ]
}
════════════════════════════════════════════════════════════
```

### Error Response

```
❌ GraphQL Errors:

  Error 1:
    Message: Cannot query field "invalidField" on type "User"
    Location: Line 1, Column 15
    Path: users.invalidField
```

## Troubleshooting

### Authentication Issues

```bash
# Check authentication status
ppnpm run cli auth status

# Re-authenticate if needed
ppnpm run cli auth login
```

### Query Validation

```bash
# Test with introspection first
ppnpm run cli graphql-test --file ./examples/queries/introspect.graphql

# Validate syntax with simple query
ppnpm run cli graphql-test --query "{ __schema { types { name } } }"
```

### Permission Issues

```bash
# Check your access level
ppnpm run cli auth status

# Some queries require admin access
# Contact your administrator if you need elevated permissions
```

### Network Issues

```bash
# Check GraphQL endpoint
echo $VITE_GRAPHQL_URL

# Test with headers to debug
ppnpm run cli graphql-test --query "{ users { id } }" --headers
```

## Environment Configuration

Set your GraphQL endpoint:

```env
# .env file
VITE_GRAPHQL_URL=https://api.legacysports.dev/graphql
# or
GRAPHQL_URL=https://api.legacysports.dev/graphql
```

## Tips

1. **Start Simple**: Begin with basic queries like `{ users { id } }`
2. **Use Files**: Store complex queries in `.graphql` files for reuse
3. **Validate First**: Use introspection to understand the schema
4. **Check Permissions**: Some operations require specific access levels
5. **Pretty Print**: Use `--pretty` for readable output during development
6. **Raw Output**: Use `--raw` for scripts and automation

## Common Queries

Save these as files in your `queries/` directory:

- **Health Check**: `{ __schema { types { name } } }`
- **Current User**: `{ currentUser { email accessLevel } }`
- **All Players**: `{ players { id name position } }`
- **User Count**: `{ users { id } }` (then count in your script)
- **Schema Types**: `{ __schema { types { name kind } } }`
