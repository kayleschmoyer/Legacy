# Resource Discovery and Management

This document explains how to use the resource discovery functionality to find and manage AWS resources that are not managed by Terraform.

## Overview

The resource discovery feature helps you:

- Find existing AWS resources that match your project naming patterns
- Identify which resources are already managed by Terraform
- Import unmanaged resources into Terraform state
- Generate import commands for manual execution

## Usage

### PowerShell (Windows)

```powershell
# Discover all supported resource types
.\deploy.ps1 -DiscoverResources

# Discover specific resource types
.\deploy.ps1 -DiscoverResources -ResourceTypes VPC,Lambda,RDS

# Auto-import all discovered resources
.\deploy.ps1 -DiscoverResources -AutoImport

# Discover and auto-import specific types
.\deploy.ps1 -DiscoverResources -ResourceTypes Lambda,S3 -AutoImport
```

### Bash (Linux/macOS)

```bash
# Discover all supported resource types
./deploy.sh --discover-resources

# Discover specific resource types
./deploy.sh --discover-resources --resource-types VPC,Lambda,RDS

# Auto-import all discovered resources
./deploy.sh --discover-resources --auto-import

# Discover and auto-import specific types
./deploy.sh --discover-resources --resource-types Lambda,S3 --auto-import
```

## Supported Resource Types

The following AWS resource types are supported for discovery:

| Type             | Description                     | AWS Resources Scanned                 |
| ---------------- | ------------------------------- | ------------------------------------- |
| `VPC`            | Virtual Private Cloud resources | VPCs with project name tags           |
| `Lambda`         | Lambda functions                | Functions with project name prefix    |
| `RDS`            | Relational Database Service     | DB instances with project name prefix |
| `SQS`            | Simple Queue Service            | Queues with project name prefix       |
| `S3`             | Simple Storage Service          | Buckets with project name prefix      |
| `IAM`            | Identity and Access Management  | Roles with project name prefix        |
| `SecretsManager` | AWS Secrets Manager             | Secrets with project name prefix      |
| `ApiGateway`     | API Gateway                     | REST APIs with project name prefix    |

## Resource Matching

The discovery process looks for AWS resources that match the pattern:

```
*legacy-sports*dev*
```

This pattern includes:

- Project name: `legacy-sports`
- Environment: `dev`

## Discovery Process

1. **Terraform State Analysis**: Reads the current Terraform state to understand which resources are already managed
2. **AWS Resource Scanning**: Uses AWS CLI to query each resource type for matching resources
3. **Comparison**: Compares AWS resources with Terraform state to identify unmanaged resources
4. **Reporting**: Displays unmanaged resources grouped by type

## Import Options

When unmanaged resources are found, you have several options:

### 1. Import All Resources

Automatically imports all discovered resources into Terraform state. Each resource is given a name like `discovered_<sanitized_name>`.

### 2. Import Selected Resources

Allows you to choose which specific resources to import by selecting numbers from a list.

### 3. Generate Import Commands

Creates a file `import-commands.txt` with Terraform import commands that you can review and execute manually.

### 4. Skip Import

Do nothing with the discovered resources.

## Safety Considerations

- **Backup First**: Always backup your Terraform state before importing resources
- **Review Changes**: Use `terraform plan` after importing to see what changes Terraform would make
- **Test Environment**: Test the import process in a development environment first
- **Resource Naming**: Imported resources get generic names like `discovered_<name>` - you may want to rename them

## Example Workflow

1. **Discover resources**:

   ```powershell
   .\deploy.ps1 -DiscoverResources -ResourceTypes Lambda,RDS
   ```

2. **Review the output** to see what unmanaged resources exist

3. **Choose import option** based on your needs:
   - Option 1: Import all (quickest)
   - Option 2: Import selected (safest)
   - Option 3: Generate commands (for review)

4. **After importing, run a plan** to see what Terraform would change:

   ```powershell
   .\deploy.ps1 -PlanOnly
   ```

5. **Update your Terraform configuration** if needed to match the imported resources

## Troubleshooting

### AWS CLI Not Found

Ensure AWS CLI is installed and configured:

```bash
aws --version
aws configure list
```

### Permission Denied

Ensure your AWS credentials have read permissions for the resource types you're scanning:

- `ec2:DescribeVpcs` for VPC resources
- `lambda:ListFunctions` for Lambda resources
- `rds:DescribeDBInstances` for RDS resources
- etc.

### Terraform State Issues

If Terraform state cannot be read:

- Ensure you're in the correct directory
- Run `terraform init` if `.terraform` directory doesn't exist
- Check that Terraform is properly configured

### No Resources Found

If no unmanaged resources are found:

- Verify the naming pattern matches your resources
- Check that you have the necessary AWS permissions
- Ensure you're scanning the correct AWS region

## Advanced Usage

### Custom Resource Types

To add support for additional resource types, modify the discovery functions in the deployment scripts.

### Different Naming Patterns

To use different naming patterns, modify the `name_pattern` variables in the discovery functions.

### Multiple Environments

Run discovery separately for each environment by modifying the environment variable in the scripts.

## Best Practices

1. **Regular Discovery**: Run resource discovery periodically to catch drift
2. **Documentation**: Document any manually created resources and why they exist
3. **Naming Conventions**: Use consistent naming conventions to make discovery more effective
4. **Resource Tagging**: Tag resources appropriately to aid in discovery and management
5. **State Management**: Keep Terraform state files backed up and version controlled

## Integration with CI/CD

You can integrate resource discovery into your CI/CD pipeline:

```yaml
# Example GitHub Actions step
- name: Discover Unmanaged Resources
  run: |
    ./deploy.sh --discover-resources --resource-types Lambda,RDS
    if [ -f import-commands.txt ]; then
      echo "Unmanaged resources found. Review import-commands.txt"
      exit 1
    fi
```

This helps catch resource drift and ensures all resources are properly managed by Terraform.
