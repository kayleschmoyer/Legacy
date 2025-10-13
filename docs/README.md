# Legacy Sports Documentation Hub

Welcome to the comprehensive documentation for the Legacy Sports platform - a modern cross-platform sports data management system built with React Native, Next.js, and AWS serverless architecture.

## 🚀 Quick Navigation

### **Getting Started**
- [📖 Development Setup](guides/development-setup.md) - Complete environment setup guide
- [🔐 Authentication Guide](guides/authentication-guide.md) - OAuth and user management
- [🛠️ Troubleshooting](guides/troubleshooting.md) - Common issues and solutions
- [🔒 Security & Secrets](guides/security-and-secrets.md) - Security best practices

### **Architecture & Design**
- [🏗️ Build System](architecture/build-system.md) - Dependency order and build workflows
- [📱 Cross-Platform System](architecture/cross-platform-system.md) - Magic strings and native resolution
- [💾 Database Schema](architecture/database-schema.md) - Complete database documentation
- [🔗 GraphQL Integration](architecture/graphql-integration.md) - API design and implementation
- [✅ Schema Validation](architecture/schema-validation.md) - Drizzle schema patterns

### **Deployment & Operations**
- [☁️ AWS Infrastructure](deployment/aws-infrastructure.md) - Complete AWS setup guide
- [💰 Cost Optimization](deployment/cost-optimization.md) - AWS cost management
- [🚀 Terraform Lambda Deployment](deployment/terraform-lambda-deployment.md) - Infrastructure as code
- [🌐 NAT Gateway Removal Plan](deployment/nat-gateway-removal-plan.md) - Network optimization
- [📊 CI Pipeline Evaluation](deployment/ci-pipeline-evaluation.md) - Continuous integration
- [📈 Infrastructure Changelog](deployment/infrastructure-changelog.md) - Infrastructure updates

### **API Documentation**
- [🔗 GraphQL Schema](api/graphql-schema.md) - Complete API reference *(Coming Soon)*
- [🔐 Authentication Endpoints](api/authentication-endpoints.md) - OAuth and user management APIs *(Coming Soon)*
- [📊 Data Models](api/data-models.md) - Database entities and relationships *(Coming Soon)*

### **AI Agent Instructions**
- [🤖 Agent CSV Files](agents/) - Structured instructions for AI development assistance
- [📋 Platform Components](agents/platform-components.csv) - Cross-platform development rules
- [🏗️ Build System](agents/build-system.csv) - Build and dependency management
- [🔒 Security Guidelines](agents/security-guidelines.csv) - Security best practices
- [🧪 Testing Strategy](agents/testing-strategy.csv) - Testing approaches and patterns

### **Migration History**
- [📚 Completed Migrations](migration-history/) - Historical migration documentation
- [✅ Implementation Summaries](migration-history/) - Feature completion reports
- [🔄 System Improvements](migration-history/) - Optimization and refactoring records

## 📋 Documentation by Role

### **For Developers**
1. Start with [Development Setup](guides/development-setup.md)
2. Understand [Cross-Platform Architecture](architecture/cross-platform-system.md)
3. Review [Authentication Guide](guides/authentication-guide.md)
4. Consult [Troubleshooting](guides/troubleshooting.md) as needed

### **For DevOps Engineers**
1. Review [AWS Infrastructure](deployment/aws-infrastructure.md)
2. Study [Terraform Deployment](deployment/terraform-lambda-deployment.md)
3. Check [Cost Optimization](deployment/cost-optimization.md)
4. Monitor [Infrastructure Changelog](deployment/infrastructure-changelog.md)

### **For AI Agents**
1. Consult [Agent CSV Files](agents/) for structured instructions
2. Follow platform-specific rules in [Platform Components](agents/platform-components.csv)
3. Use [Troubleshooting CSV](agents/troubleshooting.csv) for issue resolution
4. Reference [Type Safety](agents/type-safety.csv) for TypeScript guidance

## 🏗️ Project Architecture Overview

```
Legacy Sports Platform
├── 📱 Mobile App (React Native)
├── 🌐 Web App (Next.js + Vite)
├── 🔧 CLI Tools (Node.js)
├── 🎨 Shared Components (Cross-platform)
├── ⚡ AWS Lambda Functions (Serverless)
└── 🗄️ Database (PostgreSQL + Drizzle ORM)
```

### **Key Technologies**
- **Frontend**: React Native, Next.js, Tamagui UI
- **Backend**: AWS Lambda, API Gateway, PostgreSQL
- **Build System**: Nx Monorepo, TypeScript
- **Infrastructure**: Terraform, GitHub Actions
- **Cross-Platform**: Magic String System + Metro Native Resolution

## 📊 Documentation Status

### **✅ Complete & Current**
- Development setup and troubleshooting
- Cross-platform architecture documentation
- Authentication system guide
- AWS infrastructure documentation
- Build system workflows

### **🚧 In Progress**
- API documentation (GraphQL schema)
- Deployment runbooks
- Performance optimization guides

### **📝 Planned**
- Architecture Decision Records (ADRs)
- Component library documentation
- Testing strategy documentation
- Monitoring and observability guides

## 🔍 Finding Information

### **Search Tips**
- Use the file tree or search functionality in VS Code
- Check the [agents/](agents/) directory for AI-structured instructions
- Consult [troubleshooting.md](guides/troubleshooting.md) for quick issue resolution
- Review [migration-history/](migration-history/) for historical context

### **Navigation Patterns**
- **Guides**: Step-by-step instructions and tutorials
- **Architecture**: Technical design and system documentation
- **Deployment**: Operations, infrastructure, and DevOps
- **API**: Reference documentation for endpoints and schemas
- **Agents**: Structured data for AI development assistance

## 🤝 Contributing to Documentation

### **Documentation Standards**
1. **Clear Structure**: Use consistent heading hierarchy
2. **Code Examples**: Include practical, working examples
3. **Cross-References**: Link to related documentation
4. **Keep Current**: Update docs with code changes
5. **Platform Awareness**: Note cross-platform considerations

### **File Organization**
```bash
docs/
├── guides/          # User-facing tutorials and guides
├── architecture/    # Technical system documentation  
├── deployment/      # Operations and infrastructure
├── api/            # API reference documentation
├── agents/         # AI agent instruction files
└── migration-history/ # Historical migration records
```

### **Update Process**
1. Update documentation alongside code changes
2. Review related docs when modifying systems
3. Add new guides for significant features
4. Move completed migration docs to `migration-history/`

---

## 📞 Getting Help

- **Technical Issues**: Check [troubleshooting.md](guides/troubleshooting.md)
- **Setup Problems**: Follow [development-setup.md](guides/development-setup.md)
- **Architecture Questions**: Review [architecture/](architecture/) directory
- **Deployment Issues**: Consult [deployment/](deployment/) guides

**Remember**: This documentation is designed to be comprehensive yet navigable. Use the quick navigation above to jump to relevant sections, and don't hesitate to explore related links within each document.
