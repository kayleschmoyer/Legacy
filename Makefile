# Legacy Sports Makefile
# Cross-platform build and deployment automation for Nx monorepo

.PHONY: help install clean build test lint format fmt dev deploy infrastructure android ios pr terraform-init terraform-plan terraform-apply terraform-apply-auto terraform-destroy deploy-infrastructure deploy-lambdas pc pre-commit reset
.DEFAULT_GOAL := help

# Platform detection and commands
WORKSPACE_PATH := $(abspath .)
ifeq ($(OS),Windows_NT)
	DETECTED_OS := Windows
	SHELL := cmd
	.SHELLFLAGS := /c
	RM_DIR := rmdir /s /q
	RM_FILE := del /f /q
	NULL_REDIRECT := >nul 2>&1
	KILL_NODE := taskkill /f /im node.exe $(NULL_REDIRECT) || echo No node processes
	KILL_ESBUILD := taskkill /f /im esbuild.exe $(NULL_REDIRECT) || echo No esbuild processes
	KILL_VSCODE := taskkill /f /im Code.exe $(NULL_REDIRECT) || echo VS Code not running
	CHECK_POETRY := where poetry $(NULL_REDIRECT) && poetry install --sync || echo Poetry not found, skipping
	PATH_SEP := \\
	WORKSPACE_PATH_WIN := $(subst /,\,$(WORKSPACE_PATH))
	KILL_WORKSPACE_PROCS := powershell -NoProfile -Command "$$workspace = '$(WORKSPACE_PATH_WIN)'; $$escaped = [regex]::Escape($$workspace); $$currentPid = $$PID; $$currentProc = Get-CimInstance Win32_Process -Filter \"ProcessId = $$currentPid\"; $$parentPid = if ($$currentProc) { $$currentProc.ParentProcessId } else { $null }; $$procs = Get-CimInstance Win32_Process | Where-Object { $$_.CommandLine -and $$_.CommandLine -match $$escaped -and $$_.ProcessId -ne $$currentPid -and $$_.ProcessId -ne $$parentPid }; if ($$procs) { $$procs | ForEach-Object { Write-Host ('Stopping {0} ({1})' -f $$_.Name, $$_.ProcessId); Stop-Process -Id $$_.ProcessId -Force } } else { Write-Host 'No workspace processes running'; }"
else
	DETECTED_OS := $(shell uname -s)
	SHELL := /bin/bash
	.SHELLFLAGS := -ec
	RM_DIR := rm -rf
	RM_FILE := rm -f
	NULL_REDIRECT := >/dev/null 2>&1
	KILL_NODE := pkill -f node $(NULL_REDIRECT) || echo No node processes
	KILL_ESBUILD := pkill -f esbuild $(NULL_REDIRECT) || echo No esbuild processes
	KILL_VSCODE := pkill -f code $(NULL_REDIRECT) || echo VS Code not running
	CHECK_POETRY := command -v poetry $(NULL_REDIRECT) && poetry install --sync || echo Poetry not found, skipping
	PATH_SEP := /
	KILL_WORKSPACE_PROCS := workspace='$(WORKSPACE_PATH)'; self=$$BASHPID; parent=$$PPID; pids=$$(pgrep -f "$$workspace" | grep -v -E "^($$self|$$parent)$$" || true); if [ -n "$$pids" ]; then echo "Stopping workspace processes: $$pids"; kill $$pids || true; else echo "No workspace processes running"; fi
endif

# Cross-platform echo with colors
define echo_blue
	$(if $(filter Windows,$(DETECTED_OS)),powershell -Command "Write-Host '$(1)' -ForegroundColor Cyan",echo -e "\033[36m$(1)\033[0m")
endef

define echo_green
	$(if $(filter Windows,$(DETECTED_OS)),powershell -Command "Write-Host '$(1)' -ForegroundColor Green",echo -e "\033[32m$(1)\033[0m")
endef

define echo_yellow
	$(if $(filter Windows,$(DETECTED_OS)),powershell -Command "Write-Host '$(1)' -ForegroundColor Yellow",echo -e "\033[33m$(1)\033[0m")
endef

define echo_red
	$(if $(filter Windows,$(DETECTED_OS)),powershell -Command "Write-Host '$(1)' -ForegroundColor Red",echo -e "\033[31m$(1)\033[0m")
endef

define echo_plain
	$(if $(filter Windows,$(DETECTED_OS)),powershell -Command "Write-Host '$(1)'",echo "$(1)")
endef

