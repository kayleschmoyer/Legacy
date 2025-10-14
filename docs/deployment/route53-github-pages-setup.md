# Route 53 Domain + GitHub Pages Setup Guide

This guide covers setting up a custom domain with AWS Route 53 and pointing it to your GitHub Pages deployment.

## 📋 Prerequisites

- AWS Route 53 domain registered (✅ Complete)
- GitHub Pages deployment configured (✅ Complete - via `.github/workflows/deploy-web.yml`)
- Terraform installed and configured

## 🎯 Overview

Your web application is currently deployed to GitHub Pages automatically via CI/CD. We'll configure DNS to point your custom domain to this deployment.

**Architecture:**
```
Custom Domain (Route 53)
    ↓
GitHub Pages (185.199.108-111.153)
    ↓
Your Web App (dist/apps/web)
```

## 🚀 Step-by-Step Setup

### Step 1: Import Existing Route 53 Hosted Zone

If you registered your domain through Route 53, it automatically created a hosted zone. Import it into Terraform:

```powershell
# Find your hosted zone ID in AWS Console or CLI
aws route53 list-hosted-zones

# Import the zone into Terraform
cd terraform
terraform import aws_route53_zone.main <YOUR-ZONE-ID>
```

### Step 2: Configure Domain Variables

Add your domain to `terraform/terraform.tfvars`:

```hcl
# Add to terraform.tfvars
domain_name      = "yourdomain.com"  # Replace with your actual domain
github_username  = "bkrupa"          # Your GitHub username/org
```

### Step 3: Review and Apply DNS Configuration

```powershell
cd terraform

# Review what will be created
terraform plan

# Expected resources:
# - aws_route53_zone.main (imported)
# - aws_route53_record.apex (4 A records for GitHub Pages IPs)
# - aws_route53_record.www (CNAME to GitHub Pages)
# - aws_route53_record.api (CNAME to API Gateway)
# - aws_route53_record.caa (SSL certificate authorization)

# Apply the configuration
terraform apply
```

### Step 4: Configure GitHub Pages Custom Domain

After DNS records are created:

1. **Go to GitHub Repository Settings:**
   - Navigate to: `https://github.com/bkrupa/legacy-sports/settings/pages`
   
2. **Set Custom Domain:**
   - Enter your domain: `yourdomain.com`
   - Click "Save"
   - Wait for DNS check to pass (may take a few minutes)

3. **Enable HTTPS:**
   - Once DNS check passes, check "Enforce HTTPS"
   - GitHub will automatically provision a Let's Encrypt SSL certificate

### Step 5: Update Application Environment Variables

Update your web app's environment variables to use the custom domain:

```env
# In .env.local or CI/CD secrets
VITE_APP_URL=https://yourdomain.com
```

Update API endpoints in `terraform.tfvars` if using custom API subdomain:

```hcl
# Example: Use custom domain for API
# VITE_GRAPHQL_HOST=https://api.yourdomain.com/graphql
```

### Step 6: Verify Configuration

After DNS propagation (5-60 minutes), verify:

```powershell
# Check DNS records
nslookup yourdomain.com
# Should return GitHub Pages IPs: 185.199.108-111.153

nslookup www.yourdomain.com
# Should return CNAME to bkrupa.github.io

nslookup api.yourdomain.com
# Should return CNAME to API Gateway
```

**Browser test:**
- Visit `https://yourdomain.com` - Should load your web app
- Visit `https://www.yourdomain.com` - Should redirect to apex domain
- Check SSL certificate is valid (green padlock)

## 📁 Files Modified

- ✅ `terraform/route53.tf` - DNS configuration
- ✅ `terraform/variables.tf` - Domain variables
- ⚠️ `terraform/terraform.tfvars` - **YOU NEED TO ADD:** `domain_name` and `github_username`

## 🔧 DNS Records Created

| Record Type | Name | Value | Purpose |
|-------------|------|-------|---------|
| A | @ | 185.199.108-111.153 | GitHub Pages apex domain |
| CNAME | www | bkrupa.github.io | WWW subdomain |
| CNAME | api | <api-gateway-id>.execute-api.us-east-1.amazonaws.com | Custom API domain |
| CAA | @ | letsencrypt.org | SSL certificate authorization |

## 🎨 Advanced Options

### Option A: Use Subdomain Instead of Root

