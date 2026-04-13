# Legacy Sports Makefile
# Cross-platform build and deployment automation for Nx monorepo

.PHONY: help install install-force refresh install-tools install-node install-python setup setup-force \
	clean clean-safe clean-cache clean-node clean-python force-clean reset \
	lint lint-fix lint-workflows lint-skills format fmt typecheck validate \
	test test-all test-watch test-e2e check-skipped-tests check-skipped-tests-verbose \
	build build-all build-web build-mobile build-lambdas build-libs \
	start dev dev-web dev-mobile dev-db dev-graphql dev-storybook graphiql docker-up \
	android ios build-android build-ios \
	db-migrate db-studio db-reset db-tunnel db-dump db-restore db-dump-dev db-restore-dev db-check-connections codegen \
	deploy-lambdas terraform-init terraform-plan terraform-apply terraform-apply-auto terraform-destroy gen-tfvars \
	runner-apply ami-build ami-list runner-secrets-rotate runner-lambdas-sync \
	sync-env check-services graph affected list-projects workspace-lint pr \
	ci ci-force ci-full release full-deploy full-check dev-setup \
	fix-windows-locks diagnose kill-stale \
	branch-tree cleanup-merged-branches clean-merged squash-branch rebase-tree rebase-tree-auto rebase-tree-skip resolve-conflicts \
	pre-commit pc quick-check format-commit \
	wt-setup \
	stabilize-after-rebase lint-review-patterns ci-classify-failure dev-env-health e2e-scope scaffold-story scan-secret
.DEFAULT_GOAL := help

# Platform detection and commands
WORKSPACE_PATH := $(abspath .)
ifeq ($(OS),Windows_NT)
	DETECTED_OS := Windows
	SHELL := cmd
	.SHELLFLAGS := /c
	RM_DIR := rmdir /s /q
	NULL_REDIRECT := >nul 2>&1
	KILL_NODE := taskkill /f /im node.exe $(NULL_REDIRECT) || echo No node processes
	KILL_ESBUILD := taskkill /f /im esbuild.exe $(NULL_REDIRECT) || echo No esbuild processes
	KILL_VSCODE := taskkill /f /im Code.exe $(NULL_REDIRECT) || echo VS Code not running
	CHECK_POETRY := where poetry $(NULL_REDIRECT) && poetry sync || echo Poetry not found, skipping
	PATH_SEP := \\
	WORKSPACE_PATH_WIN := $(subst /,\,$(WORKSPACE_PATH))
	KILL_WORKSPACE_PROCS := powershell -NoProfile -Command "$$workspace = '$(WORKSPACE_PATH_WIN)'; $$parent = Split-Path $$workspace -Parent; $$combinedPattern = '(' + [regex]::Escape($$workspace) + '|' + [regex]::Escape($$parent) + '\\LS-\d+' + '|' + [regex]::Escape($$workspace + '-worktrees') + ')'; $$currentPid = $$PID; $$currentProc = Get-CimInstance Win32_Process -Filter \"ProcessId = $$currentPid\"; $$parentPid = if ($$currentProc) { $$currentProc.ParentProcessId } else { $null }; $$procs = Get-CimInstance Win32_Process | Where-Object { $$_.CommandLine -and $$_.CommandLine -match $$combinedPattern -and $$_.ProcessId -ne $$currentPid -and $$_.ProcessId -ne $$parentPid }; if ($$procs) { $$procs | ForEach-Object { Write-Host ('Stopping {0} ({1})' -f $$_.Name, $$_.ProcessId); Stop-Process -Id $$_.ProcessId -Force } } else { Write-Host 'No workspace processes running'; }"
else
	DETECTED_OS := $(shell uname -s)
	SHELL := /bin/bash
	.SHELLFLAGS := -ec
	RM_DIR := rm -rf
	NULL_REDIRECT := >/dev/null 2>&1
	KILL_NODE := pkill -f node $(NULL_REDIRECT) || echo No node processes
	KILL_ESBUILD := pkill -f esbuild $(NULL_REDIRECT) || echo No esbuild processes
	KILL_VSCODE := pkill -f code $(NULL_REDIRECT) || echo VS Code not running
	CHECK_POETRY := command -v poetry $(NULL_REDIRECT) && poetry sync || echo Poetry not found, skipping
	PATH_SEP := /
	KILL_WORKSPACE_PROCS := workspace='$(WORKSPACE_PATH)'; pids=$$(pgrep -f "$$workspace" || true); if [ -n "$$pids" ]; then echo "Stopping workspace processes: $$pids"; kill $$pids || true; else echo "No workspace processes running"; fi
endif

# LS-102: Prevent console windows from spawning on Windows
# NODE_OPTIONS loads a monkey-patch that adds windowsHide: true to all
# child_process calls (spawn, fork, exec, etc.). Uses an absolute path
# so it works regardless of cwd when Nx forks task workers.
# NX_DAEMON=false disables the background daemon process, which uses
# detached: true + spawn() — a combination that can still flash a
# console window even with windowsHide. Caching still works without
# the daemon; only the persistent project-graph file watcher is lost.
ifeq ($(OS),Windows_NT)
    export NODE_OPTIONS := --require $(WORKSPACE_PATH)/scripts/patch-child-process.js
    export NX_DAEMON := false
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
ifeq ($(DETECTED_OS),Windows)
	@powershell -NoProfile -ExecutionPolicy Bypass -File "$(WORKSPACE_PATH_WIN)\scripts\pnpm-install-lock.ps1" -InstallArgs "--frozen-lockfile" $(if $(SKIP_SYMLINK_CHECK),-SkipSymlinkCheck)
else
	pnpm install --frozen-lockfile
endif
	@$(CHECK_POETRY)
	@$(MAKE) setup-hooks

refresh: ## Pull latest main and update shared node_modules (safe with symlinked worktrees)
	@$(call echo_blue,Refreshing main repo and shared node_modules...)
ifeq ($(DETECTED_OS),Windows)
	@powershell -NoProfile -Command "Get-ChildItem -Path '$(WORKSPACE_PATH_WIN)' -Directory -Filter 'node_modules_DELETE_ME_*' -EA SilentlyContinue | ForEach-Object { $$dir = $$_; try { Remove-Item $$dir.FullName -Recurse -Force -EA Stop; Write-Host ('  Cleaned up ' + $$dir.Name) -ForegroundColor Green } catch { Write-Host ('  Could not remove ' + $$dir.Name + ' (still locked)') -ForegroundColor Yellow } }"
