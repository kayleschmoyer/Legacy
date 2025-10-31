# Deployment Documentation

This directory contains AWS infrastructure and deployment documentation for the Legacy Sports platform.

## 📑 Contents

### AWS Infrastructure

- **[AWS Infrastructure](aws-infrastructure.md)** - Complete AWS setup and architecture
- **[Cost Optimization](cost-optimization.md)** - Strategies for managing AWS costs
- **[Infrastructure Changelog](infrastructure-changelog.md)** - History of infrastructure changes
- **[NAT Gateway Removal Plan](nat-gateway-removal-plan.md)** - Network optimization strategy

### Lambda Functions

- **[Lambda Build Strategy](lambda-build-strategy.md)** - Building and packaging Lambda functions
- **[S3 Lambda Deployment](s3-lambda-deployment.md)** - S3-based deployment workflow

### DNS & Certificates

- **[Route53 Setup Quickstart](route53-setup-quickstart.md)** - Quick DNS setup guide
- **[Route53 GitHub Pages Setup](route53-github-pages-setup.md)** - GitHub Pages with custom domain
- **[Route53 Implementation Summary](route53-implementation-summary.md)** - DNS implementation details
- **[HTTPS Certificate Setup](https-certificate-setup.md)** - SSL/TLS certificate configuration
- **[GitHub Pages Certificate Pending](github-pages-certificate-pending.md)** - Certificate status
- **[Quick Fix HTTPS](QUICK-FIX-HTTPS.md)** - Emergency HTTPS fixes

### Security & Best Practices

- **[Deployment Security](deployment-security.md)** - Production security guidelines
- **[Headless Development](headless-development.md)** - Headless/CI environment setup

### Release Plans

- **[Custom Scoring Rollout Plan](custom-scoring-rollout-plan.md)** - End-to-end launch checklist for LS-6 custom scoring

### Infrastructure as Code

- **[Terraform →](terraform/)** - Complete Terraform documentation
  - Lambda deployment
  - State management
  - Lock management
  - Quick reference

## 🎯 Quick Start

### Understanding Infrastructure

1. Start with [AWS Infrastructure](aws-infrastructure.md)
2. Review [Lambda Build Strategy](lambda-build-strategy.md)
3. Understand [Terraform](terraform/) for IaC

### Deploying Lambda Functions

1. Build: Follow [Lambda Build Strategy](lambda-build-strategy.md)
2. Deploy: Use [Terraform Lambda Deployment](terraform/terraform-lambda-deployment.md)
3. Verify: Check CloudWatch logs

### Setting Up DNS

1. Configure Route53: [Route53 Setup Quickstart](route53-setup-quickstart.md)
2. Set up HTTPS: [HTTPS Certificate Setup](https-certificate-setup.md)
3. Verify DNS resolution

### Managing Infrastructure with Terraform

1. Navigate to [Terraform Directory](terraform/)
2. Follow setup in [Terraform Backend Setup](terraform/terraform-backend-setup.md)
3. Deploy with [Terraform Lambda Deployment](terraform/terraform-lambda-deployment.md)

## 🔗 Related Documentation

### Development

- [Build System](../architecture/build-system.md) - Understanding builds
- [CI/CD System](../ci-cd/) - Automation pipelines
- [Build & Tooling](../build-and-tooling/) - Build optimization

### Security

- [Security Documentation](../security/) - Security scanning and audits
- [GitHub Secrets Guide](../security/GITHUB_SECRETS_GUIDE.md) - Managing secrets
- [Security & Secrets](../guides/security-and-secrets.md) - Dev security

## 💡 Common Tasks

### Deploy Lambda Function

1. Build code per [Lambda Build Strategy](lambda-build-strategy.md)
2. Package with dependencies
3. Deploy via [Terraform](terraform/terraform-lambda-deployment.md)
4. Test endpoint
5. Monitor CloudWatch logs

### Update Infrastructure

1. Modify Terraform files in [terraform/](terraform/)
2. Run `terraform plan` to preview
3. Review changes for cost impact
4. Run `terraform apply` if approved
5. Update [Infrastructure Changelog](infrastructure-changelog.md)

### Set Up HTTPS

1. Request certificate in ACM
2. Follow [HTTPS Certificate Setup](https-certificate-setup.md)
3. Configure CloudFront or ALB
4. Verify SSL/TLS
5. Update DNS records

### Optimize AWS Costs

1. Review [Cost Optimization](cost-optimization.md)
2. Check [NAT Gateway Removal Plan](nat-gateway-removal-plan.md)
3. Monitor AWS Cost Explorer
4. Implement recommendations
5. Track savings

### Troubleshoot Deployment Issues

1. Check CloudWatch logs
2. Verify IAM permissions
3. Review [Deployment Security](deployment-security.md)
4. Test with curl or Postman
5. Check [Troubleshooting Guide](../guides/troubleshooting.md)

## ☁️ AWS Services Used

### Compute

- **Lambda**: Serverless functions for API and auth
- **API Gateway**: REST and HTTP API routing

### Storage

- **S3**: Static asset hosting and Lambda deployment packages
- **RDS**: PostgreSQL database

### Networking

- **VPC**: Network isolation
- **Route53**: DNS management
- **CloudFront**: CDN (optional)

### Security

- **IAM**: Identity and access management
- **ACM**: SSL/TLS certificates
- **Secrets Manager**: Sensitive data storage

### Monitoring

- **CloudWatch**: Logs and metrics
- **X-Ray**: Distributed tracing (optional)

## 🏗️ Infrastructure Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Route53 (DNS)                    │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│              API Gateway (REST/HTTP)                │
└─────────────────────┬───────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │                           │
┌───────▼────────┐         ┌────────▼───────┐
│  Lambda (API)  │         │ Lambda (Auth)  │
└───────┬────────┘         └────────┬───────┘
        │                           │
        └───────────┬───────────────┘
                    │
        ┌───────────▼────────────┐
        │   RDS PostgreSQL       │
        │   (Private Subnet)     │
        └────────────────────────┘
```

## 🔒 Security Best Practices

- **Least Privilege**: IAM roles with minimum permissions
- **Encryption**: Encrypt data at rest and in transit
- **Secrets**: Use Secrets Manager, never hardcode
- **Network**: Use VPC, security groups, NACLs
- **Monitoring**: Enable CloudWatch logs and alarms
- **Auditing**: Enable CloudTrail for audit logs

See [Deployment Security](deployment-security.md) for details.

---

[← Back to Documentation Hub](../README.md)
