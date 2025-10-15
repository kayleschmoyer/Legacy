# Quick Fix: HTTPS Certificate for legacy-fantasy.com

## ⚡ TL;DR - Do This Now

Your site has an invalid certificate because GitHub Pages hasn't provisioned the Let's Encrypt certificate yet. Here's the fix:

### Step 1: Configure GitHub Pages (5 minutes)

1. **Go to:** https://github.com/bkrupa/legacy-sports/settings/pages

2. **Set Custom Domain:**
   - Find "Custom domain" section
   - Enter: `legacy-fantasy.com`
   - Click **"Save"**

3. **Wait for DNS Check:**
   - You'll see "DNS check in progress..."
   - **Wait until green checkmark appears** (5-30 minutes)
   - ⚠️ Do NOT proceed until you see the checkmark!
   - ⚠️ The "Enforce HTTPS" checkbox will be **grayed out/disabled** until DNS check passes

4. **Enable HTTPS:**
   - Once DNS check passes (green ✓), the "Enforce HTTPS" checkbox becomes available
   - Check the box: **"Enforce HTTPS"**
   - Certificate provisioning starts automatically
   - You'll see: "Unavailable for your site because a certificate has not yet been issued for your domain"
   - This is NORMAL - it means GitHub is requesting the certificate from Let's Encrypt

5. **Wait for Certificate:**
   - Takes 15-60 minutes
   - GitHub provisions free Let's Encrypt certificate
   - No action needed—it's automatic

### Step 2: Verify DNS (While Waiting)

```powershell
# Check if DNS points to GitHub Pages
nslookup legacy-fantasy.com

# Should return:
# 185.199.108.153
# 185.199.109.153
# 185.199.110.153
# 185.199.111.153
```

**If DNS is NOT pointing to GitHub Pages IPs:**

```powershell
cd terraform

# Make sure terraform.tfvars has:
# domain_name = "legacy-fantasy.com"
# github_username = "bkrupa"

# Apply DNS configuration
terraform apply
```

### Step 3: Configure Google OAuth (After HTTPS Works)

Once HTTPS is working (green padlock in browser):

1. **Go to:** https://console.cloud.google.com/apis/credentials

2. **Find OAuth Client:** `1025244625243-dpatg6bbda3g86sipjr6eis4olnp6rc3`

3. **Add Authorized JavaScript Origins:**
   ```
   https://legacy-fantasy.com
   https://www.legacy-fantasy.com
   ```

4. **Save** and wait 5-10 minutes

5. **Test:** Visit your site—One Tap should appear!

## 🕐 Timeline

| Step | Time | What's Happening |
|------|------|------------------|
| Configure GitHub Pages | 2 min | Add custom domain |
| DNS Check | 5-30 min | GitHub verifies DNS |
| Enable HTTPS | 1 min | Check the box |
| Certificate Provisioning | 15-60 min | Let's Encrypt issues cert |
| Google OAuth Config | 5 min | Add domain to authorized origins |
| Google Propagation | 5-10 min | Changes take effect |
| **Total** | **30 min - 2 hours** | Usually ~45 minutes |

## ✅ How to Know It's Working

### HTTPS is Working When:
- ✅ Visit `https://legacy-fantasy.com`
- ✅ Green padlock appears in browser
- ✅ No certificate warnings
- ✅ Click padlock → Certificate says "Let's Encrypt"

### One Tap is Working When:
- ✅ Visit site
- ✅ One Tap prompt appears within 2 seconds
- ✅ Shows "Sign in with Google" with your accounts
- ✅ Click to sign in successfully

## 🐛 If Something Goes Wrong

### DNS Check Failing?
```powershell
# Verify Terraform applied successfully
cd terraform
terraform state show aws_route53_record.apex

# Re-apply if needed
terraform apply
```

### Certificate Not Provisioning?

**Error: "Unavailable for your site because a certificate has not yet been issued for your domain"**

This means GitHub Pages hasn't requested the certificate yet. Follow these steps:

1. **Check DNS first:**
   ```powershell
   nslookup legacy-fantasy.com
   # MUST return: 185.199.108.153 (or similar GitHub IPs)
   ```

2. **If DNS is correct:**
   - Go to: https://github.com/bkrupa/legacy-sports/settings/pages
   - Verify custom domain is set to `legacy-fantasy.com`
   - Wait for "DNS check successful" (green checkmark)
   - ⚠️ **CRITICAL:** The "Enforce HTTPS" checkbox will be **disabled** until DNS check passes
   - Once DNS check passes, the checkbox becomes available
   - Check "Enforce HTTPS" and wait 15-60 minutes

3. **If DNS is NOT pointing to GitHub:**
   ```powershell
   cd terraform
   terraform apply
   # Wait 10-30 minutes for DNS propagation
   ```

4. **If DNS check keeps failing:**
   - Remove domain from GitHub Pages settings
   - Wait 5 minutes
   - Re-add `legacy-fantasy.com`
   - Click "Save"
   - Wait for DNS check to complete

### One Tap Still Not Showing?
- Clear browser cache
- Check browser console for errors
- Verify HTTPS is working (green padlock)
- Wait 10 minutes after adding domain to Google Console

## 📚 Full Documentation

- **HTTPS Setup:** `docs/https-certificate-setup.md`
- **Google OAuth Setup:** `docs/google-oauth-domain-setup.md`
- **DNS/Route 53:** `docs/route53-setup-quickstart.md`

## 🎯 Current Status of Your Deployment

✅ **Already Configured:**
- DNS records in Terraform (`terraform/route53.tf`)
- CNAME file in deployment (`.github/workflows/deploy-web.yml`)
- CAA records for Let's Encrypt
- Web app builds and deploys automatically

❓ **Needs Verification:**
- [ ] DNS records actually applied? (`terraform apply`)
- [ ] Custom domain set in GitHub Pages?
- [ ] "Enforce HTTPS" enabled in GitHub Pages?
- [ ] Domain added to Google OAuth Console?

## 🚀 Next Actions (In Order)

1. **Now:** Configure GitHub Pages custom domain
2. **Wait 30 min:** Let certificate provision
3. **Then:** Add domain to Google OAuth Console
4. **Wait 10 min:** Let Google changes propagate
5. **Test:** Visit site and verify One Tap works!

---

**Need help?** Check the detailed guides in the `docs/` folder or open an issue.
