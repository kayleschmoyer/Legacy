# HTTPS Certificate Setup for GitHub Pages

## The Problem

Your site shows an **invalid certificate error** because GitHub Pages hasn't provisioned an SSL certificate yet. This prevents Google One Tap authentication from working.

## Why GitHub Pages for HTTPS?

GitHub Pages provides **free, automatic HTTPS** using Let's Encrypt certificates:

- ✅ **Free SSL certificates** (auto-renewed every 90 days)
- ✅ **Automatic provisioning** (no manual certificate management)
- ✅ **Zero configuration** (works out of the box)
- ✅ **Trusted by all browsers** (Let's Encrypt is globally trusted)

## Complete Setup Guide

### Step 1: Verify DNS Configuration

First, ensure your DNS is properly configured to point to GitHub Pages.

#### Check Current DNS Settings

```powershell
# Check if domain points to GitHub Pages
nslookup legacy-fantasy.com

# Should return these GitHub Pages IPs:
# 185.199.108.153
# 185.199.109.153
# 185.199.110.153
# 185.199.111.153
```

#### Configure DNS with Terraform (If Not Already Done)

```powershell
cd terraform

# Edit terraform.tfvars and add:
# domain_name = "legacy-fantasy.com"
# github_username = "bkrupa"

# Import your existing Route 53 hosted zone
aws route53 list-hosted-zones
terraform import aws_route53_zone.main <YOUR-ZONE-ID>

# Apply DNS configuration
terraform plan
terraform apply
```

**DNS Records Created by Terraform:**

- ✅ A records → GitHub Pages IPs (4 records)
- ✅ CNAME www → bkrupa.github.io
- ✅ CAA records → Allow Let's Encrypt to issue certificates

### Step 2: Configure GitHub Pages Custom Domain

This is the critical step for HTTPS certificate provisioning.

1. **Navigate to GitHub Pages Settings:**

   ```
   https://github.com/bkrupa/legacy-sports/settings/pages
   ```

2. **Add Custom Domain:**
   - Under "Custom domain" section
   - Enter: `legacy-fantasy.com`
   - Click **"Save"**
   - ⚠️ **Do NOT enable HTTPS yet!**

3. **Wait for DNS Check:**
   - GitHub will verify DNS records
   - Shows "DNS check in progress..."
   - Wait until you see **green checkmark** "DNS check successful"
   - This can take **5-30 minutes**

4. **Enable HTTPS Enforcement:**
   - Once DNS check passes (green checkmark appears)
   - Check the box **"Enforce HTTPS"**
   - GitHub automatically requests a Let's Encrypt certificate
   - Certificate provisioning takes **15-60 minutes**

5. **Verify Certificate:**
   - Wait 15-60 minutes
   - Visit `https://legacy-fantasy.com`
   - Check for **green padlock** in browser address bar
   - Click padlock → View certificate → Should say "Let's Encrypt"

### Step 3: Troubleshooting Common Issues

#### Issue 1: "DNS check unsuccessful"

**Symptoms:**

- Red X or "DNS check unsuccessful" in GitHub Pages settings

**Solutions:**

1. **Verify DNS propagation:**

   ```powershell
   nslookup legacy-fantasy.com
   # Should return GitHub Pages IPs: 185.199.108.153, etc.
   ```

2. **Check DNS from different location:**

   ```powershell
   # Use Google's DNS
   nslookup legacy-fantasy.com 8.8.8.8
   ```

3. **Wait longer:**
   - DNS changes can take up to 48 hours globally
   - Usually 5-30 minutes for Route 53

4. **Verify Route 53 configuration:**

   ```powershell
   cd terraform
   terraform state show aws_route53_record.apex
   ```

5. **Re-apply Terraform:**
   ```powershell
   terraform apply
   ```

#### Issue 2: Certificate Not Provisioning

**Symptoms:**

- "Enforce HTTPS" checkbox available but site still shows certificate error
- Certificate is for wrong domain or GitHub's domain

**Solutions:**

1. **Check CAA records:**

   ```powershell
   nslookup -type=CAA legacy-fantasy.com
   # Should show: 0 issue "letsencrypt.org"
   ```

2. **Remove and re-add domain:**
   - Go to GitHub Pages settings
   - Click "Remove" next to custom domain
   - Wait 5 minutes
   - Re-add `legacy-fantasy.com`
   - Wait for DNS check
   - Enable HTTPS enforcement

3. **Verify no conflicting certificates:**
   - GitHub Pages can't provision if domain is already using another certificate
   - Remove any CloudFlare or other CDN proxy

4. **Check GitHub Pages deployment:**
   ```powershell
   # Ensure latest deployment succeeded
   # Check: https://github.com/bkrupa/legacy-sports/actions
   ```

#### Issue 3: "Mixed Content" Warnings

**Symptoms:**

- Site loads but some resources blocked
- Browser console shows mixed content errors

**Solutions:**

1. **Check all resources use HTTPS:**
   - Images: `https://...`
   - Scripts: `https://...`
   - Stylesheets: `https://...`

2. **Update environment variables:**
   ```env
   # Ensure all URLs use HTTPS
   VITE_OAUTH_PROXY_URL=https://...
   VITE_GRAPHQL_HOST=https://...
   ```

#### Issue 4: Certificate for Wrong Domain

**Symptoms:**

- Certificate shows `bkrupa.github.io` instead of `legacy-fantasy.com`
- Browser says "Certificate is not valid for this domain"

**Solutions:**

1. **Verify custom domain is saved in GitHub:**
   - Check GitHub Pages settings
   - Domain should show: `legacy-fantasy.com`

2. **Check CNAME file in deployed site:**

   ```powershell
   # Should contain your domain
   curl https://bkrupa.github.io/legacy-sports/CNAME
   ```

3. **Ensure deployment includes CNAME:**
   - Check `.github/workflows/deploy-web.yml`
   - Should create CNAME file with your domain

### Step 4: Verification Checklist

After setup, verify everything is working:

- [ ] **DNS Resolution:**

  ```powershell
  nslookup legacy-fantasy.com
  # Returns: 185.199.108.153 (or similar GitHub IP)
  ```

- [ ] **HTTPS Loads:**

  ```powershell
  curl -I https://legacy-fantasy.com
  # Returns: HTTP/2 200 (or 301 redirect)
  ```

- [ ] **Certificate Valid:**
  - Visit `https://legacy-fantasy.com` in browser
  - Green padlock visible
  - No certificate warnings

- [ ] **Certificate Details:**
  - Issued to: `legacy-fantasy.com`
  - Issued by: `Let's Encrypt`
  - Expiry: ~90 days in future

- [ ] **No Mixed Content:**
  - Browser console has no HTTPS warnings
  - All resources load over HTTPS

- [ ] **GitHub Pages Check:**
  - Visit: https://github.com/bkrupa/legacy-sports/settings/pages
  - Shows: "Your site is published at https://legacy-fantasy.com"
  - "Enforce HTTPS" is checked

## Timeline Expectations

| Phase                           | Duration             | What Happens                            |
| ------------------------------- | -------------------- | --------------------------------------- |
| **1. DNS Update**               | 5-30 min             | Terraform applies DNS records           |
| **2. DNS Propagation**          | 5-30 min             | DNS resolves to GitHub Pages IPs        |
| **3. GitHub DNS Check**         | 5-15 min             | GitHub verifies DNS configuration       |
| **4. Certificate Request**      | Instant              | GitHub requests Let's Encrypt cert      |
| **5. Certificate Provisioning** | 15-60 min            | Let's Encrypt validates and issues cert |
| **Total Time**                  | **30 min - 2 hours** | Typical: 45 minutes                     |

⚠️ **Important:** Do NOT enable "Enforce HTTPS" until DNS check passes (green checkmark)!

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     User Browser                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ HTTPS Request
                     │ https://legacy-fantasy.com
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    Route 53 DNS                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ A Records → 185.199.108-111.153                   │  │
│  │ CAA Records → letsencrypt.org                     │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Routes to GitHub Pages IP
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  GitHub Pages CDN                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 1. Checks custom domain config                    │  │
│  │ 2. Serves Let's Encrypt certificate               │  │
│  │ 3. Delivers your web app (dist/apps/web)         │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                     │
                     │ Automatic Certificate Renewal
                     ▼
┌─────────────────────────────────────────────────────────┐
│                Let's Encrypt CA                         │
│  - Issues free SSL certificates                         │
│  - Renews automatically every 90 days                   │
│  - Trusted by all major browsers                        │
└─────────────────────────────────────────────────────────┘
```

## Advanced: Manual Certificate (Not Recommended)

If you absolutely cannot use GitHub Pages HTTPS, alternatives include:

### Option A: CloudFlare (Free CDN + Certificate)

- Add domain to CloudFlare
- Enable "Full" SSL mode
- Use CloudFlare nameservers
- ⚠️ Requires changing DNS provider

### Option B: AWS CloudFront + ACM

- Request certificate in AWS Certificate Manager
- Create CloudFront distribution
- Point domain to CloudFront
- 💰 Costs ~$1-5/month

### Option C: Custom Server with Certbot

- Deploy to EC2/Docker
- Install Certbot
- Run Let's Encrypt verification
- 💰 Costs ~$5-20/month for server

**Recommendation:** Stick with GitHub Pages—it's free, automatic, and well-supported.

## Cost Breakdown

| Service                  | Cost             | Notes                        |
| ------------------------ | ---------------- | ---------------------------- |
| **GitHub Pages Hosting** | $0/month         | Free for public repos        |
| **SSL Certificate**      | $0/month         | Free Let's Encrypt cert      |
| **Route 53 Hosted Zone** | $0.50/month      | DNS management               |
| **Route 53 Queries**     | ~$0.01/month     | First million free tier      |
| **Total**                | **~$0.50/month** | Cheapest production hosting! |

## Next Steps After HTTPS Is Working

1. **Add domain to Google OAuth Console:**
   - See: `docs/google-oauth-domain-setup.md`
   - Add `https://legacy-fantasy.com` to authorized origins

2. **Update environment variables:**

   ```env
   VITE_OAUTH_PROXY_URL=https://your-api-gateway.com
   VITE_APP_URL=https://legacy-fantasy.com
   ```

3. **Test Google One Tap:**
   - Visit your site
   - One Tap should appear within 2 seconds
   - Sign in successfully

4. **Enable security headers:**
   - Consider adding security.txt
   - Configure Content Security Policy (CSP)

## Support

**GitHub Pages Issues:**

- Docs: https://docs.github.com/en/pages
- Support: https://support.github.com

**Let's Encrypt Issues:**

- Community: https://community.letsencrypt.org
- Status: https://letsencrypt.status.io

**AWS Route 53 Issues:**

- Docs: https://docs.aws.amazon.com/route53/
- Support: AWS Support console

## Related Documentation

- `docs/google-oauth-domain-setup.md` - Configure Google OAuth for your domain
- `docs/route53-setup-quickstart.md` - Route 53 quick start
- `docs/deployment/route53-github-pages-setup.md` - Detailed DNS setup
- `.github/workflows/deploy-web.yml` - Auto-deployment workflow
