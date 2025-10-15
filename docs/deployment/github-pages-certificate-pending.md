# HTTPS Certificate Status: "Unavailable for your site because a certificate has not yet been issued for your domain"

## What This Error Means

✅ **Good news:** This is a **normal intermediate state**, not an error!

This message appears when:
1. ✅ Your DNS is configured correctly
2. ✅ GitHub Pages DNS check has passed
3. ✅ You've enabled "Enforce HTTPS"
4. ⏳ **GitHub is requesting the certificate from Let's Encrypt**

## What's Happening Behind the Scenes

```
[YOU] Enable "Enforce HTTPS" in GitHub Pages
   ↓
[GitHub] Requests certificate from Let's Encrypt
   ↓
[Let's Encrypt] Validates you own the domain
   ↓
[Let's Encrypt] Issues certificate (takes 15-60 minutes)
   ↓
[GitHub] Installs certificate on their CDN
   ↓
[YOUR SITE] HTTPS works! 🎉
```

## How Long Does It Take?

| Stage | Duration | Status |
|-------|----------|--------|
| DNS Check | 5-30 min | ✅ Complete (you passed this) |
| Certificate Request | Instant | ✅ Complete (GitHub sent request) |
| **Certificate Issuance** | **15-60 min** | ⏳ **You are here** |
| Certificate Installation | 1-5 min | ⏳ Pending |
| **Total from "Enforce HTTPS"** | **20-65 min** | **Typical: 30 min** |

## What You Should Do Now

### Option 1: Wait (Recommended)

**Just wait 30-60 minutes.** This is the normal process. GitHub Pages will:
1. Prove to Let's Encrypt you own `legacy-fantasy.com`
2. Receive the signed certificate
3. Install it on their CDN
4. Start serving HTTPS automatically

**Check back in 30 minutes by:**
- Visiting `https://legacy-fantasy.com`
- Looking for green padlock in browser
- Checking GitHub Pages settings for "Certificate issued" message

### Option 2: Verify Everything While Waiting

Run these checks to ensure everything is configured correctly:

```powershell
# 1. Verify DNS points to GitHub Pages
nslookup legacy-fantasy.com
# ✅ Should return: 185.199.108.153, 185.199.109.153, etc.

# 2. Check CAA records allow Let's Encrypt
nslookup -type=CAA legacy-fantasy.com
# ✅ Should show: 0 issue "letsencrypt.org"

# 3. Check CNAME file exists in deployment
curl https://bkrupa.github.io/legacy-sports/CNAME
# ✅ Should return: legacy-fantasy.com

# 4. Verify latest deployment succeeded
# Visit: https://github.com/bkrupa/legacy-sports/actions
# ✅ Latest "Deploy Web to GitHub Pages" should be green
```

### Option 3: Troubleshoot (If Still Failing After 2 Hours)

If after 2 hours you still see this message, something might be blocking certificate issuance.

**Common blockers:**

1. **CAA records not configured:**
   ```powershell
   cd terraform
   terraform state show aws_route53_record.caa
   # Should show letsencrypt.org
   ```

2. **Domain using CloudFlare proxy:**
   - Disable CloudFlare proxy (orange cloud)
   - Use DNS-only mode (gray cloud)

3. **Previous certificate conflict:**
   - Remove domain from GitHub Pages
   - Wait 10 minutes
   - Re-add domain
   - Wait for DNS check
   - Re-enable HTTPS

4. **GitHub Pages issue:**
   - Check: https://www.githubstatus.com
   - Look for incidents with GitHub Pages

## Current Status Checklist

Let's verify where you are in the process:

- [ ] **DNS Check:** ✅ Passed (green checkmark in GitHub Pages)
- [ ] **Enforce HTTPS:** ✅ Enabled (checkbox is checked)
- [ ] **Error Message:** ⏳ Shows "certificate has not yet been issued"
- [ ] **Time Elapsed:** ___ minutes since enabling HTTPS
- [ ] **Expected Wait:** 15-60 minutes total

**If you've waited less than 60 minutes:** ☕ Grab a coffee and wait!

**If you've waited more than 90 minutes:** Continue to troubleshooting below.

## Detailed Troubleshooting (After 90+ Minutes)

### Step 1: Verify DNS Configuration

```powershell
# Check A records
nslookup legacy-fantasy.com

# Should return exactly these IPs:
# 185.199.108.153
# 185.199.109.153
# 185.199.110.153
# 185.199.111.153
```

**If DNS is wrong:**
```powershell
cd terraform
terraform apply
# Then wait 30 minutes and try again
```

### Step 2: Check CAA Records

```powershell
nslookup -type=CAA legacy-fantasy.com

# Should show:
# legacy-fantasy.com certificate authority authorization
# = 0 issue "letsencrypt.org"
# = 0 issuewild "letsencrypt.org"
```

