# Claude Skills for Legacy Sports

This directory contains focused, actionable skills for AI agents working on the Legacy Sports codebase. Each skill is a standalone guide optimized for Claude to understand specific workflows.

## 📚 Available Skills

### Core Development
- **[Branch Management](./branch-management.md)** - Creating, managing, and maintaining branch trees with twig
- **[Squash-Merge Workflow](./SQUASH-MERGE-WORKFLOW.md)** - Automated post-merge rebase after squashed PRs

### Coming Soon
- **Testing Strategy** - Running and writing tests in the Nx monorepo
- **Deployment Workflows** - Lambda deployment and infrastructure changes
- **Troubleshooting** - Debugging common issues and errors
- **GraphQL Development** - Working with resolvers and schema changes
- **Database Migrations** - Schema changes and data migrations

## 🎯 How to Use These Skills

### For AI Agents
1. Reference the specific skill file when working on related tasks
2. Follow the ✅ Do / ❌ Don't rules strictly
3. Use the Quick Reference section for common commands
4. Consult the Workflows section for step-by-step procedures

### For Developers
These skills serve as:
- Quick reference guides for specific workflows
- Onboarding material for new team members
- Documentation of established patterns and best practices

## 📝 Skill Structure

Each skill follows a consistent format:

```markdown
# Skill Name

## Role
What the agent should act as

## Context
Environment, tools, constraints

## Workflows
Step-by-step procedures

## Rules
✅ Do / ❌ Don't patterns

## Quick Reference
Commands, shortcuts, examples

## Common Pitfalls
Known issues and how to avoid them
```

## 🔄 Maintenance

When workflows change:
1. Update the relevant skill file
2. Test the new instructions with an AI agent
3. Document any edge cases discovered
4. Keep examples current with actual commands

## 📖 Relationship to Other Docs

- **`docs/guides/`** - Detailed human-readable guides
- **`docs/agents/`** - Legacy CSV-based agent instructions (may be deprecated)
- **`docs/architecture/`** - System design and architectural decisions
- **Skills** - Focused, action-oriented AI agent instructions

---

**Need a new skill?** Create it following the structure above and add it to this index.
