# Nx Background and Headless Tasks Guide

## Overview

Nx supports several types of background and persistent tasks that run continuously without blocking other operations.

## Task Types

### 1. Persistent Tasks

Tasks that run continuously and don't terminate:

```json
{
  "targets": {
    "dev": {
      "executor": "nx:run-commands",
      "options": {
        "command": "vite dev",
        "persistent": true
      }
    }
  }
}
```

### 2. Watch Tasks

File watching with automatic rebuilds:

```json
{
  "targets": {
    "watch": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --watch",
        "persistent": true
      }
    }
  }
}
```

### 3. Parallel Background Tasks

Multiple tasks running simultaneously:

```json
{
  "targets": {
    "dev:all": {
      "executor": "nx:run-commands",
      "options": {
        "commands": ["nx dev web", "nx start app", "nx watch api"],
        "parallel": true,
        "persistent": true
      }
    }
  }
}
```

## Common Patterns

### Development Workflow

```bash
# Start web dev server with library watching
nx dev:watch web

# Start multiple services in parallel
nx run-many --targets=dev --projects=web,app --parallel

# Watch and rebuild libraries automatically
nx watch --projects=lib/** -- nx build $NX_PROJECT_NAME
```

### Background Services

```json
{
  "services:start": {
    "executor": "nx:run-commands",
    "options": {
      "commands": ["docker-compose up -d", "nx dev api", "nx dev web"],
      "parallel": true,
      "persistent": true,
      "cache": false
    }
  }
}
```

### TypeScript Compilation

```json
{
  "build:watch": {
    "executor": "nx:run-commands",
    "options": {
      "command": "tsc --build --watch",
      "persistent": true
    }
  }
}
```

## Available Commands

### Your New Background Tasks:

```bash
# Web development with library watching
nx dev:watch web

# Full development setup
nx dev:full web

# Watch all libraries and rebuild on changes
nx watch --projects=lib/** -- nx build $NX_PROJECT_NAME

# Run multiple dev servers in parallel
nx run-many --targets=dev --projects=web,app --parallel
```

### Built-in Persistent Tasks:

- `nx dev web` - Web development server
- `nx start app` - React Native Metro server
- `nx storybook shared-components` - Storybook development

## Configuration Tips

1. **Always set `cache: false`** for development tasks
2. **Use `persistent: true`** for long-running processes
3. **Use `parallel: true`** to run multiple background tasks
4. **Disable caching** for tasks that need fresh state

## Example Usage

```bash
# Start development environment
nx dev:watch web

# In another terminal, work on features
nx generate component MyComponent --project=shared-components

# Libraries will automatically rebuild when you save files
# Web server will hot-reload with changes
```
