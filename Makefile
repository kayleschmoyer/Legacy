# Legacy Sports Makefile
# Cross-platform build and deployment automation for Nx monorepo

.PHONY: help install clean build test lint format fmt dev deploy infrastructure android ios
.DEFAULT_GOAL := help

# Platform detection and commands
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
	npm ci
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
	npm install
	@$(CHECK_POETRY)

install-tools: ## Install additional development tools (npkill, rimraf)
	@$(call echo_blue,Installing development tools...)
	npm install -g npkill rimraf

install-node: ## Install only Node.js dependencies
	@$(call echo_blue,Installing Node.js dependencies...)
	npm ci

install-python: ## Install only Python dependencies
	@$(call echo_blue,Installing Python dependencies...)
	poetry install --sync

setup: install ## Alias for install

setup-force: install-force ## Setup with force install for Windows file lock issues

# Cleaning
clean-safe: ## Safely clean build artifacts and cache
	@$(call echo_blue,Cleaning workspace safely...)
	npx nx reset
	@$(call echo_blue,Safe clean completed)

clean: ## Clean all build artifacts and dependencies (requires npkill)
	@$(call echo_blue,Cleaning workspace...)
	npm run clean:python $(NULL_REDIRECT) || echo Python clean skipped
	npx nx reset
	@$(call echo_yellow,Note: If npkill errors occur, run 'make install-tools' first)

clean-node: ## Clean Node.js dependencies
	@$(call echo_blue,Cleaning Node.js dependencies...)
	npm run clean:node $(NULL_REDIRECT) || $(call echo_yellow,npkill not found, install with 'make install-tools')

clean-python: ## Clean Python dependencies only
	@$(call echo_blue,Cleaning Python dependencies...)
	npm run clean:python $(NULL_REDIRECT) || echo Python clean skipped

clean-cache: ## Clear Nx cache
	@$(call echo_blue,Clearing Nx cache...)
	npx nx reset

# Code Quality
lint: ## Run linting on all projects
	@$(call echo_blue,Running linters...)
	npx nx run-many -t lint

lint-fix: ## Run linting with auto-fix on all projects
	@$(call echo_blue,Running linters with auto-fix...)
	npx nx run-many -t lint --fix

format: ## Format code across all projects
	@$(call echo_blue,Formatting code...)
	npx nx format:write

fmt: format ## Alias for format command

typecheck: ## Run TypeScript type checking
	@$(call echo_blue,Running type checking...)
	npx nx run-many -t typecheck

validate: ## Validate package.json and workspace dependencies
	@$(call echo_blue,Validating workspace...)
	npm run validate

# Testing
test: ## Run tests on changed files
	@$(call echo_blue,Running tests on changed files...)
	npx nx affected -t test

test-all: ## Run all tests
	@$(call echo_blue,Running all tests...)
	npx nx run-many -t test

test-watch: ## Run tests in watch mode
	@$(call echo_blue,Running tests in watch mode...)
	npx nx run-many -t test --watch

test-e2e: ## Run end-to-end tests
	@$(call echo_blue,Running e2e tests...)
	npx nx run-many -t e2e

# Building
build: ## Build all affected projects
	@$(call echo_blue,Building affected projects...)
	npx nx affected -t build

build-all: ## Build all projects
	@$(call echo_blue,Building all projects...)
	npx nx run-many -t build

build-web: ## Build web application
	@$(call echo_blue,Building web application...)
	npx nx build web

build-mobile: ## Build mobile application
	@$(call echo_blue,Building mobile application...)
	npx nx build app

build-lambdas: ## Build all lambda functions
	@$(call echo_blue,Building lambda functions...)
	npx nx run-many -t build --projects=db,game-selection,oauth-proxy,stats-lambda

build-libs: ## Build all libraries
	@$(call echo_blue,Building libraries...)
	npx nx run-many -t build --projects=api,shared-components,db-client,data-loaders,bref-client,scoring,utils,logging,env-utilities

# Development
dev: ## Start all development services
	@$(call echo_blue,Starting development services...)
	npm run dev:lambdas

dev-web: ## Start web development server
	@$(call echo_blue,Starting web development server...)
	npx nx serve web

