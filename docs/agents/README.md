# AI Agent Instructions for Legacy Sports

## 📋 Overview

This document provides structured guidance for AI agents working on the Legacy Sports codebase. The instructions are organized into topic-based CSV files for efficient processing and selective loading.

## 📁 Agent Instruction Topics

### **Core Development Guidelines**

| Topic                        | File                                                                               | Description                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Contribution Workflow** ⭐ | [`docs/agents/contribution-workflow.csv`](./docs/agents/contribution-workflow.csv) | Complete contribution process from planning to PR creation    |
| **Branch Tree Management** 🌳 | [`docs/guides/branch-tree-management.md`](../guides/branch-tree-management.md) | Twig tree management for dependent branches and clean commits |
| **Platform Components**      | [`docs/agents/platform-components.csv`](./docs/agents/platform-components.csv)     | Magic string system for cross-platform compatibility          |
| **Type Safety**              | [`docs/agents/type-safety.csv`](./docs/agents/type-safety.csv)                     | TypeScript standards and `any` type usage guidelines          |
| **ESLint Standards**         | [`docs/agents/eslint-standards.csv`](./docs/agents/eslint-standards.csv)           | Code quality enforcement and lint error resolution            |
| **Development Workflow**     | [`docs/agents/development-workflow.csv`](./docs/agents/development-workflow.csv)   | Daily workflows, terminal compatibility, fail-fast philosophy |

### **Architecture & Infrastructure**

| Topic                       | File                                                                                   | Description                                                        |
| --------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **GraphQL API**             | [`docs/agents/graphql-api.csv`](./docs/agents/graphql-api.csv)                         | Apollo Server, Pothos schema, career statistics integration        |
| **Database Schema**         | [`docs/agents/database-schema.csv`](./docs/agents/database-schema.csv)                 | Season-to-career data pattern, credential management               |
| **AWS Infrastructure**      | [`docs/agents/aws-infrastructure.csv`](./docs/agents/aws-infrastructure.csv)           | Lambda architecture, Terraform management, cost optimization       |
| **Repository Architecture** | [`docs/agents/repository-architecture.csv`](./docs/agents/repository-architecture.csv) | Nx monorepo structure, build system, file conventions              |
| **Build System**            | [`docs/agents/build-system.csv`](./docs/agents/build-system.csv)                       | Nx workspace management, dependency resolution, build optimization |

### **Quality Assurance & Operations**

| Topic                   | File                                                                           | Description                                           |
| ----------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **Security Guidelines** | [`docs/agents/security-guidelines.csv`](./docs/agents/security-guidelines.csv) | Authentication, credential management, commit safety  |
| **Testing Strategy**    | [`docs/agents/testing-strategy.csv`](./docs/agents/testing-strategy.csv)       | Unit, integration, e2e testing patterns and practices |
| **Troubleshooting**     | [`docs/agents/troubleshooting.csv`](./docs/agents/troubleshooting.csv)         | Common error resolution, debugging workflows          |
| **CI/CD Patterns**      | [`docs/agents/cicd-patterns.csv`](./docs/agents/cicd-patterns.csv)             | GitHub Actions, deployment pipelines, quality gates   |
| **Common Pitfalls**     | [`docs/agents/common-pitfalls.csv`](./docs/agents/common-pitfalls.csv)         | Frequent mistakes and how to avoid them               |

## 🚀 Usage Instructions

### **For AI Agents:**

1. **Load Relevant Topics**: Load only the CSV files relevant to your current task
2. **Filter by Rule Type**: Use the `Rule_Type` column to find CRITICAL, DO, DON'T, etc.
3. **Search by Pattern**: Use `Pattern_Concept` for specific implementation patterns
4. **Reference Examples**: Use `Code_Example` and `File_Path` columns for implementation guidance

### **🔧 Quick Troubleshooting Workflow:**

When encountering errors, follow this systematic approach:

1. **Identify Error Category**: Build failure, module resolution, platform issue, or deployment
2. **Consult Troubleshooting CSV**: Load `troubleshooting.csv` and search for error patterns
3. **Check Build System**: If build-related, reference `build-system.csv` for dependency order
4. **Validate Environment**: Ensure `npm run sync-env` has been run and credentials are set
5. **Apply Solution**: Follow the systematic resolution steps from the guidelines
6. **Document Discovery**: Add new patterns to relevant CSV if solution not documented

### **📝 Agent Contribution Guidelines:**

**IMPORTANT: Help improve these instructions by contributing back what you learn!**

#### **When to Contribute:**

- **Discovered new patterns** not documented in the CSV files
- **Encountered edge cases** that required specific solutions
- **Found gaps** in the existing guidelines
- **Resolved complex issues** that could benefit other agents
- **Learned new best practices** during your work

#### **How to Contribute:**

1. **Document New Patterns**: Add new rows to relevant CSV files using the standard schema
2. **Update Existing Rules**: Enhance descriptions or examples based on real-world usage
3. **Add Missing Categories**: Create new subcategories if you discover new problem domains
4. **Include Context**: Always add the `File_Path` and practical `Code_Example` when possible

#### **Contribution Format:**

