# Getting Started Guides

This directory contains step-by-step guides for setting up and working with the Legacy Sports platform. Start here if you're new to the project.

## 📑 Contents

### Essential Setup

- **[Development Setup](development-setup.md)** - Complete development environment configuration
- **[Authentication Guide](authentication-guide.md)** - OAuth and user management
- **[Security & Secrets](security-and-secrets.md)** - Security best practices and secrets management

### Workflow & Contribution

- **[AI Agent Contribution Workflow](ai-agent-contribution-workflow.md)** - Complete contribution process for AI agents
- **[Agent Commands](agent-commands.md)** - AI assistant commands reference

### Reference

- **[Troubleshooting](troubleshooting.md)** - Common issues and solutions
- **[Baseball-Reference Scraping](baseball-reference-scraping.md)** - Data scraping patterns and troubleshooting
- **[Debugging with Database Timestamps](debugging-with-database-timestamps.md)** - Correlating logs with DB events
- **[WebSocket Notifications](websocket-notifications.md)** - Real-time notification system
- **[Branch Tree Management](branch-tree-management.md)** - Twig tree management for clean dependent branches

## 🎯 Quick Start for New Developers

### Day 1: Environment Setup

1. **[Development Setup](development-setup.md)** - Set up your dev environment
   - Install Node.js, pnpm, and dependencies
   - Configure database connection
   - Set up AWS CLI (if needed)
   - Install mobile development tools (optional)

### Day 2: Understanding Authentication

2. **[Authentication Guide](authentication-guide.md)** - Learn the auth system
   - OAuth 2.0 flow
   - User provisioning
   - Token management
   - CLI authentication

### Day 3: Security & Best Practices

3. **[Security & Secrets](security-and-secrets.md)** - Secure development practices
   - Managing secrets locally
   - Environment variables
   - GitHub secrets
   - AWS credentials

### Ongoing: Troubleshooting

4. **[Troubleshooting](troubleshooting.md)** - Reference when you hit issues
   - Common build errors
   - Database connection issues
   - Authentication problems
   - CI/CD failures

## 🔗 Related Documentation

### Next Steps After Setup

- [Architecture Documentation](../architecture/) - Understand system design
- [Cross-Platform System](../architecture/cross-platform-system.md) - Learn about shared code
- [Database Schema](../architecture/database-schema.md) - Understand data models
- [Build System](../architecture/build-system.md) - Learn about Nx monorepo

### Advanced Topics

- [CI/CD System](../ci-cd/) - Continuous integration and deployment
- [Deployment](../deployment/) - AWS infrastructure and deployment
- [Authentication Details](../authentication/) - Deep dive into OAuth
- [Build & Tooling](../build-and-tooling/) - Nx Cloud and build optimization

## 💡 Common Scenarios

### "I'm starting fresh on this project"

1. Follow [Development Setup](development-setup.md) completely
2. Read [Authentication Guide](authentication-guide.md)
3. Review [Cross-Platform System](../architecture/cross-platform-system.md)
4. Keep [Troubleshooting](troubleshooting.md) handy

### "I need to work on authentication features"

1. Review [Authentication Guide](authentication-guide.md)
2. Explore [Authentication Documentation](../authentication/)
3. Check [Security & Secrets](security-and-secrets.md)
4. Test with CLI per [CLI OAuth Authentication](../authentication/CLI_OAUTH_AUTHENTICATION.md)

### "Something isn't working"

1. Check [Troubleshooting](troubleshooting.md) first
2. Review recent changes in your area
3. Check CI/CD logs in [CI Troubleshooting](../ci-cd/ci-troubleshooting-guide.md)
4. Ask for help with context from error messages

### "I need to deploy something"

1. Understand infrastructure in [AWS Infrastructure](../deployment/aws-infrastructure.md)
2. Follow [Lambda Build Strategy](../deployment/lambda-build-strategy.md) for Lambdas
3. Use [Terraform](../deployment/terraform/) for infrastructure changes
4. Check [Deployment Security](../deployment/deployment-security.md)

## 🤖 Using AI Assistance

### For AI Agents Working on This Project

The **[AI Agent Contribution Workflow](ai-agent-contribution-workflow.md)** provides a complete step-by-step guide for:

- Planning work with Jira tickets (using acli)
- Creating branches with twig
- Implementing changes in the Nx monorepo
- Running pre-commit validations
- Creating pull requests

### For Developers Using AI Assistants

The **[Agent Commands](agent-commands.md)** guide contains structured commands for working with AI assistants like GitHub Copilot.

For more detailed AI instructions, see the [agents/](../agents/) directory with CSV-formatted guidelines.

## 📞 Getting Help

- **Setup Issues**: Follow [Development Setup](development-setup.md) step-by-step
- **Build Errors**: Check [Troubleshooting](troubleshooting.md)
- **Auth Problems**: Review [Authentication Guide](authentication-guide.md)
- **Security Questions**: Consult [Security & Secrets](security-and-secrets.md)
- **Deployment Issues**: See [Deployment Documentation](../deployment/)

---

[← Back to Documentation Hub](../README.md)
