# NAT Gateway Removal & Cost Optimization Plan

## 📋 **Executive Summary**

**Objective**: Remove NAT Gateway from Legacy Sports AWS infrastructure to achieve significant cost savings while maintaining full functionality and potentially fixing existing Lambda issues.

**Expected Savings**: ~$38/month ($45 NAT Gateway - $7 VPC Endpoint)  
**Timeline**: 2-phase implementation (Phase 1: Immediate, Phase 2: Follow-up)  
**Risk Level**: Low (all functionality preserved, potentially improved)

## 🎯 **Current Architecture Analysis**

### **Current Lambda Functions**

| Lambda Function    | Current Location | Database Access  | External API Access   | VPC Requirement         |
| ------------------ | ---------------- | ---------------- | --------------------- | ----------------------- |
| **GraphQL**        | Private VPC      | ✅ RDS Required  | ❌ None               | ✅ **Must stay in VPC** |
| **OAuth Proxy**    | Private VPC      | ✅ User data     | ❌ None               | ✅ **Must stay in VPC** |
| **Stats Lambda**   | Private VPC      | ✅ Writes to RDS | ✅ Baseball Reference | 🔄 **Can move outside** |
| **Game Selection** | Private VPC      | ✅ Writes to RDS | ✅ Baseball Reference | 🔄 **Can move outside** |

### **Current Cost Structure**

- **NAT Gateway**: ~$45/month ($32 base + ~$13 data transfer)
- **Current VPC Endpoints**: $0
- **Total Network Costs**: ~$45/month

### **Current Issues**

- GraphQL Lambda experiencing `Runtime.NodeJsExit` errors (unsettled Promise)
- Potential NAT Gateway connection complexity contributing to timeouts
- High monthly costs for development environment

## 🚀 **Proposed Architecture**

### **Target Architecture**

```
Phase 1 - Core APIs (VPC + VPC Endpoints):
Internet → API Gateway → GraphQL/OAuth (Private VPC + VPC Endpoint) → RDS (Private)

Phase 2 - Scraping Functions (Outside VPC):
EventBridge/SQS → Stats/Game Selection (Public) → RDS (via Security Groups) + External APIs
```

### **New Cost Structure**

- **NAT Gateway**: $0 (removed)
- **Secrets Manager VPC Endpoint**: ~$7.20/month
- **Total Network Costs**: ~$7/month
- **Net Savings**: ~$38/month (84% reduction)

## 📋 **Implementation Plan**

### **Phase 1: Remove NAT Gateway (Immediate)**

**Estimated Time**: 30 minutes  
**Downtime**: 2-3 minutes during apply  
**Risk Level**: Low

#### **1.1 Add VPC Endpoints**

```hcl
# Add to terraform/vpc-endpoints.tf (new file)
resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private_lambda[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]

  private_dns_enabled = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-secretsmanager-endpoint"
  })
}

resource "aws_security_group" "vpc_endpoints" {
  name_prefix = "${local.name_prefix}-vpc-endpoints-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}
```

#### **1.2 Remove NAT Gateway Configuration**

```hcl
# Remove from terraform/vpc.tf:
# - aws_eip.nat resource
# - aws_nat_gateway.main resource
# - nat_gateway_id references in route tables

# Update route tables to remove NAT Gateway routes
resource "aws_route_table" "private_lambda" {
  count  = var.nat_gateway_count > 0 ? length(var.availability_zones) : 0
  vpc_id = aws_vpc.main.id

  # Remove the NAT Gateway route:
  # route {
  #   cidr_block     = "0.0.0.0/0"
  #   nat_gateway_id = aws_nat_gateway.main[0].id
  # }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-rt-private-lambda-${count.index + 1}"
  })
}
```

#### **1.3 Update terraform.tfvars**

```hcl
# Set NAT Gateway count to 0
nat_gateway_count = 0
```

#### **1.4 Test Core APIs**

- GraphQL endpoint functionality
- OAuth proxy functionality
- Database connectivity from VPC Lambdas

### **Phase 2: Move Scraping Lambdas Outside VPC (Follow-up)**

**Estimated Time**: 1 hour  
**Downtime**: None (gradual transition)  
**Risk Level**: Very Low

#### **2.1 Remove VPC Configuration from Scraping Lambdas**

```hcl
# Update terraform/lambda-stats.tf
resource "aws_lambda_function" "stats" {
  # ... existing config ...

  # Remove this block:
  # vpc_config {
  #   subnet_ids         = aws_subnet.private_lambda[*].id
  #   security_group_ids = [aws_security_group.lambda.id]
  # }

  # ... rest of config unchanged ...
}

# Update terraform/lambda-game-selection.tf
resource "aws_lambda_function" "game_selection" {
  # ... existing config ...

  # Remove this block:
  # vpc_config {
  #   subnet_ids         = aws_subnet.private_lambda[*].id
  #   security_group_ids = [aws_security_group.lambda.id]
  # }

  # ... rest of config unchanged ...
}
```

#### **2.2 Update Security Groups for External RDS Access**