else
	@find . -maxdepth 1 -name 'node_modules_DELETE_ME_*' -type d -exec rm -rf {} + 2>/dev/null && echo "  Cleaned up leftover node_modules_DELETE_ME_* directories" || true
endif
	@git pull origin main --ff-only
	@$(MAKE) install SKIP_SYMLINK_CHECK=1

install-force: ## Force install dependencies (handles Windows file locks)
	@$(call echo_blue,Force installing dependencies...)
ifeq ($(DETECTED_OS),Windows)
	@powershell -NoProfile -ExecutionPolicy Bypass -File "$(WORKSPACE_PATH_WIN)\scripts\pnpm-install-lock.ps1" -ForceClean -InstallArgs "--frozen-lockfile" $(if $(SKIP_SYMLINK_CHECK),-SkipSymlinkCheck)
else
	@$(call echo_yellow,Stopping potential background processes...)
	@$(KILL_NODE)
	@$(KILL_ESBUILD)
	@$(call echo_blue,Removing node_modules...)
	@$(RM_DIR) node_modules $(NULL_REDIRECT) || echo No node_modules to remove
	@$(call echo_blue,Installing fresh dependencies...)
	pnpm install --frozen-lockfile
endif
	@$(CHECK_POETRY)
	@$(MAKE) setup-hooks

install-tools: ## Install additional development tools (npkill, rimraf)
	@$(call echo_blue,Installing development tools...)
	pnpm add -g npkill rimraf
	@$(call echo_green,Development tools installed!)

install-node: ## Install only Node.js dependencies
	@$(call echo_blue,Installing Node.js dependencies...)
ifeq ($(DETECTED_OS),Windows)
	@powershell -NoProfile -ExecutionPolicy Bypass -File "$(WORKSPACE_PATH_WIN)\scripts\pnpm-install-lock.ps1" -InstallArgs "--frozen-lockfile"
else
	pnpm install --frozen-lockfile
endif
	@$(MAKE) setup-hooks

install-python: ## Install only Python dependencies
	@$(call echo_blue,Installing Python dependencies...)
	poetry sync

setup: install ## Alias for install

setup-force: install-force ## Setup with force install for Windows file lock issues

# NOTE: Target-specific SHELL overrides do NOT work in GNU Make 4.4.1 on
# Windows — the global SHELL=cmd always wins. We call powershell.exe
# explicitly so cmd.exe never tries to run the .ps1 directly (which would
# open it in Notepad via file association). -NonInteractive prevents any
# interactive prompts from PowerShell itself.
wt-setup: ## Set up a worktree (node_modules symlink, .env, .twig). Usage: make wt-setup WT=<path>
ifeq ($(DETECTED_OS),Windows)
	@powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "$(WORKSPACE_PATH_WIN)\scripts\setup-worktree.ps1" -WorktreePath "$(WT)"
	@cd "$(WT)" && $(MAKE) setup-hooks
else
	@echo "wt-setup is currently Windows-only. Run: make install && cp .env from main repo."
endif

setup-hooks: ## Install git hooks from .github/hooks/ into .git/hooks/
ifeq ($(DETECTED_OS),Windows)
	@powershell -NoProfile -Command "$$hooksDir = (git rev-parse --git-common-dir) + '/hooks'; if (-not (Test-Path $$hooksDir)) { New-Item -ItemType Directory -Path $$hooksDir -Force | Out-Null }; $$src = Get-ChildItem '.github/hooks' -File -ErrorAction SilentlyContinue; if (-not $$src) { exit 0 }; foreach ($$f in $$src) { Copy-Item $$f.FullName (Join-Path $$hooksDir $$f.Name) -Force; Write-Host ('  ✓ ' + $$f.Name + ' hook installed') -ForegroundColor Green }"
