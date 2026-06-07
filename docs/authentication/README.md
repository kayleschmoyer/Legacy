# Authentication Documentation

This directory contains all authentication-related documentation for the Legacy Sports platform, including OAuth 2.0 implementation, user provisioning, and access control.

## 📑 Contents

### OAuth Implementation

- **[CLI OAuth Authentication](CLI_OAUTH_AUTHENTICATION.md)** - Complete guide to OAuth flow for CLI tools
- **[OAuth Auto-Provisioning](oauth-auto-provisioning.md)** - Automatic user creation on first login
- **[OAuth Auto-Provisioning Summary](oauth-auto-provisioning-summary.md)** - Implementation summary
- **[OAuth Pre-Authorization Fix](oauth-pre-authorization-fix.md)** - Pre-authorization flow improvements

### Authentication Patterns

- **[Two-Lambda Authentication](two-lambda-authentication.md)** - Architecture for auth and API lambdas
- **[Google OAuth Domain Setup](google-oauth-domain-setup.md)** - Google Workspace OAuth configuration

### Access Control

- **[Invite Code Implementation](INVITE_CODE_IMPLEMENTATION.md)** - Invite-based registration system

### Discord Account Linking

The web app supports linking a Discord account from Profile Settings. The OAuth callback is handled by `apps/web/src/pages/auth/DiscordCallbackPage.tsx`.

**Security note (LS-2549):** The oauth-proxy returns a deliberately vague 409 ("Could not link Discord account") when a Discord account is already linked to a _different_ Legacy Sports user. This message is intentionally generic to prevent account enumeration — the server must not reveal whether the Discord ID belongs to another account. The constant `DISCORD_ALREADY_LINKED_MESSAGE` in `DiscordCallbackPage.tsx` must stay in sync with the server's message; **do not make the server message more specific.**

## 🎯 Quick Start

### Setting Up OAuth

1. Read [OAuth Auto-Provisioning](oauth-auto-provisioning.md) for the overall system
2. Configure Google OAuth using [Google OAuth Domain Setup](google-oauth-domain-setup.md)
3. For CLI tools, implement [CLI OAuth Authentication](CLI_OAUTH_AUTHENTICATION.md)

### Understanding the Architecture

- **Two Lambda Pattern**: See [Two-Lambda Authentication](two-lambda-authentication.md)
- **User Creation**: See [OAuth Auto-Provisioning](oauth-auto-provisioning.md)
- **Access Control**: See [Invite Code Implementation](INVITE_CODE_IMPLEMENTATION.md)

## 🔗 Related Documentation

- [Security Guide](../guides/security-and-secrets.md) - Security best practices
- [Deployment Security](../deployment/deployment-security.md) - Production security
- [GitHub Secrets](../security/GITHUB_SECRETS_GUIDE.md) - Managing OAuth secrets

## 💡 Common Tasks

### Add OAuth Provider

1. Update Lambda environment variables
2. Configure OAuth provider (Google, GitHub, etc.)
3. Update auto-provisioning logic
4. Test authentication flow

### Configure Invite Codes

1. Review [Invite Code Implementation](INVITE_CODE_IMPLEMENTATION.md)
2. Generate invite codes in database
3. Configure validation logic
4. Test registration flow

### Troubleshoot Auth Issues

- Check Lambda logs for authentication errors
- Verify OAuth callback URLs
- Confirm environment variables are set
- Test with different OAuth providers

---

[← Back to Documentation Hub](../README.md)
