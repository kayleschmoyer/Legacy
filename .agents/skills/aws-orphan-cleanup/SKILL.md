---
name: aws-orphan-cleanup
description: 'Find and clean up AWS resources not tracked by Terraform. Use when auditing AWS costs, investigating unexpected resources, or cleaning up legacy infrastructure after decommissioning services.'
---

# Skill: AWS Orphaned Resource Cleanup

## Overview

Identifies and removes AWS resources that exist in the account but are not tracked by Terraform state. Uses `terraform state list` as the source of truth and cross-references live AWS CLI queries for each resource type.

> **Local only** — This skill requires AWS credentials and Terraform state access, both unavailable in cloud agent environments. Cloud agents should inform the user that orphan cleanup must be performed from a local session with active AWS SSO credentials and Terraform state access.

**Known permanent exceptions** (do not flag these):

- `eipalloc-09338b5c6924e14cf` (`52.70.156.59`) auto-assigned by RDS (`ServiceManaged: rds`) because the DB instance has `publicly_accessible = true`. Tagged `ManagedBy: rds`. Cannot be released manually.
- `Default_CloudWatch_Alarms_Topic` SNS topic AWS-managed default, not project-owned.
- Default security groups in each VPC AWS creates one per VPC; cannot be deleted.
- `default` VPC leave alone unless explicitly requested.

## Prerequisites

```powershell
# Ensure AWS SSO is active
aws sts get-caller-identity
# If expired, re-authenticate:
aws sso login
```

## Step 1 Get Terraform State Baseline

```powershell
Set-Location "d:\code\legacy-sports\terraform"
terraform state list | Sort-Object | Tee-Object scratch/tf-state.txt
```

## Step 2 Audit Each Resource Type

Run each block and compare names/IDs against the Terraform state list.

### Lambda Functions

```powershell
aws lambda list-functions --region us-east-1 `
  --query "Functions[?contains(FunctionName, 'legacy-sports')].{Name:FunctionName,Runtime:Runtime,LastModified:LastModified}" `
  --output table
```

**Terraform resources**: `aws_lambda_function.*`

### API Gateways (REST + WebSocket)

```powershell
aws apigateway get-rest-apis --region us-east-1 `
  --query "items[?contains(name,'legacy-sports')].{id:id,name:name,createdDate:createdDate}" --output table
aws apigatewayv2 get-apis --region us-east-1 `
  --query "Items[?contains(Name,'legacy-sports')].{id:ApiId,name:Name,protocol:ProtocolType}" --output table
```

**Terraform resources**: `aws_api_gateway_rest_api.*`, `aws_apigatewayv2_api.*`

### S3 Buckets

```powershell
aws s3api list-buckets `
  --query "Buckets[?contains(Name,'legacy-sports')||contains(Name,'terraform-state')].{Name:Name,Created:CreationDate}" `
  --output table
```

**Terraform resources**: `aws_s3_bucket.*`

### SQS Queues

```powershell
aws sqs list-queues --region us-east-1 --queue-name-prefix "legacy-sports" --query "QueueUrls" --output text
```

**Terraform resources**: `aws_sqs_queue.*`

### DynamoDB Tables

```powershell
aws dynamodb list-tables --region us-east-1 `
  --query "TableNames[?contains(@,'legacy-sports')||contains(@,'websocket')||contains(@,'terraform')]" --output table
```

**Terraform resources**: `aws_dynamodb_table.*`

### Secrets Manager

```powershell
aws secretsmanager list-secrets --region us-east-1 `
  --query "SecretList[?contains(Name,'legacy-sports')||starts_with(Name,'dev/')].{Name:Name,Created:CreatedDate,LastAccessed:LastAccessedDate}" `
  --output table
```

Compare each secret name against `terraform state show aws_secretsmanager_secret.*` output.
**Orphan signal**: Never accessed, or created shortly before/after a Terraform-managed secret of the same prefix.

### SSM Parameters

```powershell
aws ssm get-parameters-by-path --region us-east-1 --path "/legacy-sports" --recursive `
  --query "sort_by(Parameters, &Name)[].Name" --output json
```

**Terraform resources**: `aws_ssm_parameter.*`
**Known orphan from past**: `/legacy-sports/dev/lambda/draft-processor/s3-key` written by deploy script, not Terraform.

### IAM Roles & Policies

```powershell
aws iam list-roles `
  --query "Roles[?contains(RoleName,'legacy-sports')].{Name:RoleName,Created:CreateDate}" --output table
aws iam list-policies --scope Local `
  --query "sort_by(Policies[?contains(PolicyName,'legacy-sports')], &PolicyName)[].PolicyName" --output json
```

**Terraform resources**: `aws_iam_role.*`, `aws_iam_policy.*`

### CloudWatch Log Groups

```powershell
aws logs describe-log-groups --region us-east-1 --log-group-name-prefix "/aws/lambda/legacy-sports" `
  --query "logGroups[].{name:logGroupName,retentionDays:retentionInDays}" --output table
```

**Terraform resources**: `aws_cloudwatch_log_group.*`

### EventBridge Rules

```powershell
aws events list-rules --region us-east-1 `
  --query "Rules[?contains(Name,'legacy-sports')].{Name:Name,State:State,Schedule:ScheduleExpression}" --output table
```

**Terraform resources**: `aws_cloudwatch_event_rule.*`

### EC2 Instances

```powershell
aws ec2 describe-instances --region us-east-1 `
  --query "Reservations[].Instances[].{ID:InstanceId,Name:Tags[?Key=='Name']|[0].Value,State:State.Name,Type:InstanceType}" `
  --output table
```