else
	@hooks_dir=$$(git rev-parse --git-common-dir)/hooks; mkdir -p "$$hooks_dir"; for f in .github/hooks/*; do [ -f "$$f" ] && cp "$$f" "$$hooks_dir/$$(basename $$f)" && chmod +x "$$hooks_dir/$$(basename $$f)" && echo "  ✓ $$(basename $$f) hook installed"; done
endif

# Cleaning
clean-safe: clean-cache ## Safely clean build artifacts and cache (alias for clean-cache)

clean: ## Clean all build artifacts and dependencies
ifeq ($(DETECTED_OS),Windows)
	@powershell -NoProfile -Command "$$nmPath = Join-Path '$(WORKSPACE_PATH_WIN)' 'node_modules'; $$nmEsc = [regex]::Escape($$nmPath); $$procs = Get-Process node -EA SilentlyContinue | Where-Object { try { ($$_.Modules | Where-Object { $$_.FileName -match ($$nmEsc + '.*\.node$$') }).Count -gt 0 } catch { $$false } }; if ($$procs) { Write-Host ''; Write-Host '  BLOCKED: node processes are holding native addon file locks' -ForegroundColor Red; $$procs | ForEach-Object { $$cmd = (Get-CimInstance Win32_Process -Filter ('ProcessId=' + $$_.Id)).CommandLine; Write-Host ('    PID {0}: {1}' -f $$_.Id, $$cmd) -ForegroundColor Yellow }; Write-Host ''; Write-Host '  Run  make kill-stale  to stop them, then retry  make clean' -ForegroundColor Cyan; Write-Host ''; exit 1 }; exit 0"
	@powershell -NoProfile -Command "$$nmPath = Join-Path '$(WORKSPACE_PATH_WIN)' 'node_modules'; $$nmItem = Get-Item $$nmPath -Force -EA SilentlyContinue; if ($$nmItem -and (($$nmItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { Write-Host ''; Write-Host '  BLOCKED: node_modules is a symlink' -ForegroundColor Red; Write-Host '  Running make clean here would unlink the symlink and break this worktree.' -ForegroundColor Yellow; Write-Host '  Run make clean in the main repo instead.' -ForegroundColor Cyan; Write-Host ''; exit 1 }; if (-not (Test-Path $$nmPath)) { exit 0 }; $$wtDirs = @(); try { $$wtDirs = @(git worktree list --porcelain 2>$$null | Select-String '^worktree ' | ForEach-Object { ($$_ -replace '^worktree ','').Trim() } | Where-Object { $$_ -ne '$(WORKSPACE_PATH_WIN)' }) } catch {}; $$symlinks = @(); foreach ($$wt in $$wtDirs) { $$wtNM = Join-Path $$wt 'node_modules'; $$wi = Get-Item $$wtNM -Force -EA SilentlyContinue; if ($$wi -and (($$wi.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { $$symlinks += $$wt } }; if ($$symlinks.Count -gt 0) { Write-Host ''; Write-Host '  WARNING: These worktrees symlink to this node_modules:' -ForegroundColor Yellow; $$symlinks | ForEach-Object { Write-Host ('    - ' + $$_) -ForegroundColor Yellow }; Write-Host '  make clean will break them. Run twig worktree clean first, or pass FORCE=1.' -ForegroundColor Yellow; Write-Host ''; if ('$(FORCE)' -ne '1' -and '$(SKIP_SYMLINK_CHECK)' -ne '1') { exit 1 } }"
endif
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
	@$(call echo_blue,Removing node_modules (symlink-safe)...)
	@powershell -NoProfile -ExecutionPolicy Bypass -Command "$$nmPath = 'node_modules'; if (-not (Test-Path $$nmPath)) { Write-Host 'No node_modules to remove'; return } $$item = Get-Item $$nmPath -Force; if (($$item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { cmd /c 'rmdir node_modules'; Write-Host 'node_modules symlink removed (target preserved)' } else { try { Remove-Item -Path $$nmPath -Recurse -Force -ErrorAction Stop; Write-Host 'node_modules removed' } catch { $$emptyDir = Join-Path $$env:TEMP ('empty_' + (Get-Random)); New-Item -ItemType Directory -Path $$emptyDir -Force | Out-Null; robocopy $$emptyDir $$nmPath /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null; Remove-Item -Path $$emptyDir -Force -ErrorAction SilentlyContinue; Remove-Item -Path $$nmPath -Recurse -Force -ErrorAction SilentlyContinue; Write-Host 'node_modules removed using robocopy' } }"
else
	@$(call echo_blue,Removing node_modules...)
	@$(RM_DIR) node_modules $(NULL_REDIRECT) || echo No node_modules to remove
endif
	@$(call echo_blue,Removing Nx cache directory...)
ifeq ($(DETECTED_OS),Windows)
	@if exist .nx $(RM_DIR) .nx $(NULL_REDIRECT) || echo No Nx cache to remove
else
	@$(RM_DIR) .nx $(NULL_REDIRECT) || echo No Nx cache to remove
endif
	@$(call echo_yellow,Note: If file lock errors occur during install, use 'make install-force')
	@$(call echo_green,Clean completed)

force-clean: ## Force clean node_modules with Windows file lock handling
	@$(call echo_blue,Force cleaning node_modules...)
ifeq ($(DETECTED_OS),Windows)
	@powershell -NoProfile -ExecutionPolicy Bypass -File "$(WORKSPACE_PATH)/scripts/force-clean-node-modules.ps1"
else
	@$(KILL_NODE)
	@$(KILL_ESBUILD)
	@$(RM_DIR) node_modules $(NULL_REDIRECT) || echo No node_modules to remove
	@$(RM_DIR) .nx $(NULL_REDIRECT) || echo No Nx cache to remove
endif
	@$(call echo_green,Force clean completed)

clean-node: ## Clean Node.js dependencies
	@$(call echo_blue,Cleaning Node.js dependencies...)
	pnpm run clean:node $(NULL_REDIRECT) || $(call echo_yellow,npkill not found, install with 'make install-tools')

clean-python: ## Clean Python dependencies only
	@$(call echo_blue,Cleaning Python dependencies...)
	pnpm run clean:python $(NULL_REDIRECT) || echo Python clean skipped

clean-cache: ## Clear Nx cache
	@$(call echo_blue,Clearing Nx cache...)
	pnpm exec nx reset

reset: clean-cache ## Reset Nx cache (alias for clean-cache)

# Code Quality
lint: ## Run linting on affected projects
	@$(call echo_blue,Running linters...)
	pnpm exec nx affected -t lint

lint-fix: ## Run linting with auto-fix on affected projects
	@$(call echo_blue,Running linters with auto-fix...)
	pnpm exec nx affected -t lint --fix

lint-workflows: ## Lint GitHub Actions workflow files
	@$(call echo_blue,Linting GitHub Actions workflows...)
	@node scripts/validate-workflows.js

lint-skills: ## Validate all agent skills conform to agentskills.io format
	@$(call echo_blue,Validating agent skills...)
	@node scripts/lint-skills.js

format: ## Format code across all projects
	@$(call echo_blue,Formatting code...)
	@pnpm exec nx format:write

fmt: format ## Alias for format command

format-commit: ## Run nx format:write, stage formatting changes, and commit as 'style: apply formatting'. Working tree must be clean first.
	@$(call echo_blue,Checking working tree is clean before formatting...)
ifeq ($(DETECTED_OS),Windows)
	@powershell -NoProfile -Command "$$status = git status --porcelain; if ($$status) { Write-Host 'ERROR: Working tree is not clean. Commit or stash changes before running make format-commit.' -ForegroundColor Red; exit 1 }"
else
	@status=$$(git status --porcelain); \
	if [ -n "$$status" ]; then \
		echo 'ERROR: Working tree is not clean. Commit or stash changes before running make format-commit.'; \
		exit 1; \
	fi
endif
	@$(call echo_blue,Applying formatting and committing...)
	@pnpm exec nx format:write
ifeq ($(DETECTED_OS),Windows)
	@powershell -NoProfile -Command "$$changed = git diff --name-only; if ($$changed) { git add -A; if ($$LASTEXITCODE -ne 0) { exit $$LASTEXITCODE }; git commit -m 'style: apply formatting'; if ($$LASTEXITCODE -ne 0) { exit $$LASTEXITCODE }; Write-Host '' ; Write-Host 'Formatting committed. Re-run make pc.' -ForegroundColor Green } else { Write-Host 'No formatting changes to commit.' -ForegroundColor Yellow }"
else
	@if ! git diff --quiet; then \
		git add -A && git commit -m 'style: apply formatting' && \
		echo '' && echo 'Formatting committed. Re-run make pc.'; \
	else \
		echo 'No formatting changes to commit.'; \
	fi
endif

typecheck: ## Run TypeScript type checking on affected projects
	@$(call echo_blue,Running type checking...)
	pnpm exec nx affected -t typecheck

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

check-skipped-tests: ## Check for skipped tests and report them
	@$(call echo_blue,Checking for skipped tests...)
ifeq ($(DETECTED_OS),Windows)
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-skipped-tests.ps1
else
	pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-skipped-tests.ps1
endif

check-skipped-tests-verbose: ## Check for skipped tests with detailed output
	@$(call echo_blue,Checking for skipped tests (verbose)...)
ifeq ($(DETECTED_OS),Windows)
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-skipped-tests.ps1 -ShowDetails
else
	pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-skipped-tests.ps1 -ShowDetails
endif

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

analyze: ## Build web app with bundle size visualization (opens treemap in browser)
	@$(call echo_blue,Building web with bundle analysis...)
ifeq ($(DETECTED_OS),Windows)
	set "ANALYZE=true" && pnpm exec nx build web
else
	ANALYZE=true pnpm exec nx build web
endif

build-mobile: ## Build mobile application
	@$(call echo_blue,Building mobile application...)
	pnpm exec nx build app

build-lambdas: ## Build all lambda functions
	@$(call echo_blue,Building lambda functions...)
	pnpm exec nx run-many -t build --projects=db,game-selection,oauth-proxy,stats-lambda

build-libs: ## Build all libraries
	@$(call echo_blue,Building libraries...)
	pnpm exec nx run-many -t build --projects=api,db-client,data-loaders,bref-client,scoring,utils,logging,env-utilities

# Development
start: ## Start the dev server
	@$(call echo_blue,Starting dev server...)
	pnpm start

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

dev-graphql: ## Start GraphQL service (alias for dev-db)
	@$(call echo_blue,Starting GraphQL service on http://localhost:5000/graphql...)
	pnpm exec nx run db:serve

dev-storybook: ## Start Storybook for component development
	@$(call echo_blue,Starting Storybook...)
	pnpm run storybook

graphiql: ## Start GraphQL explorer
	@$(call echo_blue,Starting GraphQL explorer...)
	pnpm run graphiql

docker-up: ## Start Docker Compose services in detached mode
	@$(call echo_blue,Starting Docker Compose services in detached mode...)
	docker compose up -d --build

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
	cd lib$(PATH_SEP)db-client && pnpm run db:migrate

db-studio: ## Open database studio
	@$(call echo_blue,Opening database studio...)
	pnpm exec nx studio:public db-client

db-reset: ## Reset database (WARNING: Drops all tables!)
	@$(call echo_blue,Resetting database...)
	cd lib$(PATH_SEP)db-client && pnpm run db:reset

db-tunnel: ## Open SSM port-forward tunnel: localhost:$${LOCAL_PORT:-5432} → RDS via SSM-managed target. Env: LOCAL_PORT, DB_TUNNEL_TARGET, DB_TUNNEL_HOST, DB_TUNNEL_TARGET_SSM_PARAMETER, DB_TUNNEL_HOST_SSM_PARAMETER
ifeq ($(DETECTED_OS),Windows)
	@echo "db-tunnel requires bash. Run in WSL, Git Bash, or a Linux environment."
else
	@LOCAL_PORT="$${LOCAL_PORT:-5432}"; \
	DB_TUNNEL_TARGET="$${DB_TUNNEL_TARGET:-}"; \
	DB_TUNNEL_HOST="$${DB_TUNNEL_HOST:-}"; \
	if [ -z "$$DB_TUNNEL_TARGET" ] && [ -n "$${DB_TUNNEL_TARGET_SSM_PARAMETER:-}" ]; then \
		DB_TUNNEL_TARGET="$$(aws ssm get-parameter --name "$$DB_TUNNEL_TARGET_SSM_PARAMETER" --query 'Parameter.Value' --output text)"; \
	fi; \
	if [ -z "$$DB_TUNNEL_HOST" ] && [ -n "$${DB_TUNNEL_HOST_SSM_PARAMETER:-}" ]; then \
		DB_TUNNEL_HOST="$$(aws ssm get-parameter --name "$$DB_TUNNEL_HOST_SSM_PARAMETER" --query 'Parameter.Value' --output text)"; \
	fi; \
	if [ -z "$$DB_TUNNEL_TARGET" ]; then \
		echo "Error: Missing SSM tunnel target. Set DB_TUNNEL_TARGET or DB_TUNNEL_TARGET_SSM_PARAMETER." >&2; \
		exit 1; \
	fi; \
	if [ -z "$$DB_TUNNEL_HOST" ]; then \
		echo "Error: Missing database host. Set DB_TUNNEL_HOST or DB_TUNNEL_HOST_SSM_PARAMETER." >&2; \
		exit 1; \
	fi; \
	echo "Opening SSM tunnel to RDS (localhost:$$LOCAL_PORT)..."; \
	echo "Connect with: DB_HOST=localhost:$$LOCAL_PORT"; \
	aws ssm start-session \
		--target "$$DB_TUNNEL_TARGET" \
		--document-name AWS-StartPortForwardingSessionToRemoteHost \
		--parameters "{\"host\":[\"$$DB_TUNNEL_HOST\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"$$LOCAL_PORT\"]}"
endif

db-dump: ## Dump RDS database to S3 (custom binary format, compressed)
	@$(call echo_blue,Dumping RDS database to S3...)
ifeq ($(DETECTED_OS),Windows)
	powershell -ExecutionPolicy Bypass -File scripts$(PATH_SEP)db-dump.ps1
else
	@echo "db-dump is Windows-only (PowerShell script). Run on Windows or adapt for bash."
endif

db-restore: ## Download latest S3 dump and restore into local Docker postgres
	@$(call echo_blue,Restoring database from S3 dump...)
ifeq ($(DETECTED_OS),Windows)
	powershell -ExecutionPolicy Bypass -File scripts$(PATH_SEP)db-restore.ps1
else
	@echo "db-restore is Windows-only (PowerShell script). Run on Windows or adapt for bash."
endif

db-dump-dev: ## Restore from S3, scrub PII, dump to resources/dev-seed.dump for repo (needs AWS)
	@$(call echo_blue,Creating scrubbed dev seed dump...)
ifeq ($(DETECTED_OS),Windows)
	powershell -ExecutionPolicy Bypass -File scripts$(PATH_SEP)db-dump-dev.ps1
else
	@echo "db-dump-dev is Windows-only (PowerShell script). Run on Windows or adapt for bash."
endif

db-restore-dev: ## Restore scrubbed dev seed from repo (no AWS needed - auto-pulls LFS)
	@$(call echo_blue,Restoring database from dev seed dump...)
ifeq ($(DETECTED_OS),Windows)
	powershell -ExecutionPolicy Bypass -File scripts$(PATH_SEP)db-restore-dev.ps1
else
	@echo "db-restore-dev is Windows-only (PowerShell script). Run on Windows or adapt for bash."
endif

db-check-connections: ## Check database connection pool status
	@$(call echo_blue,Checking database connection pool status...)
ifeq ($(DETECTED_OS),Windows)
	@powershell -NoProfile -Command "$$config = Get-Content .env -ErrorAction SilentlyContinue | Where-Object { $$_ -match '^DB_' }; if ($$config) { $$env:PGPASSWORD = ($$config | Where-Object { $$_ -match '^DB_PASSWORD=' }) -replace 'DB_PASSWORD=',''; $$host = ($$config | Where-Object { $$_ -match '^DB_HOST=' }) -replace 'DB_HOST=',''; $$user = ($$config | Where-Object { $$_ -match '^DB_USER=' }) -replace 'DB_USER=','postgres'; psql -h $$host -U $$user -d legacy_sports -c \"SELECT count(*) as total_connections, max_conn, max_conn - count(*) as available FROM pg_stat_activity, (SELECT setting::int as max_conn FROM pg_settings WHERE name='max_connections') mc GROUP BY max_conn;\" -c \"SELECT pid, usename, application_name, client_addr, state, query_start FROM pg_stat_activity WHERE datname='legacy_sports' ORDER BY query_start;\" } else { Write-Host 'Database configuration not found in .env file' -ForegroundColor Yellow }"
else
	@source .env 2>/dev/null && psql -h $$DB_HOST -U $$DB_USER -d legacy_sports -c "SELECT count(*) as total_connections, max_conn, max_conn - count(*) as available FROM pg_stat_activity, (SELECT setting::int as max_conn FROM pg_settings WHERE name='max_connections') mc GROUP BY max_conn;" -c "SELECT pid, usename, application_name, client_addr, state, query_start FROM pg_stat_activity WHERE datname='legacy_sports' ORDER BY query_start;" || echo "Database configuration not found or psql not installed"
endif


# Code Generation
codegen: ## Run code generation
	@$(call echo_blue,Running code generation...)
ifeq ($(DETECTED_OS),Windows)
	set "GRAPHQL_SCHEMA=$(WORKSPACE_PATH_WIN)\lambdas\db\schema.graphql" && pnpm run codegen
else
	GRAPHQL_SCHEMA=$(WORKSPACE_PATH)/lambdas/db/schema.graphql pnpm run codegen
endif

# Infrastructure and Deployment
deploy-lambdas: ## Deploy all lambda functions
	@$(call echo_blue,Deploying lambda functions...)
ifeq ($(DETECTED_OS),Windows)
	powershell -ExecutionPolicy Bypass -File scripts$(PATH_SEP)deploy-lambda-all.ps1
else
	scripts$(PATH_SEP)deploy-lambda-all.sh
endif

# deploy-infrastructure target was removed in LS-2425. The terraform/deploy.ps1
# and terraform/deploy.sh scripts it invoked were obsolete bootstrap scripts that
# pre-dated `make terraform-apply`. Use `make terraform-apply` (Lambda app) and
# `make runner-apply` (runner fleet) instead.

gen-tfvars: ## Generate terraform/main/secrets.auto.tfvars from env vars (safe to re-run)
	@$(call echo_blue,Generating terraform/main/secrets.auto.tfvars...)
	node scripts/gen-tfvars.js
	@$(call echo_green,Done — terraform/main/secrets.auto.tfvars updated)

# Lambda app infrastructure (terraform/main/) — used by the regular
# Apply Lambda Infrastructure workflow. Does NOT touch runner resources;
# the runner fleet lives in terraform/runners/ as of LS-2425.

terraform-init: ## Initialize Terraform working directory (terraform/main/)
	@$(call echo_blue,Initializing Terraform [main]...)
	terraform -chdir=terraform/main init

terraform-plan: ## Plan Terraform deployment (terraform/main/)
	@$(call echo_blue,Planning Terraform deployment [main]...)
	terraform -chdir=terraform/main plan

terraform-apply: ## Apply Terraform changes (terraform/main/, with confirmation)
	@$(call echo_blue,Applying Terraform changes [main]...)
	@$(call echo_yellow,This will apply changes to AWS infrastructure!)
	terraform -chdir=terraform/main apply

terraform-apply-auto: ## Apply Terraform changes (terraform/main/, auto-approve, use with caution)
	@$(call echo_blue,Auto-applying Terraform changes [main]...)
	@$(call echo_red,WARNING: Auto-approving Terraform changes!)
	terraform -chdir=terraform/main apply -auto-approve

terraform-destroy: ## Destroy Terraform infrastructure (terraform/main/)
	@$(call echo_yellow,Destroying Terraform infrastructure [main]...)
	terraform -chdir=terraform/main destroy

runner-apply: ## Apply runner infrastructure (terraform/runners/). Pass NO_CONFIRM=1 to skip the interactive confirmation.
	@$(call echo_blue,Applying self-hosted runner infrastructure...)
	@$(call echo_yellow,Runner state lives in terraform/runners/ as of LS-2425.)
	@$(call echo_yellow,Ensure github_app_id / github_app_key_base64 / github_app_webhook_secret are in terraform/runners/secrets.auto.tfvars.)
	terraform -chdir=terraform/runners init -input=false
	terraform -chdir=terraform/runners plan -out=runner.plan
	@$(if $(filter 1,$(NO_CONFIRM)),$(call echo_yellow,Skipping confirmation (NO_CONFIRM=1)),$(call echo_blue,Review the plan above. Press Enter to apply or Ctrl+C to abort.))
	@$(if $(filter 1,$(NO_CONFIRM)),,$(if $(filter Windows_NT,$(OS)),powershell -Command "Read-Host | Out-Null",read _confirm))
	terraform -chdir=terraform/runners apply runner.plan

runner-init: ## Initialize Terraform working directory (terraform/runners/)
	@$(call echo_blue,Initializing Terraform [runners]...)
	terraform -chdir=terraform/runners init

runner-plan: ## Plan runner Terraform deployment (terraform/runners/)
	@$(call echo_blue,Planning runner Terraform deployment [runners]...)
	terraform -chdir=terraform/runners plan

# Self-Hosted Runner AMI (see .agents/skills/infrastructure/references/ami-build.md)
ifeq ($(strip $(VPC_ID)),)
ami-build:
	$(error VPC_ID is required. Usage: make ami-build VPC_ID=vpc-xxx SUBNET_ID=subnet-xxx)
else ifeq ($(strip $(SUBNET_ID)),)
ami-build:
	$(error SUBNET_ID is required. Usage: make ami-build VPC_ID=vpc-xxx SUBNET_ID=subnet-xxx)
else
ami-build: ## Build self-hosted runner AMI with Packer (requires VPC_ID and SUBNET_ID)
	@$(call echo_blue,Building self-hosted runner AMI...)
	@$(call echo_yellow,This will create a new EC2 AMI. Typical build time: 5-10 minutes.)
ifeq ($(DETECTED_OS),Windows)
# Use bash -lc (login shell) so ~/.bash_profile / ~/bin are sourced.
# Without -l, make on Windows hands the recipe to cmd.exe and packer is not
# found; without the login flag, bash -c skips profile init files so ~/bin/packer
# (installed via Git Bash) is still missing from PATH.
	bash -lc "cd terraform/runners/packer && packer init runner-ami.pkr.hcl && packer build -var 'vpc_id=$(VPC_ID)' -var 'subnet_id=$(SUBNET_ID)' runner-ami.pkr.hcl"
else
	cd terraform/runners/packer && packer init runner-ami.pkr.hcl && packer build -var "vpc_id=$(VPC_ID)" -var "subnet_id=$(SUBNET_ID)" runner-ami.pkr.hcl
endif
endif

ami-list: ## List existing runner AMIs (most recent first)
	@$(call echo_blue,Listing runner AMIs...)
	aws ec2 describe-images --owners self --filters "Name=name,Values=legacy-sports-runner-*" --query "Images | sort_by(@, &CreationDate) | reverse(@) | [*].{Name:Name,ImageId:ImageId,Created:CreationDate}" --output table

runner-secrets-rotate: ## Rotate GitHub App webhook secret and walk through private key rotation. Usage: make runner-secrets-rotate [ENVIRONMENT=prod] [DRY_RUN=1]
	@$(call echo_blue,Rotating runner GitHub App credentials...)
ifeq ($(DETECTED_OS),Windows)
	@powershell -NoProfile -ExecutionPolicy Bypass -Command "$$env:ENVIRONMENT = '$(or $(ENVIRONMENT),prod)'; $$env:DRY_RUN = '$(DRY_RUN)'; bash scripts$(PATH_SEP)rotate-runner-secrets.sh"
else
	ENVIRONMENT=$(or $(ENVIRONMENT),prod) DRY_RUN=$(DRY_RUN) bash scripts$(PATH_SEP)rotate-runner-secrets.sh
endif

runner-lambdas-sync: ## Download Lambda zips matching the github-aws-runners version in terraform/runners/github-runners.tf. Usage: make runner-lambdas-sync [VERSION=x.y.z]
	@$(call echo_blue,Syncing runner Lambda zips...)
	node scripts$(PATH_SEP)download-runner-lambdas.js $(VERSION)

# Environment Management
sync-env: ## Sync environment variables
	@$(call echo_blue,Syncing environment variables...)
ifeq ($(DETECTED_OS),Windows)
	powershell -ExecutionPolicy Bypass -File scripts$(PATH_SEP)sync-env.ps1
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

jira-rollover-sync: ## Sync Jira bucket epic project properties (ARGS=--sync|--fix|--rollover)
	pnpm exec tsx scripts/jira-rollover-sync.ts $(ARGS)

sync-worktrees: ## Regenerate .code-workspace with active worktrees (TICKETS=501,493 to select specific ones)
	@$(call echo_blue,Syncing worktree workspace file...)
ifeq ($(DETECTED_OS),Windows)
ifdef TICKETS
	powershell -ExecutionPolicy Bypass -File scripts$(PATH_SEP)sync-worktrees.ps1 -Include $(TICKETS)
else
	powershell -ExecutionPolicy Bypass -File scripts$(PATH_SEP)sync-worktrees.ps1
endif
else
	@echo "sync-worktrees is Windows-only (PowerShell required)"
endif

sync-worktrees-add: ## Add worktree(s) to existing workspace (TICKET=507 or TICKETS=507,508)
ifeq ($(DETECTED_OS),Windows)
ifdef TICKET
	powershell -ExecutionPolicy Bypass -File scripts$(PATH_SEP)sync-worktrees.ps1 -Add $(TICKET)
else ifdef TICKETS
	powershell -ExecutionPolicy Bypass -File scripts$(PATH_SEP)sync-worktrees.ps1 -Add $(TICKETS)
else
	@echo "Usage: make sync-worktrees-add TICKET=507"
endif
else
	@echo "sync-worktrees-add is Windows-only (PowerShell required)"
endif

sync-worktrees-remove: ## Remove worktree(s) from existing workspace (TICKET=493 or TICKETS=493,498)
ifeq ($(DETECTED_OS),Windows)
ifdef TICKET
	powershell -ExecutionPolicy Bypass -File scripts$(PATH_SEP)sync-worktrees.ps1 -Remove $(TICKET)
else ifdef TICKETS
	powershell -ExecutionPolicy Bypass -File scripts$(PATH_SEP)sync-worktrees.ps1 -Remove $(TICKETS)
else
	@echo "Usage: make sync-worktrees-remove TICKET=493"
endif
else
	@echo "sync-worktrees-remove is Windows-only (PowerShell required)"
endif

worktree: ## Create a worktree and auto-add to workspace (TICKET=507 DESC=fix-scoring [PARENT=main])
ifeq ($(DETECTED_OS),Windows)
ifdef TICKET
	powershell -ExecutionPolicy Bypass -File scripts$(PATH_SEP)worktree-create.ps1 -TicketKey LS-$(TICKET) -Desc $(or $(DESC),work) -Parent $(or $(PARENT),main)
else
	@echo "Usage: make worktree TICKET=507 DESC=fix-scoring"
	@echo "       make worktree TICKET=508 DESC=matchup-refresh PARENT=LS-507/fix-scoring"
endif
else
	@echo "worktree target is Windows-only"
endif

# Composite Commands
ci: clean-safe install lint typecheck test build ## Complete CI pipeline
	@$(call echo_green,CI pipeline completed successfully!)

ci-force: clean-safe install-force lint typecheck test build ## CI pipeline with force install (Windows file locks)
	@$(call echo_green,CI pipeline with force install completed successfully!)

ci-full: clean install lint typecheck test build ## Complete CI pipeline with full clean
	@$(call echo_green,Full CI pipeline completed successfully!)

release: clean install build-all test-all ## Prepare for release
	@$(call echo_green,Release preparation completed!)

full-deploy: clean install build-all deploy-lambdas terraform-apply ## Complete deployment (Lambda app infra + Lambda code)
	@$(call echo_green,Full deployment completed!)

# Development workflow shortcuts
full-check: lint typecheck test ## Comprehensive code quality check
	@$(call echo_green,Full checks completed!)

dev-setup: install db-migrate ## Setup development environment
	@$(call echo_green,Development environment setup completed!)

# Troubleshooting
kill-stale: ## Find and stop node processes holding native addon locks under node_modules
ifeq ($(DETECTED_OS),Windows)
	@powershell -NoProfile -ExecutionPolicy Bypass -Command "& '$(WORKSPACE_PATH_WIN)\scripts\kill-stale-locks.ps1' -WorkspaceRoot '$(WORKSPACE_PATH_WIN)' $(if $(filter 1,$(DRYRUN)),-DryRun)"
else
	@echo "kill-stale is Windows-only (native addon file locks are a Windows issue)"
endif

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
branch-tree: ## Show current branch tree structure
	@twig tree

cleanup-merged-branches: ## List merged remote branches (use DELETE=1 to remove them)
	@$(call echo_blue,Checking for merged remote branches...)
ifeq ($(DETECTED_OS),Windows)
ifdef DELETE
	@powershell -ExecutionPolicy Bypass -File ".\scripts\cleanup-merged-branches.ps1" -Delete
else
	@powershell -ExecutionPolicy Bypass -File ".\scripts\cleanup-merged-branches.ps1"
endif
else
ifdef DELETE
	@./scripts/cleanup-merged-branches.sh --delete
else
	@./scripts/cleanup-merged-branches.sh
endif
endif

clean-merged: ## Clean up worktrees whose PRs have been merged (use DRYRUN=1 for dry run)
	@$(call echo_blue,Scanning for worktrees with merged PRs...)
ifeq ($(DETECTED_OS),Windows)
ifeq ($(DRYRUN),1)
	@powershell -ExecutionPolicy Bypass -File ".\scripts\clean-merged-worktrees.ps1" -DryRun
else
	@powershell -ExecutionPolicy Bypass -File ".\scripts\clean-merged-worktrees.ps1"
endif
else
ifeq ($(DRYRUN),1)
	@./scripts/clean-merged-worktrees.sh --dry-run
else
	@./scripts/clean-merged-worktrees.sh
endif
endif

squash-branch: ## Squash all commits on current branch from parent (optional: MESSAGE="commit message")
	@$(call echo_blue,Squashing branch commits...)
ifeq ($(DETECTED_OS),Windows)
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
ifeq ($(DETECTED_OS),Windows)
	@powershell -ExecutionPolicy Bypass -File ".\scripts\rebase-branch-tree.ps1"
else
	@./scripts/rebase-branch-tree.sh
endif

rebase-tree-auto: ## Rebase branch tree with auto-continue (no prompts)
	@$(call echo_blue,Auto-rebasing branch tree...)
ifeq ($(DETECTED_OS),Windows)
	@powershell -ExecutionPolicy Bypass -File ".\scripts\rebase-branch-tree.ps1" -AutoContinue
else
	@./scripts/rebase-branch-tree.sh --auto-continue
endif

rebase-tree-skip: ## Rebase branch tree skipping commits (SKIP_COMMITS=hash1,hash2 or SKIP_COMMITS_FILE=path)
	@$(call echo_blue,Rebasing branch tree with skip-commits...)
ifeq ($(DETECTED_OS),Windows)
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
ifeq ($(DETECTED_OS),Windows)
	@powershell -ExecutionPolicy Bypass -File ".\scripts\resolve-generated-conflicts.ps1"
else
	@./scripts/resolve-generated-conflicts.sh
endif

# Codegen command varies by platform (needs env var for schema path)
ifeq ($(DETECTED_OS),Windows)
_PC_CODEGEN_CMD = set "GRAPHQL_SCHEMA=$(WORKSPACE_PATH_WIN)\lambdas\db\schema.graphql" && pnpm exec nx affected -t codegen --base=main
else
_PC_CODEGEN_CMD = GRAPHQL_SCHEMA=$(WORKSPACE_PATH)/lambdas/db/schema.graphql pnpm exec nx affected -t codegen --base=main
endif

pre-commit: _PC_FLAGS := $(shell node scripts/classify-changes.js)
pre-commit: ## Run all pre-commit validation checks
	@$(call echo_blue,Running pre-commit validation...)
	@$(call echo_plain,Classifying changed files...)
	@node scripts/classify-changes.js --print-summary
	$(if $(findstring PC_HAS_DB=1,$(_PC_FLAGS)),@$(call echo_plain,1/9 Migration immutability check...) && node scripts/check-migration-immutability.js --branch,@$(call echo_yellow,1/9 Migration immutability check... SKIPPED (no db changes)))
	$(if $(findstring PC_HAS_DB=1,$(_PC_FLAGS)),@$(call echo_plain,2/9 Schema generation...) && pnpm exec nx run db:print-schema,@$(call echo_yellow,2/9 Schema generation... SKIPPED (no db changes)))
	$(if $(findstring PC_HAS_DB=1,$(_PC_FLAGS)),@$(call echo_plain,3/9 Code generation...) && $(_PC_CODEGEN_CMD),@$(call echo_yellow,3/9 Code generation... SKIPPED (no db changes)))
	$(if $(findstring PC_DOCS_ONLY=0,$(_PC_FLAGS)),@$(call echo_plain,4/9 Type checking...) && pnpm exec nx affected -t typecheck --base=main,@$(call echo_yellow,4/9 Type checking... SKIPPED (docs-only changes)))
	@$(call echo_plain,5/9 Formatting...)
ifeq ($(DETECTED_OS),Windows)
	@powershell -NoProfile -Command "$$preState = @(git status --porcelain -uno); pnpm exec nx format:write; if ($$LASTEXITCODE -ne 0) { exit $$LASTEXITCODE }; $$changed = @(git status --porcelain -uno); $$newChanges = @(); foreach ($$line in $$changed) { if (-not ($$preState -contains $$line)) { $$newChanges += $$line } }; if ($$newChanges.Count -eq 0) { $$diffFiles = @(git diff --name-only); if ($$diffFiles.Count -gt 0) { $$newChanges = $$diffFiles | ForEach-Object { '?? ' + $$_ } } }; if ($$newChanges.Count -gt 0) { if ($$preState.Count -gt 0) { Write-Host ''; Write-Host 'ERROR: Formatting rewrote the following files:' -ForegroundColor Red; $$newChanges | ForEach-Object { Write-Host ('  ' + $$_.Substring(3)) -ForegroundColor Yellow }; Write-Host ''; Write-Host 'You have other uncommitted changes alongside the format fixes. Commit or stash them first, then re-run make pc.' -ForegroundColor Red; exit 1 } else { Write-Host '  Formatting changed files; auto-amending last commit...' -ForegroundColor Yellow; git add -A; git commit --amend --no-edit; Write-Host '  ✓ Format fixes folded into previous commit.' -ForegroundColor Green } }"
else
	@pre_state=$$(git status --porcelain -uno); \
	pnpm exec nx format:write; \
	post_state=$$(git status --porcelain -uno); \
	changed=$$(comm -13 <(echo "$$pre_state" | sort) <(echo "$$post_state" | sort)); \
	if [ -z "$$changed" ]; then \
		diff_files=$$(git diff --name-only); \
		if [ -n "$$diff_files" ]; then changed="$$diff_files"; fi; \
	fi; \
	if [ -n "$$changed" ]; then \
		if [ -n "$$pre_state" ]; then \
			echo ""; \
			echo "ERROR: Formatting rewrote the following files:"; \
			echo "$$changed" | sed 's/^.../  /'; \
			echo ""; \
			echo "You have other uncommitted changes alongside the format fixes. Commit or stash them first, then re-run make pc."; \
			exit 1; \
		else \
			echo "  Formatting changed files; auto-amending last commit..."; \
			git add -A; \
			git commit --amend --no-edit; \
			echo "  ✓ Format fixes folded into previous commit."; \
		fi; \
	fi
endif
	$(if $(findstring PC_DOCS_ONLY=0,$(_PC_FLAGS)),@$(call echo_plain,6/9 Linting...) && pnpm exec nx affected -t lint --fix --base=main,@$(call echo_yellow,6/9 Linting... SKIPPED (docs-only changes)))
	$(if $(findstring PC_HAS_WORKFLOWS=1,$(_PC_FLAGS)),@$(call echo_plain,7/9 Workflow validation...) && node scripts/validate-workflows.js,@$(call echo_yellow,7/9 Workflow validation... SKIPPED (no workflow changes)))
	$(if $(findstring PC_DOCS_ONLY=0,$(_PC_FLAGS)),@$(call echo_plain,8/9 Testing...) && pnpm exec nx affected -t test --base=main,@$(call echo_yellow,8/9 Testing... SKIPPED (docs-only changes)))
	$(if $(findstring PC_DOCS_ONLY=0,$(_PC_FLAGS)),@$(call echo_plain,9/9 Building...) && pnpm exec nx affected -t build --base=main,@$(call echo_yellow,9/9 Building... SKIPPED (docs-only changes)))
	@$(call echo_green,✓ All pre-commit checks passed!)

pc: pre-commit ## Alias for pre-commit

quick-check: ## Quick validation (typecheck + lint only)
	@$(call echo_blue,Running quick checks...)
	@pnpm exec nx affected -t typecheck --base=main
	@pnpm exec nx affected -t lint --fix --base=main
	@$(call echo_green,✓ Quick checks passed!)

# Agent workflow automation scripts
stabilize-after-rebase: ## Post-rebase stabilization (install → schema → codegen → pc)
	@node scripts/stabilize-after-rebase.js

lint-review-patterns: ## Run mechanical self-review checks against git diff
	@node scripts/lint-review-patterns.js

ci-classify-failure: ## Classify CI failure from log text. Usage: make ci-classify-failure LOG="error text"
	@node scripts/ci-classify-failure.js --log="$(LOG)"

dev-env-health: ## Check dev environment prerequisites
	@node scripts/dev-env-health-check.js

e2e-scope: ## Detect E2E test scope from changed files
	@node scripts/e2e-pre-commit.js

scaffold-story: ## Generate a story file for a component. Usage: make scaffold-story COMPONENT=path/to/Component.tsx
	@node scripts/scaffold-story.js $(COMPONENT)

scan-secret: ## Scan all locations for a secret/env var. Usage: make scan-secret VAR=MY_SECRET
	@node scripts/secret-location-scanner.js $(VAR)
