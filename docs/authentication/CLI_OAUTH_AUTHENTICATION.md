# CLI OAuth Authentication System

## Overview

This document describes the OAuth authentication system for Legacy Sports CLI operations. The system enables secure CLI access to the GraphQL API using the same OAuth infrastructure used by the web application.

## Architecture

### Components

1. **OAuth Proxy Lambda** - Handles OAuth flows and device authentication
2. **CLI Auth Service** - Manages local token storage and authentication flows  
3. **Auth Middleware** - Provides authentication for CLI commands
4. **Device Flow** - Browser-based authentication for CLI applications

### Authentication Flow

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
│     CLI     │    │   OAuth Lambda   │    │  User Browser   │
│             │    │    (/oauth)      │    │                 │
└─────────────┘    └──────────────────┘    └─────────────────┘
       │                     │                      │
   1.  │ cli auth login      │                      │
       │────────────────────►│                      │
       │                     │                      │
   2.  │ return auth URL +   │                      │
       │ verification code   │                      │
       │◄────────────────────│                      │
       │                     │                      │
   3.  │ open browser        │                      │
       │─────────────────────┼─────────────────────►│
       │                     │                      │
   4.  │                     │ complete OAuth flow  │
       │                     │◄─────────────────────│
       │                     │                      │
   5.  │ poll for token      │                      │
       │────────────────────►│                      │
       │                     │                      │
   6.  │ return JWT token    │                      │
       │◄────────────────────│                      │
```

## Getting Started

### 1. Authentication

First-time setup requires authentication:

```bash
# Authenticate with Google OAuth
npm run cli auth login

# This will:
# 1. Display a URL and verification code
# 2. Open your browser to the OAuth flow
# 3. Store the JWT token locally
```

### 2. Check Authentication Status

```bash
# Check current authentication status
npm run cli auth status

# List all authenticated users
npm run cli auth list
```

### 3. Using Authenticated Commands

```bash
# Example: List users using authenticated API
npm run cli list-users-auth

# Most CLI commands now support authentication
npm run cli <command> --help
```

## CLI Commands

### Authentication Management

| Command | Description |
|---------|-------------|
| `cli auth login` | Start OAuth login flow |
| `cli auth status` | Show current authentication status |
| `cli auth list` | List all authenticated users |
| `cli auth switch --user <email>` | Switch to a different user |
| `cli auth logout` | Logout current user |
| `cli auth logout --user <email>` | Logout specific user |
| `cli auth logout --all` | Logout all users |
| `cli graphql-test --query "<query>"` | Execute GraphQL query with authentication |
| `cli graphql-test --file <path>` | Execute GraphQL query from file |

### Example Commands

```bash
# Authenticate
npm run cli auth login

# Check status
npm run cli auth status
# Output: 
# ✅ Authentication Status
# Current User: user@example.com
# Access Level: admin

# List users (requires admin access)
npm run cli list-users-auth

# Test arbitrary GraphQL queries
npm run cli graphql-test --query "query { users { id email } }"
npm run cli graphql-test --file ./examples/queries/health-check.graphql

# Switch users (if multiple authenticated)
npm run cli auth switch --user other@example.com

# Logout
npm run cli auth logout
```

## OAuth Service Endpoints

The OAuth Lambda now includes device flow endpoints:

### New Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/oauth/device/authorize` | POST | Start device authorization flow |
| `/oauth/device/token` | POST | Poll for authentication token |
| `/oauth/device/verify` | GET | User verification page |
| `/oauth/google/authorize` | GET | Initiate Google OAuth flow |
| `/oauth/google/callback` | GET | Handle OAuth callback |

### Device Flow Process

1. **CLI requests device authorization**:
   ```bash
   POST /oauth/device/authorize
   {
     "client_type": "cli",
     "device_name": "CLI-hostname"
   }
   ```

2. **Service returns verification info**:
   ```json
   {
     "device_code": "abc123...",
     "user_code": "ABC123",
     "verification_uri": "https://api.legacysports.dev/oauth/device/verify",
     "expires_in": 600,
     "interval": 5
   }
   ```

3. **User visits verification URI and enters code**

4. **CLI polls for token**:
   ```bash
   POST /oauth/device/token
   {
     "device_code": "abc123..."
   }
   ```

5. **Service returns JWT token**:
   ```json
   {
     "jwt": "eyJ0eXAi...",
     "user": {
       "id": 1,
       "email": "user@example.com",
       "username": "User Name",
       "accessLevel": "admin"
     }
   }
   ```

## Security Features

### Token Storage

- Tokens stored in `~/.legacy-sports/auth.json`
- File permissions set to `0600` (user read/write only)
- Supports multiple authenticated users
- Automatic token expiration handling

### Pre-Authorization Security

- Uses existing OAuth Lambda security model
- Only pre-authorized users can authenticate
- User existence checked before OAuth validation
- Access levels enforced: `readonly`, `user`, `admin`

### Token Validation

- JWT tokens include expiration
- Automatic token refresh (when refresh tokens available)
- Invalid token detection and re-authentication prompts

## Development Integration

### Adding Authentication to CLI Commands

```typescript
import { AuthMiddleware } from '../services/AuthMiddleware';

export async function handleMyCommand(args: any): Promise<void> {
  const authMiddleware = new AuthMiddleware();
  
  try {
    // Require authentication
    await authMiddleware.requireAuth();
    
    // Require specific access level
    await authMiddleware.requireAccessLevel('admin');
    
    // Make authenticated GraphQL request
    const data = await authMiddleware.makeGraphQLRequest(
      'query MyQuery { users { id email } }'
    );
    
    console.log('Users:', data.users);
    
  } catch (error) {
    if (error.message.includes('Authentication required')) {
      console.log('Please run "cli auth login" first');
      return;
    }
    throw error;
  }
}
```