```hcl
# Add to terraform/database.tf
resource "aws_security_group_rule" "rds_from_external_lambdas" {
  type              = "ingress"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]  # Or restrict to specific Lambda IP ranges
  security_group_id = aws_security_group.rds.id
  description       = "Allow access from external Lambda functions"
}
```

#### **2.3 Update IAM Roles**

```hcl
# Remove VPC execution role attachments from external Lambdas:
# - Remove aws_iam_role_policy_attachment.stats_lambda_vpc
# - Remove aws_iam_role_policy_attachment.game_selection_lambda_vpc
```

#### **2.4 Test External Functions**

- Baseball Reference scraping functionality
- Database write operations from external Lambdas
- SQS/EventBridge integrations

## 🧪 **Testing Strategy**

### **Phase 1 Testing Checklist**

- [ ] GraphQL endpoint responds: `POST https://dtx9mcsty1.execute-api.us-east-1.amazonaws.com/dev/graphql`
- [ ] OAuth proxy responds: `POST https://dtx9mcsty1.execute-api.us-east-1.amazonaws.com/dev/oauth`
- [ ] Database queries execute successfully
- [ ] Secrets Manager access works via VPC endpoint
- [ ] Lambda logs show no NAT Gateway timeouts

### **Phase 2 Testing Checklist**

- [ ] Stats Lambda can access Baseball Reference API
- [ ] Game Selection Lambda can scrape external data
- [ ] Database writes work from external Lambdas
- [ ] No increase in Lambda cold start times
- [ ] SQS message processing continues normally

## 📊 **Expected Benefits**

### **Cost Savings**

| Component     | Before     | After     | Monthly Savings |
| ------------- | ---------- | --------- | --------------- |
| NAT Gateway   | $45.00     | $0.00     | $45.00          |
| VPC Endpoints | $0.00      | $7.20     | -$7.20          |
| **Total**     | **$45.00** | **$7.20** | **$37.80**      |

### **Performance Improvements**

- **Reduced Lambda cold starts** (no VPC initialization for scraping functions)
- **Faster external API calls** (direct internet access vs NAT Gateway routing)
- **Simplified network path** (fewer potential failure points)
- **Potential fix for GraphQL timeout issues** (eliminates NAT Gateway complexity)

### **Security Improvements**

- **Reduced attack surface** (no NAT Gateway to compromise)
- **Network isolation** (core APIs completely isolated in VPC)
- **Principle of least privilege** (scraping functions only access what they need)

## ⚠️ **Risk Assessment**

### **Low Risk Areas**

- **Core API functionality**: GraphQL and OAuth remain fully functional in VPC
- **Database security**: RDS remains in private subnets with security group controls
- **Authentication**: All secrets access via secure VPC endpoints

### **Medium Risk Areas (Mitigated)**

- **External Lambda database access**: Mitigated by security group rules and monitoring
- **Network connectivity changes**: Mitigated by thorough testing and gradual rollout

### **Risk Mitigation Strategies**

1. **Implement Phase 1 first** to validate VPC endpoint functionality
2. **Test extensively in development** before production deployment
3. **Keep rollback plan ready** (restore NAT Gateway configuration if needed)
4. **Monitor Lambda metrics** during and after deployment

## 🔄 **Rollback Plan**

If issues arise, rollback is straightforward:

### **Phase 1 Rollback**

```bash
# Revert terraform.tfvars
nat_gateway_count = 1

# Apply Terraform to restore NAT Gateway
terraform apply -var-file="terraform.tfvars"
```

### **Phase 2 Rollback**

```bash
# Re-add VPC configuration to scraping Lambdas
# Remove external RDS security group rules
# Apply Terraform changes
```

## 📅 **Implementation Timeline**

### **Immediate (Today)**

- [ ] **Phase 1 Implementation** (30 minutes)
- [ ] **Testing & Validation** (15 minutes)
- [ ] **Monitor for 24 hours**

### **Follow-up (Within 1 week)**

- [ ] **Phase 2 Planning** (review scraping Lambda usage)
- [ ] **Phase 2 Implementation** (1 hour)
- [ ] **Final validation & monitoring**

## 📈 **Success Metrics**

### **Cost Metrics**

- [ ] AWS bill shows $37-38/month reduction in network costs
- [ ] VPC endpoint charges appear (~$7/month)
- [ ] No unexpected data transfer charges

### **Performance Metrics**

- [ ] GraphQL Lambda response times improve or remain stable
- [ ] External scraping functions show faster execution times
- [ ] Lambda error rates decrease (especially timeout errors)

### **Functional Metrics**

- [ ] All API endpoints remain fully operational
- [ ] Database connectivity maintained
- [ ] External data scraping continues successfully

## 🎯 **Conclusion**

This plan achieves the optimal balance of:

- **Significant cost savings** (~84% reduction in network costs)
- **Improved performance** (faster external calls, potential timeout fixes)
- **Enhanced security** (better network isolation)
- **Maintained functionality** (all current features preserved)

The two-phase approach minimizes risk while maximizing benefits, with clear rollback options at each stage.

**Recommendation**: Proceed with Phase 1 implementation immediately to capture cost savings and potentially resolve current Lambda issues.