```csv
Category,Subcategory,Rule_Type,Pattern_Concept,Description,Code_Example,File_Path
your_category,new_area,LEARNED,pattern_name,What you discovered and why it matters,"Practical example from your work","path/to/relevant/file"
```

#### **Example Contribution:**

```csv
platform_components,error_handling,LEARNED,platform_error_boundaries,Platform-specific error boundaries need different implementations,"// Web: ErrorBoundary component\n// Mobile: React Native error handling","platform-components/web/ErrorBoundary.tsx"
```

### **For Developers:**

1. **Topic-Specific Updates**: Update individual CSV files when rules change
2. **Add New Rules**: Add rows to appropriate CSV files following the schema
3. **Cross-Reference**: Use the main table above to navigate between topics
4. **Review Agent Contributions**: Regularly review and validate agent-contributed rules

## 📊 CSV Schema

Each CSV file follows this standardized schema:

```csv
Category,Subcategory,Rule_Type,Pattern_Concept,Description,Code_Example,File_Path
```

- **Category**: High-level grouping (e.g., `platform_components`, `type_safety`)
- **Subcategory**: Specific area within category (e.g., `magic_string_system`, `firm_types_policy`)
- **Rule_Type**: Priority level (`CRITICAL`, `PRIORITY`, `DO`, `DONT`, `ACCEPTABLE`, etc.)
- **Pattern_Concept**: Searchable concept name (e.g., `__PLATFORM_COMPONENTS__`, `strong_specific_types`)
- **Description**: Human-readable rule description
- **Code_Example**: Implementation example or code snippet
- **File_Path**: Relevant file location (when applicable)

## 🎯 Success Criteria

When working on this codebase, ensure:

### **Core Development Standards**

✅ **Platform Compatibility** - Code works on both web and React Native  
✅ **Type Safety** - Strong typing with minimal `any` usage  
✅ **Build Success** - All targets compile without errors  
✅ **Lint Compliance** - No ESLint errors or warnings  
✅ **Fail Fast Philosophy** - Problems surface immediately, no error hiding or workarounds

### **Build & Testing Standards**

✅ **Build Order Compliance** - Shared libraries built before consuming applications  
✅ **Test Coverage** - Unit tests for business logic, integration tests for APIs  
✅ **Cross-Platform Testing** - Both web and mobile platforms validated  
✅ **Environment Sync** - `npm run sync-env` completed before development

### **Security & Infrastructure Standards**

✅ **Security Compliance** - No authentication credentials or secrets committed to git  
✅ **AWS Architecture Compliance** - Lambdas in private subnets, RDS secured, cost-optimized infrastructure  
✅ **API Security** - User mutations isolated from public GraphQL API, OAuth operations private  
✅ **CI/CD Pipeline Success** - All quality gates pass, proper context access in workflows

### **Documentation & Maintenance Standards**

✅ **Documentation** - Complex decisions are documented in code comments  
✅ **Agent Contribution** - New patterns documented in relevant CSV files  
✅ **Troubleshooting Records** - Solutions to complex issues added to troubleshooting.csv

## 🔄 Continuous Improvement Process

### **Enhanced Agent Workflow:**

1. **Assess Task Complexity**:
   - Simple tasks: Reference relevant CSV files directly
   - Complex tasks: Load multiple CSV files (build-system + troubleshooting + platform-components)
   - CI/CD issues: Start with cicd-patterns.csv and troubleshooting.csv

2. **Follow Systematic Troubleshooting**:
   - Build failures → Check build-system.csv for dependency order
   - Module resolution → Reference troubleshooting.csv module_resolution category
   - Platform compatibility → Consult platform-components.csv patterns
   - GitHub Actions issues → Use cicd-patterns.csv for proper context access

3. **Work on Task**: Use existing CSV guidelines for your development work
4. **Document Discoveries**: Note any new patterns, edge cases, or solutions you discover
5. **Contribute Back**: Add new rules or enhance existing ones in the relevant CSV files
6. **Validate**: Ensure your contributions follow the CSV schema and include practical examples

### **Quality Standards for Contributions:**

✅ **Good Contributions:**

- Based on actual implementation experience
- Include specific, tested code examples
- Reference actual file paths from the codebase
- Follow existing categorization patterns
- Provide clear, actionable descriptions

❌ **Avoid:**

- Theoretical or untested suggestions
- Vague descriptions without examples
- Duplicate or conflicting rules
- Platform-breaking recommendations

### **Contribution Review Process:**

1. **Self-Review**: Ensure your contribution is clear, accurate, and follows the schema
2. **Test Your Examples**: Verify code examples actually work in the codebase
3. **Check for Conflicts**: Ensure new rules don't contradict existing guidelines
4. **Document Context**: Include why this pattern/rule is important

### **Example High-Quality Contribution:**

```csv
graphql_api,error_handling,LEARNED,career_stats_null_handling,Career statistics can be null for players with incomplete records - always provide fallbacks,"const homeRuns = player.careerBatting?.hr ?? 0; // Safe fallback for missing data","lambdas/db/src/schema/statistics.ts"
```

---

**Remember**: This codebase prioritizes cross-platform compatibility and type safety. When in doubt, consult the relevant CSV files or ask for clarification rather than making assumptions that could break the platform abstraction system.

**Your contributions help make these instructions better for all future agents! 🤖✨**
