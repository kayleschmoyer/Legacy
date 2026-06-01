# mcp-bearer-auth

Shared bearer-token validation for the hosted HTTP MCP server Lambdas
(`github`, `jira`, `ci`). Single source consolidated from three identical
copies (LS-5091).

Validates a presented JWT against the Cognito issuer (signature, issuer,
`exp`) and authorizes it for the calling server by token shape:

- a **machine** `client_credentials` access token carrying this server's own
  resource-server scope (`mcp/github`, `mcp/jira`, or `mcp/ci`);
- a **legacy** user ID token whose `aud` matches the public client id.

`MCP_AUTH_MODE` (`legacy` | `machine` | `dual`, default `dual`) selects which
shapes are accepted, so environments can cut over with zero downtime.