**If CAA is missing:**
```powershell
cd terraform
terraform state show aws_route53_record.caa
# If not found:
terraform apply
```

### Step 3: Verify CNAME File

GitHub Pages needs a CNAME file to know which domain you're using:

```powershell
# Check if CNAME exists in your deployment
curl https://bkrupa.github.io/legacy-sports/CNAME

# Should return exactly:
# legacy-fantasy.com
```

**If CNAME is missing:**
- Check `.github/workflows/deploy-web.yml` has CNAME creation step
- Re-run the deployment workflow
- Wait for deployment to complete

### Step 4: Reset GitHub Pages Configuration

Sometimes GitHub gets stuck. Reset it:

1. **Go to:** https://github.com/bkrupa/legacy-sports/settings/pages

2. **Remove custom domain:**
   - Click the ❌ next to `legacy-fantasy.com`
   - Click "Save"

3. **Wait 10 minutes** (important!)

4. **Re-add custom domain:**
   - Enter: `legacy-fantasy.com`
   - Click "Save"
   - Wait for DNS check (green checkmark)

5. **Re-enable HTTPS:**
   - Check "Enforce HTTPS"
   - Wait 30-60 minutes

### Step 5: Check GitHub Status

Sometimes GitHub Pages has issues:

1. Visit: https://www.githubstatus.com
2. Look for incidents with "GitHub Pages"
3. Check if SSL certificate provisioning is affected

### Step 6: Manual Certificate Verification

Check if Let's Encrypt can reach your domain:

1. Visit: https://letsdebug.net
2. Enter: `legacy-fantasy.com`
3. Click "Run Test"
4. Review any errors or warnings

## Understanding the GitHub Pages UI

When configuring custom domain, you'll see these states:

### State 1: Initial Configuration
```
Custom domain: [legacy-fantasy.com    ] [Save]
☐ Enforce HTTPS (unavailable until DNS check completes)
DNS check in progress...
```
**Action:** Wait for DNS check

### State 2: DNS Check Passed
```
Custom domain: legacy-fantasy.com
✅ DNS check successful
☐ Enforce HTTPS
```
**Action:** Check "Enforce HTTPS"

### State 3: Certificate Provisioning (YOU ARE HERE)
```
Custom domain: legacy-fantasy.com
✅ DNS check successful
☑ Enforce HTTPS
⚠️ Unavailable for your site because a certificate has not yet been issued for your domain
```
**Action:** Wait 30-60 minutes

### State 4: Success!
```
Custom domain: legacy-fantasy.com
✅ DNS check successful
☑ Enforce HTTPS
✅ HTTPS is active
Your site is published at https://legacy-fantasy.com
```
**Action:** Celebrate! 🎉 Then configure Google OAuth

## What NOT to Do

❌ **Don't repeatedly remove/re-add the domain** - This resets the process
❌ **Don't disable HTTPS while waiting** - Just leave it enabled
❌ **Don't change DNS while waiting** - Keep it stable
❌ **Don't use CloudFlare proxy** - Use DNS-only mode
❌ **Don't panic before 90 minutes** - Certificate issuance takes time

## When to Ask for Help

Seek help if:
- ⏰ More than 2 hours have passed
- ✅ All DNS checks pass
- ✅ CAA records are correct
- ✅ CNAME file exists
- ❌ Still showing "certificate has not yet been issued"

**Where to get help:**
- GitHub Support: https://support.github.com
- Let's Encrypt Community: https://community.letsencrypt.org
- Stack Overflow: Tag with `github-pages` and `lets-encrypt`

## After Certificate Is Issued

Once you see the green padlock (✅ HTTPS working):

1. **Verify certificate:**
   - Click padlock in browser
   - View certificate
   - Should say "Issued by: Let's Encrypt"
   - Expiry should be ~90 days in future

2. **Configure Google OAuth:**
   - See: `docs/google-oauth-domain-setup.md`
   - Add `https://legacy-fantasy.com` to authorized origins
   - Wait 10 minutes
   - Test Google One Tap

3. **Update environment variables:**
   ```env
   VITE_APP_URL=https://legacy-fantasy.com
   ```

4. **Test your site:**
   - Visit `https://legacy-fantasy.com`
   - Verify no mixed content warnings
   - Check Google One Tap appears
   - Sign in successfully

## Summary

**Current situation:**
- ✅ DNS is configured correctly (passed GitHub's check)
- ✅ You enabled "Enforce HTTPS"
- ⏳ **GitHub is requesting certificate from Let's Encrypt**
- ⏳ **This takes 30-60 minutes - YOU NEED TO WAIT**

**Next steps:**
1. ☕ Wait 30-60 minutes
2. ✅ Visit site and check for green padlock
3. 🎉 Configure Google OAuth once HTTPS works

---

**TL;DR:** This is NORMAL. Just wait 30-60 minutes. The certificate will be issued automatically.
