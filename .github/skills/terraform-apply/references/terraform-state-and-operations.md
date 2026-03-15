# Terraform Operations & State Management Reference

## Common Terraform Operations

### View Resources

```powershell
# List all resources
terraform state list

# Show specific resource
terraform state show aws_lambda_function.db

# Show outputs
terraform output
```

### Import Existing Resources

```powershell
# Import existing AWS resource to state
terraform import aws_lambda_function.db legacy-sports-dev-db

# Import with -target
terraform import -target=aws_lambda_function.db aws_lambda_function.db legacy-sports-dev-db
```

### Refresh State

```powershell
# Update state from AWS (no changes)
terraform refresh

# Refresh specific resource
terraform refresh -target=aws_lambda_function.db
```

## Terraform State Management

### State Location

- **Remote**: S3 bucket (configured in backend.tf)
- **Lock**: DynamoDB table for locking
- **Local**: `.terraform/` directory (gitignored)

### State Commands

```powershell
# List resources
terraform state list

# Remove resource from state (doesn't destroy)
terraform state rm aws_lambda_function.old

# Move resource in state
terraform state mv aws_lambda_function.old aws_lambda_function.new
```

## Terraform File Structure

```
terraform/
├── main.tf              # Main configuration
├── variables.tf         # Input variables
├── outputs.tf           # Output values
├── backend.tf           # Remote state configuration
├── versions.tf          # Terraform version constraints
├── lambda-*.tf          # Lambda configurations
├── database.tf          # Database resources
├── networking.tf        # VPC, subnets, etc.
└── security.tf          # Security groups, IAM
```

## Sensitive Resources

**Extra caution needed**:

- 🔴 **Database** - Don't destroy accidentally
- 🔴 **State bucket** - Contains all state
- 🔴 **IAM roles** - Can break access
- 🟡 **Lambdas** - Can disrupt service
- 🟡 **API Gateway** - Can break API
