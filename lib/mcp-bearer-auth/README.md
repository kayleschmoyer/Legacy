# mcp-bearer-auth

Shared bearer-token validation for the hosted HTTP MCP server Lambdas
(`github`, `jira`, `ci`). Single source consolidated from three identical
copies (LS-5091).

Validates a presented JWT against the Cognito issuer (signature, issuer,
`exp`) and authorizes it for the calling server by token shape:

- a **scoped access token** carrying this server's own resource-server scope
  (`mcp/github`, `mcp/jira`, or `mcp/ci`). Acceptance is grant-agnostic: the
  scope can come from the machine `client_credentials` grant (headless agents)
  or from a user authorization-code access token (the claude.ai custom remote
  MCP connector, which sends the access token rather than the ID token —
  LS-5151);
- a **legacy** user ID token whose `aud` matches the public client id.

The scopes a client should request are advertised per-server in the OAuth
Protected Resource Metadata (RFC 9728) via the `MCP_OAUTH_SCOPES` env var
(e.g. `openid mcp/github`); the claude.ai connector reads them during consent
so the issued access token carries the `mcp/*` scope.

`MCP_AUTH_MODE` (`legacy` | `machine` | `dual`, default `dual`) selects which
shapes are accepted, so environments can cut over with zero downtime.