### Making Authenticated API Requests

```typescript
// GraphQL request
const data = await authMiddleware.makeGraphQLRequest(
  'query GetPlayer($id: Int!) { player(id: $id) { name } }',
  { id: 123 }
);

// Raw API request
const response = await authMiddleware.makeAuthenticatedRequest(
  'https://api.legacysports.dev/graphql',
  {
    method: 'POST',
    body: JSON.stringify({ query: 'query { players { name } }' })
  }
);
```

### Optional Authentication

```typescript
// Skip authentication if not configured
const token = await authMiddleware.requireAuth({ 
  skipIfNotConfigured: true 
});

if (token) {
  // Use authenticated API
  const data = await authMiddleware.makeGraphQLRequest(query);
} else {
  // Fall back to direct database access
  await runWithInternalClient(opts, async (db) => {
    // Direct DB operations
  });
}
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Authentication required` | No valid token stored | Run `cli auth login` |
| `User not authorized` | User not in database | Contact admin to add user |
| `Access denied` | Insufficient permissions | Check access level with `cli auth status` |
| `Authentication token is invalid` | Token expired or corrupted | Run `cli auth login` again |

### Troubleshooting

1. **Check authentication status**:
   ```bash
   npm run cli auth status
   ```

2. **Clear authentication and re-login**:
   ```bash
   npm run cli auth logout --all
   npm run cli auth login
   ```

3. **Check OAuth service health**:
   ```bash
   curl https://api.legacysports.dev/oauth
   ```

4. **Enable debug logging**:
   ```bash
   LOG_LEVEL=debug npm run cli auth login
   ```

## Environment Configuration

### Required Environment Variables

```env
# OAuth service URL
VITE_OAUTH_PROXY_URL=https://api.legacysports.dev/oauth
# OR
OAUTH_PROXY_URL=https://api.legacysports.dev/oauth

# GraphQL API URL  
VITE_GRAPHQL_URL=https://api.legacysports.dev/graphql
# OR
GRAPHQL_URL=https://api.legacysports.dev/graphql
```

### Development vs Production

- **Development**: Uses localhost URLs and relaxed security
- **Production**: Uses production OAuth Lambda and strict security
- **Environment detection**: Automatic based on `NODE_ENV`

## Migration Guide

### Updating Existing Commands

1. **Add authentication middleware**:
   ```typescript
   import { AuthMiddleware } from '../services/AuthMiddleware';
   ```

2. **Replace direct database calls**:
   ```typescript
   // Before
   await runWithInternalClient(opts, async (db) => {
     const users = await db.select()...;
   });
   
   // After  
   const authMiddleware = new AuthMiddleware();
   await authMiddleware.requireAuth();
   const data = await authMiddleware.makeGraphQLRequest(query);
   ```

3. **Add fallback for compatibility**:
   ```typescript
   const useAuth = args.useAuth ?? true;
   if (useAuth) {
     // New authenticated approach
   } else {
     // Legacy direct database approach  
   }
   ```

### Backward Compatibility

- Existing commands continue to work unchanged
- New `--use-auth` flag enables authentication
- Gradual migration path provided
- Legacy direct database access preserved

## GraphQL Testing

The CLI includes a powerful GraphQL testing command for debugging and development:

### Basic Testing

```bash
# Simple query
npm run cli graphql-test --query "query { users { id email } }"

# Query from file  
npm run cli graphql-test --file ./examples/queries/users.graphql

# Query with variables
npm run cli graphql-test \
  --query "query GetPlayer($id: Int!) { player(id: $id) { name } }" \
  --variables '{"id": 123}'
```

### Health Check

```bash
# Comprehensive API health check
npm run cli graphql-test --file ./examples/queries/health-check.graphql
```

### Example Output

```
🔍 Executing GraphQL query from file: ./examples/queries/users.graphql
🔐 Authenticating as: admin@example.com (admin)

📋 Query Details:
────────────────────────────────────────────────────────────
Query:
query GetAllUsers {
  users {
    id
    email
    username
    accessLevel
  }
}
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
      "email": "admin@example.com",
      "username": "Admin User",
      "accessLevel": "admin"
    }
  ]
}
════════════════════════════════════════════════════════════
```

### Available Example Queries

- `examples/queries/users.graphql` - List all users
- `examples/queries/players-paginated.graphql` - Paginated players list
- `examples/queries/player-with-stats.graphql` - Player with statistics
- `examples/queries/health-check.graphql` - Comprehensive API test
- `examples/queries/introspect.graphql` - Schema introspection

See `examples/GRAPHQL_TEST_GUIDE.md` for complete documentation.

## Future Enhancements

1. **Token Refresh**: Automatic token refresh using refresh tokens
2. **SSO Integration**: Support for other OAuth providers
3. **Session Management**: Browser-based session sharing
4. **Audit Logging**: Track CLI operations in database
5. **Role-Based Access**: Fine-grained permissions per command
6. **Query Builder**: Interactive GraphQL query builder
7. **Performance Profiling**: Query performance analysis tools

---

This authentication system provides secure, user-friendly CLI access while maintaining backward compatibility with existing workflows.
