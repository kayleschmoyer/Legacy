# Legacy Sports Makefile
# Cross-platform build and deployment automation for Nx monorepo

.PHONY: help install clean build test lint format dev deploy infrastructure android ios
.DEFAULT_GOAL := help

# Colors for output
BLUE := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
RESET := \033[0m

# Platform detection and commands
ifeq ($(OS),Windows_NT)
	DETECTED_OS := Windows
	SHELL := cmd
	.SHELLFLAGS := /c
	ECHO_CMD := echo
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
	ECHO_CMD := echo -e
	RM_DIR := rm -rf
	RM_FILE := rm -f
	NULL_REDIRECT := >/dev/null 2>&1
	KILL_NODE := pkill -f node $(NULL_REDIRECT) || echo No node processes
	KILL_ESBUILD := pkill -f esbuild $(NULL_REDIRECT) || echo No esbuild processes
	KILL_VSCODE := pkill -f code $(NULL_REDIRECT) || echo VS Code not running
	CHECK_POETRY := command -v poetry $(NULL_REDIRECT) && poetry install --sync || echo Poetry not found, skipping
	PATH_SEP := /
endif

# Help target - displays available commands
help: ## Show this help message
	@$(ECHO_CMD) "$(BLUE)Legacy Sports - Available Commands ($(DETECTED_OS))$(RESET)"
	@$(ECHO_CMD) "$(BLUE)================================================$(RESET)"
ifeq ($(DETECTED_OS),Windows)
	@powershell -Command "Get-Content $(MAKEFILE_LIST) | Select-String '.*:.*##.*' | ForEach-Object { $$line = $$_.Line; $$parts = $$line -split ':.*?## '; if ($$parts.Length -eq 2) { Write-Host ('$(GREEN){0,-20}$(RESET) {1}' -f $$parts[0].Trim(), $$parts[1].Trim()) } } | Sort-Object"
else
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
endif

# Installation and Setup
install: ## Install all dependencies (Node.js and Python)
	@$(ECHO_CMD) "$(BLUE)Installing dependencies...$(RESET)"
	npm ci
	@$(CHECK_POETRY)

install-force: ## Force install dependencies (handles Windows file locks)
	@$(ECHO_CMD) "$(BLUE)Force installing dependencies...$(RESET)"
	@$(ECHO_CMD) "$(YELLOW)Stopping potential background processes...$(RESET)"
	@$(KILL_NODE)
	@$(KILL_ESBUILD)
	@$(ECHO_CMD) "$(BLUE)Removing node_modules and package-lock...$(RESET)"
	@$(RM_DIR) node_modules $(NULL_REDIRECT) || echo No node_modules to remove
	@$(RM_FILE) package-lock.json $(NULL_REDIRECT) || echo No package-lock to remove
	@$(ECHO_CMD) "$(BLUE)Installing fresh dependencies...$(RESET)"
	npm install
	@$(CHECK_POETRY)

install-tools: ## Install additional development tools (npkill, rimraf)
	@$(ECHO_CMD) "$(BLUE)Installing development tools...$(RESET)"
	npm install -g npkill rimraf

install-node: ## Install only Node.js dependencies
	@$(ECHO_CMD) "$(BLUE)Installing Node.js dependencies...$(RESET)"
	npm ci

install-python: ## Install only Python dependencies
	@$(ECHO_CMD) "$(BLUE)Installing Python dependencies...$(RESET)"
	poetry install --sync

setup: install ## Alias for install

setup-force: install-force ## Setup with force install for Windows file lock issues

# Cleaning
clean-safe: ## Safely clean build artifacts and cache
	@$(ECHO_CMD) "$(BLUE)Cleaning workspace safely...$(RESET)"
	npx nx reset
	@$(ECHO_CMD) "$(BLUE)Safe clean completed$(RESET)"

clean: ## Clean all build artifacts and dependencies (requires npkill)
	@$(ECHO_CMD) "$(BLUE)Cleaning workspace...$(RESET)"
	npm run clean:python $(NULL_REDIRECT) || echo Python clean skipped
	npx nx reset
	@$(ECHO_CMD) "$(YELLOW)Note: If npkill errors occur, run 'make install-tools' first$(RESET)"

clean-node: ## Clean Node.js dependencies
	@$(ECHO_CMD) "$(BLUE)Cleaning Node.js dependencies...$(RESET)"
	npm run clean:node $(NULL_REDIRECT) || $(ECHO_CMD) "$(YELLOW)npkill not found, install with 'make install-tools'$(RESET)"

clean-python: ## Clean Python dependencies only
	@$(ECHO_CMD) "$(BLUE)Cleaning Python dependencies...$(RESET)"
	npm run clean:python $(NULL_REDIRECT) || echo Python clean skipped

clean-cache: ## Clear Nx cache
	@$(ECHO_CMD) "$(BLUE)Clearing Nx cache...$(RESET)"
	npx nx reset

# Code Quality
lint: ## Run linting on all projects
	@$(ECHO_CMD) "$(BLUE)Running linters...$(RESET)"
	npx nx run-many -t lint

lint-fix: ## Run linting with auto-fix on all projects
	@$(ECHO_CMD) "$(BLUE)Running linters with auto-fix...$(RESET)"
	npx nx run-many -t lint --fix

format: ## Format code across all projects
	@$(ECHO_CMD) "$(BLUE)Formatting code...$(RESET)"
	npx nx format:write

typecheck: ## Run TypeScript type checking
	@$(ECHO_CMD) "$(BLUE)Running type checking...$(RESET)"
	npx nx run-many -t typecheck

validate: ## Validate package.json and workspace dependencies
	@$(ECHO_CMD) "$(BLUE)Validating workspace...$(RESET)"
	npm run validate

# Testing
test: ## Run tests on changed files
	@$(ECHO_CMD) "$(BLUE)Running tests on changed files...$(RESET)"
	npx nx affected -t test

test-all: ## Run all tests
	@$(ECHO_CMD) "$(BLUE)Running all tests...$(RESET)"
	npx nx run-many -t test

test-watch: ## Run tests in watch mode
	@$(ECHO_CMD) "$(BLUE)Running tests in watch mode...$(RESET)"
	npx nx run-many -t test --watch

test-e2e: ## Run end-to-end tests
	@$(ECHO_CMD) "$(BLUE)Running e2e tests...$(RESET)"
	npx nx run-many -t e2e

# Building
build: ## Build all affected projects
	@$(ECHO_CMD) "$(BLUE)Building affected projects...$(RESET)"
	npx nx affected -t build

build-all: ## Build all projects
	@$(ECHO_CMD) "$(BLUE)Building all projects...$(RESET)"
	npx nx run-many -t build

build-web: ## Build web application
	@$(ECHO_CMD) "$(BLUE)Building web application...$(RESET)"
	npx nx build web

build-mobile: ## Build mobile application
	@$(ECHO_CMD) "$(BLUE)Building mobile application...$(RESET)"
	npx nx build app

build-lambdas: ## Build all lambda functions
	@$(ECHO_CMD) "$(BLUE)Building lambda functions...$(RESET)"
	npx nx run-many -t build --projects=db,game-selection,oauth-proxy,stats-lambda

build-libs: ## Build all libraries
	@$(ECHO_CMD) "$(BLUE)Building libraries...$(RESET)"
	npx nx run-many -t build --projects=api,shared-components,db-client,data-loaders,bref-client,scoring,utils,logging,env-utilities

# Development
dev: ## Start all development services
	@$(ECHO_CMD) "$(BLUE)Starting development services...$(RESET)"
	npm run dev:lambdas

dev-web: ## Start web development server
	@$(ECHO_CMD) "$(BLUE)Starting web development server...$(RESET)"
	npx nx serve web

dev-mobile: ## Start mobile development server
	@$(ECHO_CMD) "$(BLUE)Starting mobile development server...$(RESET)"
	npx nx start app

dev-db: ## Start database development server
	@$(ECHO_CMD) "$(BLUE)Starting database service...$(RESET)"
	npm run dev:db

dev-storybook: ## Start Storybook for component development
	@$(ECHO_CMD) "$(BLUE)Starting Storybook...$(RESET)"
	npm run storybook

graphiql: ## Start GraphQL explorer
	@$(ECHO_CMD) "$(BLUE)Starting GraphQL explorer...$(RESET)"
	npm run graphiql

# Mobile Development
android: ## Run Android application
	@$(ECHO_CMD) "$(BLUE)Running Android application...$(RESET)"
	npm run android

ios: ## Run iOS application  
	@$(ECHO_CMD) "$(BLUE)Running iOS application...$(RESET)"
	npm run ios

build-android: ## Build Android APK
	@$(ECHO_CMD) "$(BLUE)Building Android APK...$(RESET)"
	npm run build-android

build-ios: ## Build iOS application
	@$(ECHO_CMD) "$(BLUE)Building iOS application...$(RESET)"
	npm run build-ios

# Database Operations
db-migrate: ## Run database migrations
	@$(ECHO_CMD) "$(BLUE)Running database migrations...$(RESET)"
ifeq ($(DETECTED_OS),Windows)
	scripts$(PATH_SEP)run-migrations.ps1
else
	scripts$(PATH_SEP)run-migrations.sh
endif

db-studio: ## Open database studio
	@$(ECHO_CMD) "$(BLUE)Opening database studio...$(RESET)"
	npx nx studio:public db-client

db-reset: ## Reset database
	@$(ECHO_CMD) "$(BLUE)Resetting database...$(RESET)"
	npx nx db:reset db-client

# Code Generation
codegen: ## Run code generation
	@$(ECHO_CMD) "$(BLUE)Running code generation...$(RESET)"
	npm run codegen

# Infrastructure and Deployment
deploy-lambdas: ## Deploy all lambda functions
	@$(ECHO_CMD) "$(BLUE)Deploying lambda functions...$(RESET)"
ifeq ($(DETECTED_OS),Windows)
	scripts$(PATH_SEP)deploy-lambda-all.ps1
else
	scripts$(PATH_SEP)deploy-lambda-all.sh
endif

deploy-infrastructure: ## Deploy infrastructure with Terraform
	@$(ECHO_CMD) "$(BLUE)Deploying infrastructure...$(RESET)"
ifeq ($(DETECTED_OS),Windows)
	cd terraform && deploy.ps1
else
	cd terraform && ./deploy.sh
endif

terraform-plan: ## Plan Terraform deployment
	@$(ECHO_CMD) "$(BLUE)Planning Terraform deployment...$(RESET)"
	cd terraform && terraform plan

terraform-apply: ## Apply Terraform changes
	@$(ECHO_CMD) "$(BLUE)Applying Terraform changes...$(RESET)"
	cd terraform && terraform apply

terraform-destroy: ## Destroy Terraform infrastructure
	@$(ECHO_CMD) "$(YELLOW)Destroying Terraform infrastructure...$(RESET)"
	cd terraform && terraform destroy

# Environment Management
sync-env: ## Sync environment variables
	@$(ECHO_CMD) "$(BLUE)Syncing environment variables...$(RESET)"
ifeq ($(DETECTED_OS),Windows)
	scripts$(PATH_SEP)sync-env.ps1
else
	scripts$(PATH_SEP)sync-env.sh
endif

check-services: ## Check service health
	@$(ECHO_CMD) "$(BLUE)Checking service health...$(RESET)"
	node scripts$(PATH_SEP)check-services.js

# Utilities
graph: ## Show Nx project dependency graph
	@$(ECHO_CMD) "$(BLUE)Opening Nx project graph...$(RESET)"
	npx nx graph

affected: ## Show affected projects
	@$(ECHO_CMD) "$(BLUE)Showing affected projects...$(RESET)"
	npx nx show projects --affected

list-projects: ## List all projects in workspace
	@$(ECHO_CMD) "$(BLUE)Listing all projects...$(RESET)"
	npx nx show projects

workspace-lint: ## Run workspace-level validations
	@$(ECHO_CMD) "$(BLUE)Running workspace validations...$(RESET)"
	node scripts$(PATH_SEP)validate-workspace-deps.js
	node scripts$(PATH_SEP)validate-package-json-standards.js

# Composite Commands
ci: clean-safe install lint typecheck test build ## Complete CI pipeline
	@$(ECHO_CMD) "$(GREEN)CI pipeline completed successfully!$(RESET)"

ci-force: clean-safe install-force lint typecheck test build ## CI pipeline with force install (Windows file locks)
	@$(ECHO_CMD) "$(GREEN)CI pipeline with force install completed successfully!$(RESET)"

ci-full: clean install lint typecheck test build ## Complete CI pipeline with full clean
	@$(ECHO_CMD) "$(GREEN)Full CI pipeline completed successfully!$(RESET)"

pre-commit: lint-fix format typecheck ## Run pre-commit checks
	@$(ECHO_CMD) "$(GREEN)Pre-commit checks completed!$(RESET)"

release: clean install build-all test-all ## Prepare for release
	@$(ECHO_CMD) "$(GREEN)Release preparation completed!$(RESET)"

full-deploy: build-all deploy-lambdas deploy-infrastructure ## Complete deployment
	@$(ECHO_CMD) "$(GREEN)Full deployment completed!$(RESET)"

# Development workflow shortcuts
quick-check: lint typecheck ## Quick code quality check
	@$(ECHO_CMD) "$(GREEN)Quick checks completed!$(RESET)"

full-check: lint typecheck test ## Comprehensive code quality check
	@$(ECHO_CMD) "$(GREEN)Full checks completed!$(RESET)"

dev-setup: install db-migrate ## Setup development environment
	@$(ECHO_CMD) "$(GREEN)Development environment setup completed!$(RESET)"

# Troubleshooting
fix-windows-locks: ## Fix Windows file permission issues
	@$(ECHO_CMD) "$(BLUE)Fixing Windows file locks...$(RESET)"
	@$(ECHO_CMD) "$(YELLOW)Closing editors and stopping processes...$(RESET)"
	@$(KILL_VSCODE)
	@$(KILL_NODE)
	@$(KILL_ESBUILD)
	@$(ECHO_CMD) "$(GREEN)You can now try 'make install-force' or 'make ci-force'$(RESET)"

diagnose: ## Diagnose common issues
	@$(ECHO_CMD) "$(BLUE)Diagnosing workspace...$(RESET)"
	@$(ECHO_CMD) "Platform: $(DETECTED_OS)"
	@$(ECHO_CMD) "Node.js version:"
	@node --version
	@$(ECHO_CMD) "NPM version:"
	@npm --version
	@$(ECHO_CMD) "Nx version:"
	@npx nx --version
	@$(ECHO_CMD) "$(GREEN)Diagnosis completed!$(RESET)"