dev-mobile: ## Start mobile development server
	@$(call echo_blue,Starting mobile development server...)
	npx nx start app

dev-db: ## Start database development server
	@$(call echo_blue,Starting database service...)
	npm run dev:db

dev-storybook: ## Start Storybook for component development
	@$(call echo_blue,Starting Storybook...)
	npm run storybook

graphiql: ## Start GraphQL explorer
	@$(call echo_blue,Starting GraphQL explorer...)
	npm run graphiql

# Mobile Development
android: ## Run Android application
	@$(call echo_blue,Running Android application...)
	npm run android

ios: ## Run iOS application  
	@$(call echo_blue,Running iOS application...)
	npm run ios

build-android: ## Build Android APK
	@$(call echo_blue,Building Android APK...)
	npm run build-android

build-ios: ## Build iOS application
	@$(call echo_blue,Building iOS application...)
	npm run build-ios

# Database Operations
db-migrate: ## Run database migrations
	@$(call echo_blue,Running database migrations...)
ifeq ($(DETECTED_OS),Windows)
	cd lib$(PATH_SEP)db-client && npm run db:migrate
else
	cd lib$(PATH_SEP)db-client && npm run db:migrate
endif

db-studio: ## Open database studio
	@$(call echo_blue,Opening database studio...)
	npx nx studio:public db-client

db-reset: ## Reset database
	@$(call echo_blue,Resetting database...)
	npx nx db:reset db-client

# Code Generation
codegen: ## Run code generation
	@$(call echo_blue,Running code generation...)
	npm run codegen

# Infrastructure and Deployment
deploy-lambdas: ## Deploy all lambda functions
	@$(call echo_blue,Deploying lambda functions...)
ifeq ($(DETECTED_OS),Windows)
	scripts$(PATH_SEP)deploy-lambda-all.ps1
else
	scripts$(PATH_SEP)deploy-lambda-all.sh
endif

deploy-infrastructure: ## Deploy infrastructure with Terraform
	@$(call echo_blue,Deploying infrastructure...)
ifeq ($(DETECTED_OS),Windows)
	cd terraform && deploy.ps1
else
	cd terraform && ./deploy.sh
endif

terraform-plan: ## Plan Terraform deployment
	@$(call echo_blue,Planning Terraform deployment...)
	cd terraform && terraform plan

terraform-apply: ## Apply Terraform changes
	@$(call echo_blue,Applying Terraform changes...)
	cd terraform && terraform apply

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
	npx nx graph

affected: ## Show affected projects
	@$(call echo_blue,Showing affected projects...)
	npx nx show projects --affected

list-projects: ## List all projects in workspace
	@$(call echo_blue,Listing all projects...)
	npx nx show projects

workspace-lint: ## Run workspace-level validations
	@$(call echo_blue,Running workspace validations...)
	node scripts$(PATH_SEP)validate-workspace-deps.js
	node scripts$(PATH_SEP)validate-package-json-standards.js

# Composite Commands
ci: clean-safe install lint typecheck test build ## Complete CI pipeline
	@$(call echo_green,CI pipeline completed successfully!)

ci-force: clean-safe install-force lint typecheck test build ## CI pipeline with force install (Windows file locks)
	@$(call echo_green,CI pipeline with force install completed successfully!)

ci-full: clean install lint typecheck test build ## Complete CI pipeline with full clean
	@$(call echo_green,Full CI pipeline completed successfully!)

pre-commit: lint-fix format typecheck ## Run pre-commit checks
	@$(call echo_green,Pre-commit checks completed!)

release: clean install build-all test-all ## Prepare for release
	@$(call echo_green,Release preparation completed!)

full-deploy: build-all deploy-lambdas deploy-infrastructure ## Complete deployment
	@$(call echo_green,Full deployment completed!)

# Development workflow shortcuts
quick-check: lint typecheck ## Quick code quality check
	@$(call echo_green,Quick checks completed!)

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
	@$(call echo_plain,NPM version:)
	@npm --version
	@$(call echo_plain,Nx version:)
	@npx nx --version
	@$(call echo_green,Diagnosis completed!)
