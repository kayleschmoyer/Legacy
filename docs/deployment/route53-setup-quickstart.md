# Route 53 + GitHub Pages Quick Reference

## 🎯 What You Need to Do

### 1. Add Your Domain to Terraform Config

Edit `terraform/terraform.tfvars` and add:

```hcl
domain_name     = "your-actual-domain.com"  # ← Replace this!
github_username = "bkrupa"
```

### 2. Import Your Existing Route 53 Zone

```powershell
# Find your zone ID
aws route53 list-hosted-zones

# Import it
cd terraform
terraform import aws_route53_zone.main Z1234567890ABC
```

### 3. Apply Terraform Configuration

```powershell
cd terraform
terraform plan    # Review changes
terraform apply   # Create DNS records
```

### 4. Configure GitHub Pages

1. Go to: https://github.com/bkrupa/legacy-sports/settings/pages
2. Under "Custom domain", enter: `your-actual-domain.com`
3. Click "Save"
4. Wait for DNS check to pass
5. Enable "Enforce HTTPS"

### 5. Wait for DNS Propagation

DNS changes take 5-60 minutes to propagate globally. Check status:

```powershell
nslookup your-actual-domain.com
# Should return: 185.199.108.153 (and other GitHub IPs)
```

## 📋 DNS Records Created

- **A records** (4x): Point root domain to GitHub Pages IPs
- **CNAME www**: Points www subdomain to GitHub Pages
- **CNAME api**: Points api subdomain to your API Gateway (optional)
- **CAA**: Allows Let's Encrypt to issue SSL certificates

## ✅ How to Verify It Worked

1. Visit `https://your-actual-domain.com` in browser
2. Should load your web app with valid SSL (green padlock)
3. Automatically deploys when you push to `main` branch

## 💰 Cost

- **$0.50/month** for Route 53 hosted zone
- **$0.40 per million** DNS queries
- **Domain registration cost** (annual, varies by TLD)

GitHub Pages hosting is **FREE** for public repositories!

## 🔗 Full Documentation

See: `docs/deployment/route53-github-pages-setup.md`

## 🆘 Common Issues

**GitHub DNS check failing?**

- Wait 15-30 minutes for DNS propagation
- Verify Terraform applied successfully
- Check name servers match in Route 53

**SSL not working?**

- Ensure "Enforce HTTPS" is enabled in GitHub Pages
- Wait 15-30 minutes for certificate provisioning
- Check CAA records exist (Terraform creates these)

**Can't access api.yourdomain.com?**

- Verify API Gateway is deployed
- Check CNAME points to correct API Gateway endpoint
- Test direct API Gateway URL first

---

**Questions?** Check the full guide at `docs/deployment/route53-github-pages-setup.md`
