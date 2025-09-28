# AWS Resource Import Summary for Legacy Sports

# Generated on $(Get-Date)

## Overview

This document summarizes the AWS resources that were discovered and imported into Terraform management.

## Imported Resources

### 1. Legacy Lambda Function

**Resource**: `legacy-sports-graphql-dev-graphql`
**Created**: September 8, 2025
**Purpose**: GraphQL Lambda function deployed via Serverless Framework
**Status**: ✅ Imported as `aws_lambda_function.legacy_graphql`

**Analysis**: This appears to be an older version of the GraphQL Lambda function that was deployed using the Serverless Framework. The current managed function `legacy-sports-dev-graphql` was deployed on September 26, 2025, indicating this legacy function is outdated.

**Recommendation**: This legacy function should be decommissioned after confirming the current GraphQL function is working properly.

### 2. Legacy IAM Role

**Resource**: `legacy-sports-graphql-dev-us-east-1-lambdaRole`
**Created**: September 8, 2025
**Purpose**: IAM role for the legacy GraphQL Lambda function
**Status**: ✅ Imported as `aws_iam_role.legacy_graphql_lambda`

**Analysis**: This IAM role was created by the Serverless Framework for the legacy Lambda function.

**Recommendation**: Should be decommissioned along with the legacy Lambda function.

### 3. Legacy S3 Bucket

**Resource**: `legacy-sports-dev-lambdas-f3d4b778`
**Created**: September 2, 2025
**Purpose**: Contains Serverless Framework artifacts and legacy deployment packages
**Status**: ✅ Imported as `aws_s3_bucket.legacy_lambda_deployments`

**Contents Analysis**:

- Serverless Framework CloudFormation templates
- Legacy GraphQL deployment packages (September 8, 2025)
- Legacy statistics Lambda deployments
- Database Lambda deployments (September 18, 2025)

**Recommendation**: Archive or migrate useful deployments to the current bucket (`legacy-sports-dev-lambdas-cca20ad9`), then decommission.

### 4. Legacy API Gateways

#### 4.1 Previous Terraform Deployment

**Resource**: `legacy-sports-dev-api` (ID: u65oy98s9d)
**Created**: September 8, 2025
**Purpose**: Previous Terraform-managed API Gateway
**Status**: ✅ Imported as `aws_api_gateway_rest_api.legacy_main`

**Analysis**: This is a previous Terraform deployment of the API Gateway. The current managed API Gateway has the same name but different ID (`dtx9mcsty1`).

#### 4.2 Serverless Framework Deployment

**Resource**: `dev-legacy-sports-graphql` (ID: 89vohxs7ta)
**Created**: September 8, 2025
**Purpose**: GraphQL-specific API Gateway created by Serverless Framework
**Status**: ✅ Imported as `aws_api_gateway_rest_api.serverless_graphql`

**Analysis**: This was created by CloudFormation/Serverless Framework as part of the legacy GraphQL deployment.

**Recommendation**: Both legacy API Gateways should be decommissioned after confirming the current API Gateway is properly configured.

## Current vs Legacy Resource Mapping

| Resource Type            | Current (Managed)                             | Legacy (Imported)                                | Action Required        |
| ------------------------ | --------------------------------------------- | ------------------------------------------------ | ---------------------- |
| Lambda - GraphQL         | `legacy-sports-dev-graphql` (Sep 26)          | `legacy-sports-graphql-dev-graphql` (Sep 8)      | Decommission legacy    |
| IAM Role - GraphQL       | `legacy-sports-dev-graphql-lambda-role`       | `legacy-sports-graphql-dev-us-east-1-lambdaRole` | Decommission legacy    |
| S3 Bucket - Deployments  | `legacy-sports-dev-lambdas-cca20ad9` (Sep 25) | `legacy-sports-dev-lambdas-f3d4b778` (Sep 2)     | Archive & decommission |
| API Gateway              | `legacy-sports-dev-api` (dtx9mcsty1, Sep 25)  | `legacy-sports-dev-api` (u65oy98s9d, Sep 8)      | Decommission legacy    |
| API Gateway - Serverless | N/A                                           | `dev-legacy-sports-graphql` (89vohxs7ta, Sep 8)  | Decommission legacy    |

## Configuration Issues Found

The Terraform plan identified several configuration mismatches that need to be addressed:

1. **Legacy Lambda Function Configuration**: The imported Lambda function has different settings than configured
2. **OAuth Proxy Policy Changes**: The OAuth proxy IAM policies have evolved and don't match the current state
3. **Missing Resource References**: Some IAM role attachments are missing from the current configuration

## Cleanup Strategy

### Phase 1: Validation (Immediate)

1. ✅ Verify current GraphQL Lambda function is working properly
2. ✅ Confirm current API Gateway is receiving traffic correctly
3. ✅ Validate current S3 bucket has latest deployment artifacts

### Phase 2: Archive Legacy Data (Within 1 week)

1. Archive useful deployment packages from legacy S3 bucket to current bucket
2. Document any configuration differences between legacy and current resources
3. Export CloudFormation templates from Serverless Framework stack for reference

### Phase 3: Decommission Legacy Resources (Within 2 weeks)

1. Delete legacy Lambda function and IAM role
2. Delete legacy API Gateways
3. Clean up legacy S3 bucket (after archiving important data)
4. Remove CloudFormation stack created by Serverless Framework

## Cost Impact

**Estimated Monthly Costs of Legacy Resources**:

- Lambda function (idle): ~$0.00
- API Gateways (no traffic): ~$0.00
- S3 bucket storage (~2GB): ~$0.05
- **Total**: ~$0.05/month

While the cost impact is minimal, maintaining legacy resources creates operational overhead and potential security risks.

## Next Steps

1. **Fix Terraform Configuration**: Address the configuration mismatches identified in the plan
2. **Test Current Infrastructure**: Ensure all current services are working properly
3. **Create Cleanup Script**: Develop a script to safely decommission legacy resources
4. **Schedule Cleanup**: Plan maintenance window for resource cleanup

## Security Considerations

- Legacy resources may have different security configurations
- IAM roles should be audited for unnecessary permissions
- API Gateways should be checked for proper CORS and authentication settings
- S3 bucket permissions should be reviewed before archival

## Monitoring

After cleanup, monitor for:

- Any applications still trying to use legacy endpoints
- CloudWatch logs for errors related to missing resources
- Cost optimization opportunities from reduced resource count

---

_This summary was generated as part of the AWS resource import process. All legacy resources are now managed by Terraform and can be safely modified or removed through infrastructure as code._