# Help target - displays available commands
help: ## Show this help message
	@$(call echo_blue,Legacy Sports - Available Commands ($(DETECTED_OS)))
	@$(call echo_blue,================================================)
ifeq ($(DETECTED_OS),Windows)
	@powershell -Command "Get-Content $(MAKEFILE_LIST) | Select-String '.*:.*##.*' | ForEach-Object { $$line = $$_.Line; $$parts = $$line -split ':.*?## '; if ($$parts.Length -eq 2) { Write-Host ('{0,-20} {1}' -f $$parts[0].Trim(), $$parts[1].Trim()) -ForegroundColor Green } } | Sort-Object"
else
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[32m%-20s\033[0m %s\n", $$1, $$2}'
endif

# Installation and Setup
install: ## Install all dependencies (Node.js and Python)
	@$(call echo_blue,Installing dependencies...)
	pnpm install --frozen-lockfile
	@$(CHECK_POETRY)

install-force: ## Force install dependencies (handles Windows file locks)
	@$(call echo_blue,Force installing dependencies...)
	@$(call echo_yellow,Stopping potential background processes...)
	@$(KILL_NODE)
	@$(KILL_ESBUILD)
	@$(call echo_blue,Removing node_modules and package-lock...)
	@$(RM_DIR) node_modules $(NULL_REDIRECT) || echo No node_modules to remove
	@$(RM_FILE) package-lock.json $(NULL_REDIRECT) || echo No package-lock to remove
	@$(call echo_blue,Installing fresh dependencies...)
	pnpm install
	@$(CHECK_POETRY)

install-tools: ## Install additional development tools (npkill, rimraf)
	@$(call echo_blue,Installing development tools...)
	pnpm add -g npkill rimraf

install-node: ## Install only Node.js dependencies
	@$(call echo_blue,Installing Node.js dependencies...)
	pnpm install --frozen-lockfile

install-python: ## Install only Python dependencies
	@$(call echo_blue,Installing Python dependencies...)
	poetry install --sync

setup: install ## Alias for install

setup-force: install-force ## Setup with force install for Windows file lock issues

# Cleaning
clean-safe: ## Safely clean build artifacts and cache
	@$(call echo_blue,Cleaning workspace safely...)
	pnpm exec nx reset
	@$(call echo_blue,Safe clean completed)

clean: ## Clean all build artifacts and dependencies
	@$(call echo_blue,Cleaning workspace...)
	pnpm run clean:python $(NULL_REDIRECT) || echo Python clean skipped
	@$(call echo_blue,Clearing Nx cache...)
	pnpm exec nx reset $(NULL_REDIRECT) || echo Nx reset skipped
	@$(call echo_blue,Stopping Nx daemon if running...)
ifeq ($(DETECTED_OS),Windows)
	@powershell -Command "$$job = Start-Job { pnpm exec nx daemon --stop }; Wait-Job $$job -Timeout 5; Stop-Job $$job -ErrorAction SilentlyContinue; Remove-Job $$job -ErrorAction SilentlyContinue" $(NULL_REDIRECT) || echo Daemon stop timed out or not running
else
	@timeout 5 pnpm exec nx daemon --stop $(NULL_REDIRECT) || echo Daemon stop timed out or not running
endif
	@$(call echo_blue,Stopping workspace-affiliated processes...)
	@$(KILL_WORKSPACE_PROCS)
ifeq ($(DETECTED_OS),Windows)
	@$(call echo_blue,Waiting for file handles to release...)
	@powershell -Command "Start-Sleep -Seconds 3"
endif
	@$(call echo_blue,Removing node_modules...)
	@$(RM_DIR) node_modules $(NULL_REDIRECT) || echo No node_modules to remove
	@$(call echo_blue,Removing Nx cache directory...)
ifeq ($(DETECTED_OS),Windows)
	@if exist .nx $(RM_DIR) .nx $(NULL_REDIRECT) || echo No Nx cache to remove
else
	@$(RM_DIR) .nx $(NULL_REDIRECT) || echo No Nx cache to remove
endif
	@$(call echo_yellow,Note: If file lock errors occur during install, use 'make install-force')
	@$(call echo_green,Clean completed)

clean-node: ## Clean Node.js dependencies
	@$(call echo_blue,Cleaning Node.js dependencies...)
	pnpm run clean:node $(NULL_REDIRECT) || $(call echo_yellow,npkill not found, install with 'make install-tools')

clean-python: ## Clean Python dependencies only
	@$(call echo_blue,Cleaning Python dependencies...)
	pnpm run clean:python $(NULL_REDIRECT) || echo Python clean skipped

clean-cache: ## Clear Nx cache
	@$(call echo_blue,Clearing Nx cache...)
	pnpm exec nx reset

reset: ## Reset Nx cache (alias for clean-cache)
	@$(call echo_blue,Resetting Nx cache...)
	pnpm exec nx reset

# Code Quality
lint: ## Run linting on all projects
	@$(call echo_blue,Running linters...)
	pnpm exec nx run-many -t lint

lint-fix: ## Run linting with auto-fix on all projects
	@$(call echo_blue,Running linters with auto-fix...)
	pnpm exec nx run-many -t lint --fix

format: ## Format code across all projects
	@$(call echo_blue,Formatting code...)
	pnpm exec nx format:write

fmt: format ## Alias for format command

typecheck: ## Run TypeScript type checking
	@$(call echo_blue,Running type checking...)
	pnpm exec nx run-many -t typecheck

validate: ## Validate package.json and workspace dependencies
	@$(call echo_blue,Validating workspace...)
	pnpm run validate

# Testing
test: ## Run tests on changed files
	@$(call echo_blue,Running tests on changed files...)
	pnpm exec nx affected -t test

test-all: ## Run all tests
	@$(call echo_blue,Running all tests...)
	pnpm exec nx run-many -t test

test-watch: ## Run tests in watch mode
	@$(call echo_blue,Running tests in watch mode...)
	pnpm exec nx run-many -t test --watch

test-e2e: ## Run end-to-end tests
	@$(call echo_blue,Running e2e tests...)
	pnpm exec nx run-many -t e2e

# Building
build: ## Build all affected projects
	@$(call echo_blue,Building affected projects...)
	pnpm exec nx affected -t build

build-all: ## Build all projects
	@$(call echo_blue,Building all projects...)
	pnpm exec nx run-many -t build

build-web: ## Build web application
	@$(call echo_blue,Building web application...)
	pnpm exec nx build web

build-mobile: ## Build mobile application
	@$(call echo_blue,Building mobile application...)
	pnpm exec nx build app

build-lambdas: ## Build all lambda functions
	@$(call echo_blue,Building lambda functions...)
	pnpm exec nx run-many -t build --projects=db,game-selection,oauth-proxy,stats-lambda

build-libs: ## Build all libraries
	@$(call echo_blue,Building libraries...)
	pnpm exec nx run-many -t build --projects=api,shared-components,db-client,data-loaders,bref-client,scoring,utils,logging,env-utilities

# Development
dev: ## Start all development services
	@$(call echo_blue,Starting development services...)
	pnpm run dev:lambdas

dev-web: ## Start web development server
	@$(call echo_blue,Starting web development server...)
	pnpm exec nx serve web

dev-mobile: ## Start mobile development server
	@$(call echo_blue,Starting mobile development server...)
	pnpm exec nx start app

dev-db: ## Start database development server
	@$(call echo_blue,Starting database service...)
	pnpm run dev:db

dev-storybook: ## Start Storybook for component development
	@$(call echo_blue,Starting Storybook...)
	pnpm run storybook

graphiql: ## Start GraphQL explorer
	@$(call echo_blue,Starting GraphQL explorer...)
	pnpm run graphiql

# Mobile Development
android: ## Run Android application
	@$(call echo_blue,Running Android application...)
	pnpm run android

ios: ## Run iOS application  
	@$(call echo_blue,Running iOS application...)
	pnpm run ios

build-android: ## Build Android APK
	@$(call echo_blue,Building Android APK...)
	pnpm run build-android

build-ios: ## Build iOS application
	@$(call echo_blue,Building iOS application...)
	pnpm run build-ios

# Database Operations
db-migrate: ## Run database migrations
	@$(call echo_blue,Running database migrations...)
ifeq ($(DETECTED_OS),Windows)
	cd lib$(PATH_SEP)db-client && pnpm run db:migrate
else
	cd lib$(PATH_SEP)db-client && pnpm run db:migrate
endif

db-studio: ## Open database studio
	@$(call echo_blue,Opening database studio...)
	pnpm exec nx studio:public db-client

db-reset: ## Reset database (WARNING: Drops all tables!)
	@$(call echo_blue,Resetting database...)
ifeq ($(DETECTED_OS),Windows)
	cd lib$(PATH_SEP)db-client && pnpm run db:reset
else
	cd lib$(PATH_SEP)db-client && pnpm run db:reset
endif

# Code Generation
codegen: ## Run code generation
	@$(call echo_blue,Running code generation...)
	pnpm run codegen

# Infrastructure and Deployment
deploy-lambdas: ## Deploy all lambda functions
	@$(call echo_blue,Deploying lambda functions...)
ifeq ($(DETECTED_OS),Windows)
	powershell -ExecutionPolicy Bypass -File scripts$(PATH_SEP)deploy-lambda-all.ps1
else
	scripts$(PATH_SEP)deploy-lambda-all.sh
endif

deploy-infrastructure: ## Deploy infrastructure with Terraform
	@$(call echo_blue,Deploying infrastructure...)
ifeq ($(DETECTED_OS),Windows)
	cd terraform && powershell -ExecutionPolicy Bypass -File deploy.ps1
else
	cd terraform && ./deploy.sh
endif

terraform-init: ## Initialize Terraform working directory
	@$(call echo_blue,Initializing Terraform...)
	cd terraform && terraform init

terraform-plan: ## Plan Terraform deployment
	@$(call echo_blue,Planning Terraform deployment...)
	cd terraform && terraform plan

terraform-apply: ## Apply Terraform changes (with confirmation)
	@$(call echo_blue,Applying Terraform changes...)
	@$(call echo_yellow,This will apply changes to AWS infrastructure!)
	cd terraform && terraform apply

terraform-apply-auto: ## Apply Terraform changes (auto-approve, use with caution)
	@$(call echo_blue,Auto-applying Terraform changes...)
	@$(call echo_red,WARNING: Auto-approving Terraform changes!)
	cd terraform && terraform apply -auto-approve

terraform-destroy: ## Destroy Terraform infrastructure
	@$(call echo_yellow,Destroying Terraform infrastructure...)
	cd terraform && terraform destroy

# Environment Management
sync-env: ## Sync environment variables
	@$(call echo_blue,Syncing environment variables...)
ifeq ($(DETECTED_OS),Windows)
	scripts$(PATH_SEP)sync-env.ps1
else
	scripts$(PATH_SEP)sync-env.sh
endif

check-services: ## Check service health
	@$(call echo_blue,Checking service health...)
	node scripts$(PATH_SEP)check-services.js

# Utilities
graph: ## Show Nx project dependency graph
	@$(call echo_blue,Opening Nx project graph...)
	pnpm exec nx graph

affected: ## Show affected projects
	@$(call echo_blue,Showing affected projects...)
	pnpm exec nx show projects --affected

list-projects: ## List all projects in workspace
	@$(call echo_blue,Listing all projects...)
	pnpm exec nx show projects

workspace-lint: ## Run workspace-level validations
	@$(call echo_blue,Running workspace validations...)
	node scripts$(PATH_SEP)validate-workspace-deps.js
	node scripts$(PATH_SEP)validate-package-json-standards.js

pr: ## Create a GitHub pull request using twig
	@$(call echo_blue,Creating GitHub pull request...)
	twig github pr create

# Composite Commands
ci: clean-safe install lint typecheck test build ## Complete CI pipeline
	@$(call echo_green,CI pipeline completed successfully!)

ci-force: clean-safe install-force lint typecheck test build ## CI pipeline with force install (Windows file locks)
	@$(call echo_green,CI pipeline with force install completed successfully!)

ci-full: clean install lint typecheck test build ## Complete CI pipeline with full clean
	@$(call echo_green,Full CI pipeline completed successfully!)

release: clean install build-all test-all ## Prepare for release
	@$(call echo_green,Release preparation completed!)

full-deploy: clean install build-all deploy-lambdas deploy-infrastructure ## Complete deployment
	@$(call echo_green,Full deployment completed!)

# Development workflow shortcuts
full-check: lint typecheck test ## Comprehensive code quality check
	@$(call echo_green,Full checks completed!)

dev-setup: install db-migrate ## Setup development environment
	@$(call echo_green,Development environment setup completed!)

# Troubleshooting
fix-windows-locks: ## Fix Windows file permission issues
	@$(call echo_blue,Fixing Windows file locks...)
	@$(call echo_yellow,Closing editors and stopping processes...)
	@$(KILL_VSCODE)
	@$(KILL_NODE)
	@$(KILL_ESBUILD)
	@$(call echo_green,You can now try 'make install-force' or 'make ci-force')

diagnose: ## Diagnose common issues
	@$(call echo_blue,Diagnosing workspace...)
	@$(call echo_plain,Platform: $(DETECTED_OS))
	@$(call echo_plain,Node.js version:)
	@node --version
	@$(call echo_plain,PNPM version:)
	@pnpm --version
	@$(call echo_plain,NPM version (optional):)
	@npm --version || echo "npm not installed"
	@$(call echo_plain,Nx version:)
	@pnpm exec nx --version
	@$(call echo_green,Diagnosis completed!)

# Branch management helpers
.PHONY: branch-tree rebase-tree rebase-tree-auto rebase-tree-skip resolve-conflicts squash-branch pre-commit

branch-tree: ## Show current branch tree structure
	@twig tree

squash-branch: ## Squash all commits on current branch from parent (optional: MESSAGE="commit message")
	@$(call echo_blue,Squashing branch commits...)
ifeq ($(OS),Windows_NT)
ifdef MESSAGE
	@powershell -ExecutionPolicy Bypass -File ".\scripts\squash-branch.ps1" -Message "$(MESSAGE)"
else
	@powershell -ExecutionPolicy Bypass -File ".\scripts\squash-branch.ps1"
endif
else
	@./scripts/squash-branch.sh $(if $(MESSAGE),-m "$(MESSAGE)",)
endif

rebase-tree: ## Rebase entire branch tree with auto-conflict resolution
	@$(call echo_blue,Rebasing branch tree...)
ifeq ($(OS),Windows_NT)
	@powershell -ExecutionPolicy Bypass -File ".\scripts\rebase-branch-tree.ps1"
else
	@./scripts/rebase-branch-tree.sh
endif

rebase-tree-auto: ## Rebase branch tree with auto-continue (no prompts)
	@$(call echo_blue,Auto-rebasing branch tree...)
ifeq ($(OS),Windows_NT)
	@powershell -ExecutionPolicy Bypass -File ".\scripts\rebase-branch-tree.ps1" -AutoContinue
else
	@./scripts/rebase-branch-tree.sh --auto-continue
endif

rebase-tree-skip: ## Rebase branch tree skipping commits (SKIP_COMMITS=hash1,hash2 or SKIP_COMMITS_FILE=path)
	@$(call echo_blue,Rebasing branch tree with skip-commits...)
ifeq ($(OS),Windows_NT)
ifdef SKIP_COMMITS
	@powershell -ExecutionPolicy Bypass -File ".\scripts\rebase-branch-tree.ps1" -SkipCommits "$(SKIP_COMMITS)"
else ifdef SKIP_COMMITS_FILE
	@powershell -ExecutionPolicy Bypass -File ".\scripts\rebase-branch-tree.ps1" -SkipCommitsFile "$(SKIP_COMMITS_FILE)"
else
	@$(call echo_red,Error: Must provide either SKIP_COMMITS or SKIP_COMMITS_FILE)
	@exit 1
endif
else
	@./scripts/rebase-branch-tree.sh $(if $(SKIP_COMMITS),--skip-commits $(SKIP_COMMITS),) $(if $(SKIP_COMMITS_FILE),--skip-commits-file $(SKIP_COMMITS_FILE),)
endif

resolve-conflicts: ## Resolve conflicts in generated files
	@$(call echo_blue,Resolving conflicts in generated files...)
ifeq ($(OS),Windows_NT)
	@powershell -ExecutionPolicy Bypass -File ".\scripts\resolve-generated-conflicts.ps1"
else
	@./scripts/resolve-generated-conflicts.sh
endif

pre-commit: ## Run all pre-commit validation checks
	@$(call echo_blue,Running pre-commit validation...)
	@$(call echo_plain,1/5 Type checking...)
	@pnpm exec nx affected -t typecheck --base=main
	@$(call echo_plain,2/5 Formatting...)
	@pnpm exec nx format:write
	@$(call echo_plain,3/5 Linting...)
	@pnpm exec nx affected -t lint --fix --base=main
	@$(call echo_plain,4/5 Testing...)
	@pnpm exec nx affected -t test --base=main
	@$(call echo_plain,5/5 Building...)
	@pnpm exec nx affected -t build --base=main
	@$(call echo_green,✓ All pre-commit checks passed!)

pc: pre-commit ## Alias for pre-commit

quick-check: ## Quick validation (typecheck + lint only)
	@$(call echo_blue,Running quick checks...)
	@pnpm exec nx affected -t typecheck --base=main
	@pnpm exec nx affected -t lint --fix --base=main
	@$(call echo_green,✓ Quick checks passed!)
