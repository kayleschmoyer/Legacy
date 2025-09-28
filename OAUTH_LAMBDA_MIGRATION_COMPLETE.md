# Combined OAuth Lambda Migration Summary

## Overview

Successfully combined the previously separate `oauth-proxy` and `user-manager` lambdas into a single secure OAuth service. This implements a user-first security model where only pre-authorized users can complete OAuth authentication.

## Key Changes

### 🔒 **New Secure Authentication Flow**

**Before (Two-Lambda Architecture):**

```
[Client] → Google OAuth → [OAuth Proxy] → [User Manager] → [Client]
   ↓                           ↓               ↓            ↓
1. Request                 2. ✅ Verify      3. Create     4. Return
   OAuth                     OAuth token       OR Get        App JWT
                            (Always works)     User
```

**After (Secure Single-Lambda Architecture):**

```
[Client] → [Combined OAuth Lambda] → [Client]
   ↓              ↓                      ↓
1. Request    2. ✅ Check User      3. Return JWT
   OAuth         Exists FIRST         (Only if pre-authorized)
                 ↓
            3. ✅ Validate OAuth
               (Only if user exists)
```

### 🏗️ **Technical Implementation**

#### **Lambda Deployment Changes**

- **Location**: Moved from outside VPC to **public subnet**
- **Network Access**: Internet access (Google OAuth APIs) + RDS Proxy access
- **Memory**: Increased to 512MB (dev) / 1024MB (prod) for combined functionality
- **No NAT Gateway**: Direct internet access via public subnet (cost savings ~$45/month)

#### **New Security Model**

- **User Pre-Authorization**: Checks database for user existence BEFORE OAuth validation
- **Access Control**: Only users who already exist in the database can authenticate
- **Error Handling**: Clear error messages for unauthorized users

#### **Database Integration**

- **RDS Proxy Access**: Uses existing RDS proxy for database connections
- **Permissions**: Added database credentials and RDS connection permissions
- **User Lookup**: Direct database queries to check user existence

### 📋 **API Endpoints**

#### **Secure OAuth Endpoints**

- `POST /oauth/google` - **NEW**: Secure flow with user pre-authorization check
- `POST /oauth/google/legacy` - Original flow for backward compatibility
- `POST /oauth/google/refresh` - Token refresh (unchanged)
- `POST /oauth/verify` - Token verification (unchanged)
- `POST /oauth/login` - Local login (unchanged)
- `POST /oauth/register` - Local registration (unchanged)

#### **Removed Endpoints**

- `/oauth/users/*` endpoints - No longer needed (user management is internal)

### 🔧 **Infrastructure Changes**

#### **Terraform Configuration**

- **VPC Configuration**: Added public subnet deployment with security groups
- **IAM Permissions**: Combined OAuth secrets + database credentials access
- **RDS Access**: Added RDS proxy connection permissions
- **Memory/Timeout**: Increased resources for combined functionality

#### **Environment Variables**

```bash
# OAuth Configuration (existing)
CLIENT_ID=google-client-id
GOOGLE_OAUTH_CLIENT_SECRET_PATH=/aws/secretsmanager/path
JWT_SECRET_KEY_PATH=/aws/secretsmanager/jwt-secret
COOKIE_SECRET_KEY_PATH=/aws/secretsmanager/cookie-secret

# Database Configuration (added)
DB_CREDS_PATH=/aws/secretsmanager/db-credentials
DB_HOST=rds-proxy-endpoint.amazonaws.com
```

### ✅ **Security Benefits**

1. **Pre-Authorization Enforcement**: Only known users can complete authentication
2. **Reduced Attack Surface**: Single lambda instead of two separate functions
3. **Clear Access Control**: Explicit user existence validation
4. **Audit Trail**: Better logging of authentication attempts and rejections

### 💰 **Cost Optimization**

- **No NAT Gateway**: Saves ~$45/month by using public subnet
- **Single Lambda**: Reduced infrastructure complexity
- **Efficient Resource Usage**: Combined functionality in one optimized function

### 🚀 **Deployment**

The combined lambda maintains backward compatibility while providing the new secure flow:

1. **Deploy Updated Terraform**: Applies new VPC and permissions configuration
2. **Deploy Lambda Code**: Updated oauth-proxy with secure authentication logic
3. **Update Client Code**: Point to `/oauth/google` for secure flow (when ready)
4. **Remove user-manager**: Can be safely removed after migration

### 📝 **Next Steps**

1. Update client-side `AuthService` to use single OAuth endpoint
2. Test secure authentication flow with existing users
3. Remove old user-manager lambda and infrastructure
4. Update documentation and developer guides

---

**Result**: A more secure, cost-effective, and maintainable authentication system that enforces user pre-authorization while maintaining all existing functionality.
