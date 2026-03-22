# Google OAuth Domain Configuration for One Tap

## Problem

Google One Tap authentication not displaying on deployed site `legacy-fantasy.com`

## Root Cause

Google Identity Services (GSI) One Tap requires all domains to be explicitly authorized in Google Cloud Console.

## Solution

### 1. Configure Google Cloud Console

1. **Navigate to Credentials:**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Select your project

2. **Edit OAuth 2.0 Client ID:**
   - Find client ID: `1025244625243-dpatg6bbda3g86sipjr6eis4olnp6rc3`
   - Click to edit

3. **Add Authorized JavaScript Origins:**

   ```
   https://legacy-fantasy.com
   https://www.legacy-fantasy.com
   ```

4. **Add Authorized Redirect URIs (optional for callback flow):**

   ```
   https://legacy-fantasy.com/oauth-callback.html
   https://www.legacy-fantasy.com/oauth-callback.html
   ```

5. **Save changes** and wait 5-10 minutes for propagation

### 2. Verify Configuration

#### Check Browser Console

Open DevTools on your deployed site and look for:

**Success indicators:**

```
WebOAuthProvider.signIn() called - using Google Identity Services authorization code flow
One Tap initialized successfully
```

**Error indicators:**

```
[GSI] Not a valid origin for the client
[GSI] Unauthorized domain
```

#### Test One Tap Display

1. Clear browser cache
2. Visit `https://legacy-fantasy.com`
3. One Tap should appear within 1-2 seconds on page load

### 3. Common Issues & Solutions

#### One Tap Not Appearing

**Possible reasons:**

- Domain not yet propagated (wait 10 minutes after adding)
- User previously dismissed One Tap on this domain (cooldown period)
- Browser blocking third-party cookies
- User not signed into any Google accounts in browser

**Debug steps:**

```javascript
// Run in browser console on your site:
console.log('Current hostname:', window.location.hostname);
console.log('GSI loaded:', !!window.google?.accounts);
```

#### FedCM Errors

If you see `dismissed_moment_fedcm_disabled`, this is normal and handled gracefully. The code automatically disables FedCM for localhost but keeps it enabled for production domains.

### 4. Environment Variables

Ensure your build has the correct Google Client ID:

**In `.env` or build configuration:**

```bash
VITE_GOOGLE_CLIENT_ID=1025244625243-dpatg6bbda3g86sipjr6eis4olnp6rc3.apps.googleusercontent.com
```

**Verify in deployed build:**

```javascript
// Check in browser console:
import.meta.env.VITE_GOOGLE_CLIENT_ID;
```

### 5. Code References

The One Tap initialization happens in:

- `lib/shared-components/src/platform-components/web/WebOAuthProvider.ts`
  - Line 197-270: `initializeOneTap()` method
  - Line 117-134: Configuration on page load

The configuration is set in:

- `apps/web/src/config/environment.ts` - Environment config
- `apps/web/src/main.tsx` - App initialization with OAuth config

## Requirements Checklist

- [ ] **HTTPS properly configured** (see GitHub Pages setup below)
- [ ] Domain added to Google Cloud Console "Authorized JavaScript origins"
- [ ] Google Client ID environment variable set correctly
- [ ] 5-10 minutes wait time after Google Console changes
- [ ] Browser cache cleared
- [ ] User signed into Google account in browser

## HTTPS Certificate Setup (CRITICAL)

Google One Tap **requires valid HTTPS**. If you see certificate errors, follow these steps:

### GitHub Pages HTTPS Setup

1. **Go to GitHub Pages Settings:**
   - Visit: https://github.com/bkrupa/legacy-sports/settings/pages

2. **Configure Custom Domain:**
   - Under "Custom domain", enter: `legacy-fantasy.com`
   - Click "Save"
   - **Wait for DNS check to complete** (this is critical!)

