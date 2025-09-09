# GitHub Actions - Dependency Management

This repository provides reusable actions for managing NPM dependencies in GitHub workflows.

## Available Actions

### 1. `setup-npm` - Complete Node.js and NPM Setup

**Use when:** You need both Node.js setup and dependency installation.

```yaml
- name: Setup NPM
  uses: ./.github/workflows/setup-npm
  with:
    node-version: '20' # optional, defaults to '20'
    working-directory: '.' # optional, defaults to '.'
    skip-cache: 'false' # optional, defaults to 'false'
```

### 2. `install-dependencies` - Core Dependency Installation

**Use when:** You need maximum control over dependency installation with caching.

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'

- name: Install Dependencies
  uses: ./.github/workflows/install-dependencies
  with:
    cache-prefix: 'my-app' # optional
    working-directory: './my-app' # optional
    skip-cache: 'false' # optional
```

### 3. `install-npm-deps` - Dependencies Only

**Use when:** Node.js is already configured and you just need to install dependencies.

```yaml
- name: Install NPM Dependencies
  uses: ./.github/workflows/install-npm-deps
  with:
    working-directory: './packages/api' # optional
    skip-cache: 'false' # optional
```

## Usage Examples

### Monorepo with Multiple Package Directories

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@v4

  - name: Setup Node.js
    uses: actions/setup-node@v4
    with:
      node-version: '20'

  - name: Install Root Dependencies
    uses: ./.github/workflows/install-dependencies
    with:
      cache-prefix: 'root'

  - name: Install API Dependencies
    uses: ./.github/workflows/install-dependencies
    with:
      cache-prefix: 'api'
      working-directory: './packages/api'

  - name: Install Web Dependencies
    uses: ./.github/workflows/install-dependencies
    with:
      cache-prefix: 'web'
      working-directory: './packages/web'
```

### Simple Single Package Setup

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@v4

  - name: Setup NPM
    uses: ./.github/workflows/setup-npm
```

### Force Fresh Install (No Cache)

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@v4

  - name: Setup NPM (Fresh Install)
    uses: ./.github/workflows/setup-npm
    with:
      skip-cache: 'true'
```

## Features

- ✅ **Smart Caching**: Automatic dependency caching with fallback keys
- ✅ **Legacy Peer Deps**: Built-in support for React Native and legacy dependencies
- ✅ **Multi-directory**: Support for monorepos and multiple package directories
- ✅ **Verification**: Automatic verification of installation success
- ✅ **Detailed Logging**: Comprehensive logging for debugging
- ✅ **Flexible**: Use individual actions or combined setup as needed

## Outputs

All actions provide useful outputs:

```yaml
- name: Setup NPM
  id: npm-setup
  uses: ./.github/workflows/setup-npm

- name: Check if cache was used
  run: |
    echo "Cache hit: ${{ steps.npm-setup.outputs.cache-hit }}"
    echo "Node version: ${{ steps.npm-setup.outputs.node-version }}"
```

## Best Practices

1. **Use `setup-npm`** for most cases - it's the simplest and most common pattern
2. **Use `install-dependencies`** when you need custom Node.js setup or multiple dependency directories
3. **Use `install-npm-deps`** when Node.js is already configured by other actions
4. **Always specify `cache-prefix`** when installing dependencies in multiple directories
5. **Use `skip-cache: 'true'`** only when debugging dependency issues