If you want to use `app.yourdomain.com` instead of root domain:

```hcl
# Modify route53.tf
resource "aws_route53_record" "app" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "app"
  type    = "CNAME"
  ttl     = 300
  records = ["bkrupa.github.io"]
}
```

In GitHub Pages settings, use: `app.yourdomain.com`

### Option B: Custom API Gateway Domain

For a fully custom API domain (requires ACM certificate):

```hcl
# Add to terraform/api_gateway.tf

resource "aws_acm_certificate" "api" {
  domain_name       = "api.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_domain_name" "api" {
  domain_name              = "api.${var.domain_name}"
  certificate_arn          = aws_acm_certificate.api.arn
}

resource "aws_api_gateway_base_path_mapping" "api" {
  api_id      = aws_api_gateway_rest_api.main.id
  stage_name  = aws_api_gateway_stage.main.stage_name
  domain_name = aws_api_gateway_domain_name.api.domain_name
}
```

### Option C: CDN with CloudFront (Better Performance)

For improved global performance, add CloudFront in front of GitHub Pages:

```hcl
# This would require additional configuration
# Benefits: Global CDN, custom SSL, faster load times
# Cost: ~$1-5/month depending on traffic
```

## 🐛 Troubleshooting

### DNS Not Resolving

**Issue:** `nslookup` doesn't return GitHub Pages IPs

**Solutions:**
1. Wait 5-60 minutes for DNS propagation
2. Check name servers match in Route 53 and domain registrar:
   ```powershell
   terraform output route53_name_servers
   ```
3. Update name servers in Route 53 domain registration if needed

### GitHub Pages DNS Check Failing

**Issue:** GitHub says "DNS check unsuccessful"

**Solutions:**
1. Ensure DNS records are applied: `terraform apply`
2. Wait for DNS propagation
3. Remove and re-add custom domain in GitHub settings
4. Verify CAA records allow Let's Encrypt

### SSL Certificate Not Provisioning

**Issue:** "Not secure" warning in browser

**Solutions:**
1. Ensure HTTPS is enforced in GitHub Pages settings
2. Check CAA records allow `letsencrypt.org`
3. Wait 15-60 minutes for certificate provisioning
4. Try removing and re-adding custom domain

### API Subdomain Not Working

**Issue:** `api.yourdomain.com` returns error

**Solutions:**
1. Verify API Gateway is deployed: `terraform apply`
2. Check CNAME record points to correct API Gateway endpoint
3. Test direct API Gateway URL first: `https://<api-id>.execute-api.us-east-1.amazonaws.com/dev/graphql`

## 💰 Cost Estimate

| Service | Cost | Notes |
|---------|------|-------|
| Route 53 Hosted Zone | $0.50/month | Per hosted zone |
| Route 53 Queries | $0.40/million | First billion queries |
| Domain Registration | $12-50/year | Varies by TLD (.com, .io, etc.) |
| **Total Monthly** | **~$1-2** | Plus annual domain cost |

GitHub Pages is free for public repos!

## 📚 Additional Resources

- [GitHub Pages Custom Domain Docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
- [AWS Route 53 Documentation](https://docs.aws.amazon.com/route53/)
- [Your Deploy Workflow](.github/workflows/deploy-web.yml)
- [Terraform AWS Provider - Route 53](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route53_zone)

## ✅ Next Steps After Setup

1. **Update Documentation:**
   - Add domain to main README.md
   - Update API endpoint documentation

2. **Configure Monitoring:**
   - Set up Route 53 health checks (optional)
   - Configure CloudWatch alarms for DNS queries

3. **SEO Considerations:**
   - Add `robots.txt` to your web app
   - Configure `sitemap.xml`
   - Set up Google Search Console with your domain

4. **Security:**
   - Consider adding security.txt
   - Configure DNSSEC (optional)
   - Review CAA records

## 🎉 Success Criteria

- ✅ `https://yourdomain.com` loads your web application
- ✅ SSL certificate shows as valid (green padlock)
- ✅ DNS records managed in Terraform
- ✅ CI/CD deploys update the site automatically
- ✅ API accessible via `https://api.yourdomain.com` (optional)

---

**Need Help?**
- Check Terraform outputs: `terraform output`
- View Route 53 console: https://console.aws.amazon.com/route53/
- GitHub Pages settings: https://github.com/bkrupa/legacy-sports/settings/pages