3. **Enable HTTPS Enforcement:**
   - Once DNS check shows green checkmark (may take 5-30 minutes)
   - Check the box "Enforce HTTPS"
   - GitHub will automatically provision a **free Let's Encrypt certificate**
   - Certificate provisioning takes 15-60 minutes

4. **Verify Certificate:**
   - Visit `https://legacy-fantasy.com`
   - Check for green padlock in browser
   - Click padlock → Certificate should show "Let's Encrypt"

### DNS Requirements

For GitHub Pages HTTPS to work, you need proper DNS records. Check your Route 53 setup:

```powershell
# Check if DNS records are configured
cd terraform
terraform plan

# Apply DNS configuration if not already done
terraform apply
```

**Required DNS Records:**

- ✅ **A records** pointing to GitHub Pages IPs (185.199.108-111.153)
- ✅ **CAA records** allowing Let's Encrypt to issue certificates
- ✅ **CNAME for www** (optional but recommended)

### Troubleshooting HTTPS

**"DNS check unsuccessful" in GitHub Pages:**

- Wait 15-30 minutes for DNS propagation
- Verify DNS with: `nslookup legacy-fantasy.com`
- Should return: 185.199.108.153 (or similar GitHub IP)

**"Certificate error" or "Not secure" warning:**

- Ensure "Enforce HTTPS" is checked in GitHub settings
- Wait 15-60 minutes after enabling HTTPS
- Certificate provisioning can take time
- Try clearing browser cache

**"Mixed content" errors:**

- All resources (scripts, images) must load over HTTPS
- Check browser console for mixed content warnings

**DNS configured but certificate still invalid:**

1. Remove custom domain from GitHub Pages
2. Wait 5 minutes
3. Re-add domain and save
4. Wait for DNS check
5. Enable HTTPS enforcement
6. Wait 30 minutes for certificate provisioning

### Quick Verification Commands

```powershell
# Check DNS is pointing to GitHub Pages
nslookup legacy-fantasy.com
# Should return: 185.199.108.153, 185.199.109.153, etc.

# Check if HTTPS is working
curl -I https://legacy-fantasy.com
# Should return: HTTP/2 200 with valid certificate

# Check CAA records (allows Let's Encrypt)
nslookup -type=CAA legacy-fantasy.com
# Should show: letsencrypt.org
```

### Timeline Expectations

| Step                     | Time Required     |
| ------------------------ | ----------------- |
| DNS propagation          | 5-30 minutes      |
| GitHub DNS check         | 5-15 minutes      |
| Certificate provisioning | 15-60 minutes     |
| **Total**                | **30-90 minutes** |

**Important:** Google One Tap will NOT work until HTTPS is properly configured with a valid certificate!

### 7. Alternative: Disable One Tap Temporarily

If you need to disable One Tap while troubleshooting:

```typescript
// In apps/web/src/main.tsx
const authConfig: OAuthConfig = {
  googleClientId: env.googleClientId,
  oauthProxyUrl: env.oauthProxyUrl,
  gsi: {
    oneTap: false, // Disable One Tap
  },
};
```

Users can still authenticate using the "Sign in with Google" button.

### 8. Testing Locally

For local development, One Tap automatically disables FedCM to avoid token retrieval errors:

```typescript
// This is already in the code:
if (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
) {
  gsiConfig.use_fedcm_for_prompt = false;
}
```

### 9. Monitoring & Logs

**Client-side logs to watch:**

```javascript
// Success:
'One Tap initialized successfully';

// Dismissal (normal):
'One Tap dismissed: dismissed_moment_*';

// Failure (requires attention):
'Failed to initialize One Tap: ...';
```

**Server-side (OAuth Proxy Lambda):**
Check CloudWatch logs for authentication attempts and any errors.

## References

- [Google Identity Services Documentation](https://developers.google.com/identity/gsi/web)
- [One Tap for Web](https://developers.google.com/identity/gsi/web/guides/overview)
- [Authorized Domains](https://developers.google.com/identity/protocols/oauth2/web-server#authorized-domains)
