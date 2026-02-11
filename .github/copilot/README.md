# GitHub Copilot Documentation

## 🚀 Quick Start

**New agents start here**: Load [`start-here.md`](start-here.md) (2.1 KB)

This ultra-compact file contains everything needed to begin work:

- 5-step workflow
- Essential commands
- Critical rules
- Pointers to task-specific guides

## 📂 Documentation Structure

### Entry Points (Choose Based on Context)

| Agent Type          | Start With                                                 | Size   | Contains                       |
| ------------------- | ---------------------------------------------------------- | ------ | ------------------------------ |
| **GitHub Copilot**  | [`../copilot-instructions.md`](../copilot-instructions.md) | 2.4 KB | Optimized for Copilot          |
| **Other AI Agents** | [`start-here.md`](start-here.md)                           | 2.1 KB | Ultra-compact essentials       |
| **Need Commands**   | [`quick-reference.md`](quick-reference.md)                 | 3.5 KB | All commands + troubleshooting |

### On-Demand Loading (Task-Specific)

#### Task Guides (1-2 KB each)

- [`tasks/start-ticket.md`](tasks/start-ticket.md) - Branch creation workflow
- [`tasks/fix-types.md`](tasks/fix-types.md) - TypeScript errors
- [`tasks/fix-lint.md`](tasks/fix-lint.md) - ESLint issues
- [`tasks/create-pr.md`](tasks/create-pr.md) - Pull requests
- [`tasks/troubleshoot.md`](tasks/troubleshoot.md) - Common problems

#### Architecture (2-3 KB)

- [`architecture-summary.md`](architecture-summary.md) - System overview
- For detailed architecture → [`../../docs/architecture/`](../../docs/architecture/)

#### Skills Library (2-17 KB each)

- [`skills/`](skills/) - 17 detailed guides for specific operations
- See [`skills/README.md`](skills/README.md) for full index

#### Structured Guidelines (CSV)

- [`../../docs/agents/`](../../docs/agents/) - Workflows, patterns, standards

## 📊 Loading Strategy

### Default (Start Every Session)

```
start-here.md (2.1 KB)
```

**When to load more**: If you need specific commands or encounter issues

### Add Commands Reference

```
start-here.md + quick-reference.md (5.6 KB total)
```

**When to load**: Complex workflows, troubleshooting, or unfamiliar commands

### Add Task-Specific Guide

```
start-here.md + tasks/<task>.md (4-5 KB total)
```

**When to load**: Working on specific task type (types, lint, PR, etc.)

### Add Architecture Context

```
start-here.md + architecture-summary.md (5 KB total)
```

**When to load**: Making architectural changes, understanding system design

### Full Context (Complex Work)

```
start-here.md + quick-reference.md + architecture + task guide (8-12 KB)
```

**When to load**: Major features, system changes, or multi-step work

## ⚡ Token Optimization

### Before Optimization

- Default context: ~13-16 KB
- High duplication between files
- All information loaded upfront

### After Optimization

- Default context: **2.1-3.5 KB** (75-85% reduction)
- Zero duplication
- Hierarchical loading (load more as needed)

See [`OPTIMIZATION_RESULTS.md`](OPTIMIZATION_RESULTS.md) for full analysis.

## 🎯 Decision Tree

```
New to project?
├─ Yes → Load start-here.md → Load full workflow guide
└─ No → What are you doing?
    ├─ Fixing types → start-here.md + tasks/fix-types.md
    ├─ Fixing lint → start-here.md + tasks/fix-lint.md
    ├─ Creating PR → start-here.md + tasks/create-pr.md
    ├─ Starting ticket → start-here.md + tasks/start-ticket.md
    ├─ Architecture work → start-here.md + architecture-summary.md
    ├─ Troubleshooting → start-here.md + quick-reference.md
    └─ Complex/unclear → Load quick-reference.md for overview
```

## ✅ Critical Information (In ALL Files)

Every entry point includes:

- 🚨 Never commit to main
- 📋 5-step workflow
- ⚡ Essential validation commands
- ✅ Critical rules (Always/Never)
- ⚙️ Environment context

## 🔄 Backward Compatibility

All existing documentation remains valid:

- Links unchanged
- File paths preserved
- Content reorganized, not removed
- Gradual adoption (agents can still use old flow)

## 📚 Full Documentation

For comprehensive documentation structure, see:

- Root: [`../../agents.md`](../../agents.md) - Main entry point (now optimized)
- Docs: [`../../docs/README.md`](../../docs/README.md) - Complete doc index
- Guides: [`../../docs/guides/`](../../docs/guides/) - Step-by-step guides
- Architecture: [`../../docs/architecture/`](../../docs/architecture/) - System design

---

**Token Efficiency**: Start with 2.1 KB, load more only when needed