**Terraform resources**: `aws_instance.*`

### Elastic IPs

```powershell
aws ec2 describe-addresses --region us-east-1 `
  --query "Addresses[].{IP:PublicIp,AllocId:AllocationId,Name:Tags[?Key=='Name']|[0].Value,AssocId:AssociationId,NetworkInterfaceId:NetworkInterfaceId,ServiceManaged:ServiceManaged}" `
  --output table
```

**Terraform resources**: `aws_eip.*`

> Check the `ServiceManaged` field. A value of `rds` means AWS auto-assigned it because `publicly_accessible = true` on the RDS instance. Do NOT attempt to release it it will fail and AWS manages the lifecycle.

### VPCs (critical check for legacy duplicates)

```powershell
aws ec2 describe-vpcs --region us-east-1 `
  --query "Vpcs[].{ID:VpcId,CIDR:CidrBlock,Name:Tags[?Key=='Name']|[0].Value,Default:IsDefault}" --output table
```

**Terraform resource**: `aws_vpc.main` there should be exactly **one** non-default VPC.

> Multiple VPCs with the same name or CIDR indicate a legacy duplicate from a failed Terraform apply. In Sept 2025, three orphaned VPCs (`vpc-06...`, `vpc-0a...`, `vpc-01...`) were found and deleted. They contained NAT Gateways, IGWs, subnets, security groups, route tables, and Lambda ENIs.

### NAT Gateways (check ALL states, not just available)

```powershell
aws ec2 describe-nat-gateways --region us-east-1 `
  --filter "Name=state,Values=available,pending" `
  --query "NatGateways[].{ID:NatGatewayId,VPC:VpcId,State:State,EIP:NatGatewayAddresses[0].PublicIp}" `
  --output table
```

> NAT Gateways cost ~$32/month each even when idle. A private NAT GW has no EIP and won't show up in the EIP audit always check NAT GWs directly.

### Lightsail (separate isolated network not in EC2 VPCs)

```powershell
# Minecraft server lives in us-east-2  always exclude from EC2/VPC cleanup decisions
aws lightsail get-instances --region us-east-2 `
  --query "instances[].{Name:name,State:state.name,Blueprint:blueprintName,IP:publicIpAddress}" --output table
```

## Step 3 VPC Teardown (Dependency Order)

When deleting an orphaned VPC, **always follow this exact order** to avoid `DependencyViolation` errors:

```
1. Delete NAT Gateways        wait for "deleted" state (~60s)
2. Release EIPs               only AFTER NAT GW is fully deleted
3. Find + delete Lambda ENIs  Status=available in target subnets
4. Delete non-main Route Tables (delete blackhole routes first)
5. Detach + Delete Internet Gateways
6. Delete Subnets
7. Delete non-default Security Groups
8. Delete VPC
```

```powershell
# Check NAT GW deletion progress
aws ec2 describe-nat-gateways --region us-east-1 `
  --nat-gateway-ids nat-XXXXX --query "NatGateways[].State" --output text

# Find lingering ENIs in a subnet
aws ec2 describe-network-interfaces --region us-east-1 `
  --filters "Name=subnet-id,Values=subnet-XXXXX" `
  --query "NetworkInterfaces[?Status=='available'].NetworkInterfaceId" --output text

# Delete an ENI
aws ec2 delete-network-interface --region us-east-1 --network-interface-id eni-XXXXX

# Find non-main route tables in a VPC
aws ec2 describe-route-tables --region us-east-1 `
  --filters "Name=vpc-id,Values=vpc-XXXXX" `
  --query "RouteTables[].{ID:RouteTableId,Main:Associations[0].Main}" --output table
```

## Step 4 Delete Orphaned Secrets

```powershell
# Delete immediately (bypasses 30-day recovery window)
aws secretsmanager delete-secret --region us-east-1 `
  --secret-id "SECRET-NAME-HERE" `
  --force-delete-without-recovery
```

Only delete secrets that have **never been accessed** or not accessed in months, AND there is an active Terraform-managed equivalent.

## Step 5 Delete Orphaned SSM Parameters

```powershell
aws ssm delete-parameter --region us-east-1 --name "/legacy-sports/dev/lambda/XXXX/key"
```

## Cost Reference

| Resource                | Idle Cost                   |
| ----------------------- | --------------------------- |
| NAT Gateway             | ~$32/month each             |
| Elastic IP (unattached) | ~$3.60/month each           |
| Secrets Manager secret  | ~$0.40/month each           |
| RDS (stopped)           | Storage charges still apply |

## Troubleshooting

**`DependencyViolation` on VPC delete** check for: leftover ENIs (Lambda or NAT), non-main route tables with routes, security group cross-references, VPC endpoints (`aws ec2 describe-vpc-endpoints --filters Name=vpc-id,Values=vpc-XXXXX`).

**`AuthFailure` or `OperationNotPermitted` on EIP release** EIP still associated. Check `AssociationId`. If attached to a NAT GW: delete the NAT GW first and wait for full deletion. If `ServiceManaged: rds`: do not release.

**Cannot delete route table** contains routes in `blackhole` state (gateway already deleted). Delete those routes first (`aws ec2 delete-route --route-table-id rtb-XXX --destination-cidr-block 0.0.0.0/0`), then delete the table.

**Subnet blocked by ENI** find orphaned ENIs: `aws ec2 describe-network-interfaces --filters Name=subnet-id,Values=subnet-XXXXX --query "NetworkInterfaces[].{ID:NetworkInterfaceId,Status:Status,Desc:Description}"`. Delete `available`-status ENIs before deleting the subnet.
