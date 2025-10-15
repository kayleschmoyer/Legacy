# Terraform Documentation

This directory contains Infrastructure as Code (IaC) documentation using Terraform for AWS resource management.

## 📑 Contents

### Core Terraform Setup
- **[Terraform Lambda Deployment](terraform-lambda-deployment.md)** - Lambda infrastructure deployment
- **[Terraform Backend Setup](terraform-backend-setup.md)** - Remote state configuration
- **[Terraform State Solution](terraform-state-solution.md)** - State management strategies

### Operations & Maintenance
- **[Terraform Lock Management](terraform-lock-management.md)** - State locking and concurrent access
- **[Terraform Quick Reference](terraform-quick-reference.md)** - Common commands and workflows

## 🎯 Quick Start

### Initial Terraform Setup
1. Configure backend: [Terraform Backend Setup](terraform-backend-setup.md)
2. Review state strategy: [Terraform State Solution](terraform-state-solution.md)
3. Check [Quick Reference](terraform-quick-reference.md) for commands

### Deploying Lambda Functions
1. Follow [Terraform Lambda Deployment](terraform-lambda-deployment.md)
2. Configure Lambda resources in `.tf` files
3. Plan changes: `terraform plan`
4. Apply changes: `terraform apply`

### Managing Terraform State
1. Use remote backend per [Terraform Backend Setup](terraform-backend-setup.md)
2. Handle locks via [Terraform Lock Management](terraform-lock-management.md)
3. Resolve conflicts per [Terraform State Solution](terraform-state-solution.md)

## 🔗 Related Documentation
- [AWS Infrastructure](../aws-infrastructure.md) - Overall AWS setup
- [Lambda Build Strategy](../lambda-build-strategy.md) - Lambda build process
- [Deployment Security](../deployment-security.md) - Security best practices
- [Cost Optimization](../cost-optimization.md) - Managing AWS costs

## 💡 Common Commands

```bash
# Initialize Terraform
terraform init

# Plan changes
terraform plan

# Apply changes
terraform apply

# Destroy resources
terraform destroy

# Show current state
terraform show

# List resources
terraform state list

# Format code
terraform fmt

# Validate configuration
terraform validate
```

See [Terraform Quick Reference](terraform-quick-reference.md) for more commands.

## 💡 Common Tasks

### Deploy Lambda Function
1. Update Lambda `.tf` files
2. Build Lambda code (see [Lambda Build Strategy](../lambda-build-strategy.md))
3. Run `terraform plan` to preview
4. Run `terraform apply` to deploy
5. Verify in AWS Console

### Update Infrastructure
1. Modify `.tf` files
2. Run `terraform plan` to see changes
3. Review changes carefully
4. Run `terraform apply` if approved
5. Verify deployment

### Resolve State Lock
1. Check [Terraform Lock Management](terraform-lock-management.md)
2. Identify lock holder
3. Safely remove lock if needed: `terraform force-unlock <lock-id>`
4. Coordinate with team

### Troubleshoot Terraform Issues
1. Run `terraform validate` to check syntax
2. Review state with `terraform show`
3. Check [Terraform State Solution](terraform-state-solution.md)
4. Verify AWS credentials and permissions

### Set Up New Environment
1. Configure backend in [Terraform Backend Setup](terraform-backend-setup.md)
2. Create workspace: `terraform workspace new <env>`
3. Configure variables for environment
4. Run `terraform apply`

## 🏗️ Terraform Structure

```
terraform/
├── main.tf              # Main configuration
├── variables.tf         # Input variables
├── outputs.tf          # Output values
├── backend.tf          # Remote state backend
├── lambda.tf           # Lambda functions
├── api-gateway.tf      # API Gateway
├── rds.tf             # Database
└── modules/           # Reusable modules
```

## ⚠️ Best Practices

- **State Management**: Always use remote state (S3 + DynamoDB)
- **Workspaces**: Use workspaces for multiple environments
- **Variables**: Use `.tfvars` files, never hardcode secrets
- **Planning**: Always run `terraform plan` before `apply`
- **Version Control**: Commit `.tf` files, ignore `.tfstate` and secrets
- **Locking**: Enable state locking to prevent concurrent modifications
- **Modules**: Use modules for reusable infrastructure patterns
- **Documentation**: Comment complex configurations

---

[← Back to Deployment Documentation](../) | [← Back to Documentation Hub](../../README.md)
