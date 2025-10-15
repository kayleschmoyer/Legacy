# Documentation Reorganization Plan

## Current Problems

1. **58+ loose markdown files** in the root `docs/` directory
2. **Inconsistent naming** (some CAPS, some lowercase, some with underscores)
3. **Mixed topics** making it hard to find related information
4. **Unclear categorization** - CI/CD, OAuth, Terraform, etc. all mixed together
5. **Some structure exists** but isn't being used consistently

## Proposed New Structure

```
docs/
├── README.md                          # Main documentation hub (updated)
│
├── guides/                            # ✅ Already exists - Getting started guides
│   ├── README.md                      # NEW: Quick navigation
│   ├── development-setup.md           # ✅ Existing
│   ├── authentication-guide.md        # ✅ Existing
│   ├── troubleshooting.md             # ✅ Existing
│   ├── security-and-secrets.md        # ✅ Existing
│   └── agent-commands.md              # ✅ Existing
│
├── architecture/                      # ✅ Already exists - System design
│   ├── README.md                      # NEW: Architecture overview
│   ├── build-system.md                # ✅ Existing
│   ├── cross-platform-system.md       # ✅ Existing
│   ├── database-schema.md             # ✅ Existing
│   ├── graphql-integration.md         # ✅ Existing
│   └── schema-validation.md           # ✅ Existing
│
├── authentication/                    # NEW: OAuth and auth documentation
│   ├── README.md                      # NEW: Auth system overview
│   ├── CLI_OAUTH_AUTHENTICATION.md    # MOVE from root
│   ├── oauth-auto-provisioning.md     # MOVE from root
│   ├── oauth-auto-provisioning-summary.md  # MOVE from root
│   ├── oauth-pre-authorization-fix.md # MOVE from root
│   ├── two-lambda-authentication.md   # MOVE from root
│   ├── INVITE_CODE_IMPLEMENTATION.md  # MOVE from root
│   └── google-oauth-domain-setup.md   # MOVE from root
│
├── ci-cd/                             # NEW: CI/CD and GitHub Actions
│   ├── README.md                      # NEW: CI/CD overview
│   ├── ci-system-documentation.md     # MOVE from root
│   ├── ci-migration-plan.md           # MOVE from root
│   ├── ci-workflow-migration-status.md # MOVE from root
│   ├── ci-troubleshooting-guide.md    # MOVE from root
│   ├── improved-ci-system-design.md   # MOVE from root
│   ├── cloud-ready-ci-configuration.md # MOVE from root
│   ├── ci-pipeline-evaluation.md      # MOVE from deployment/
│   ├── github-actions-cleanup.md      # MOVE from root
│   ├── merge-queue-guide.md           # MOVE from root
│   ├── merge-queue-permissions-fix.md # MOVE from root
│   ├── pr-comments-implementation-summary.md # MOVE from root
│   ├── pr-comments-merge-queue-analysis.md # MOVE from root
│   ├── CI_BADGES_SETUP.md             # MOVE from root
│   ├── badge-logging-improvements.md  # MOVE from root
│   └── intelligent-dte-detection.md   # MOVE from root
│
├── build-and-tooling/                 # NEW: Nx, build systems, tooling
│   ├── README.md                      # NEW: Build tooling overview
│   ├── nx-cloud-optimization-strategy.md # MOVE from root
│   ├── nx-cloud-ci-strategy.md        # MOVE from root
│   ├── nx-cloud-workflow-migration.md # MOVE from root
│   ├── nx-cloud-conditional-usage.md  # MOVE from root
│   ├── nx-cloud-quota-fix.md          # MOVE from root
│   ├── nx-dte-badge-implementation.md # MOVE from root
│   ├── nx-background-tasks.md         # MOVE from root
│   ├── nx-best-practices-assessment.md # MOVE from root
│   ├── nx-migration-summary.md        # MOVE from root
│   ├── jest-changed-files-config.md   # MOVE from root
│   ├── e2e-testing-migration.md       # MOVE from root
│   ├── package-json-standards.md      # MOVE from root
│   └── script-cleanup-summary.md      # MOVE from root
│
├── deployment/                        # ✅ Already exists - Deployment docs
│   ├── README.md                      # NEW: Deployment overview
│   ├── aws-infrastructure.md          # ✅ Existing
│   ├── cost-optimization.md           # ✅ Existing
│   ├── infrastructure-changelog.md    # ✅ Existing
│   ├── nat-gateway-removal-plan.md    # ✅ Existing
│   ├── route53-github-pages-setup.md  # ✅ Existing
│   ├── route53-implementation-summary.md # ✅ Existing
│   ├── route53-setup-quickstart.md    # MOVE from root
│   ├── s3-lambda-deployment.md        # MOVE from root
│   ├── lambda-build-strategy.md       # MOVE from root
│   ├── deployment-security.md         # MOVE from root
│   ├── https-certificate-setup.md     # MOVE from root
│   ├── github-pages-certificate-pending.md # MOVE from root
│   ├── QUICK-FIX-HTTPS.md             # MOVE from root
│   ├── headless-development.md        # MOVE from root
│   │
│   └── terraform/                     # NEW: Terraform-specific docs
│       ├── README.md                  # NEW: Terraform overview
│       ├── terraform-lambda-deployment.md # MOVE from deployment/
│       ├── terraform-backend-setup.md # MOVE from root
│       ├── terraform-state-solution.md # MOVE from root
│       ├── terraform-lock-management.md # MOVE from root
│       └── terraform-quick-reference.md # MOVE from root
│
├── security/                          # NEW: Security documentation
│   ├── README.md                      # NEW: Security overview
│   ├── security-audit-status.md       # MOVE from root
│   ├── security-scanning-implementation.md # MOVE from root
│   ├── security-scanning-optimization.md # MOVE from root
│   └── GITHUB_SECRETS_GUIDE.md        # MOVE from root
│
├── mobile/                            # NEW: Mobile/Android specific
│   ├── README.md                      # NEW: Mobile overview
│   ├── android-build-setup.md         # MOVE from root
│   ├── android-version-matrix.md      # MOVE from root
│   └── mobile-build-automation.md     # MOVE from root
│
├── web/                               # NEW: Web-specific documentation
│   ├── README.md                      # NEW: Web overview
│   ├── web-build-configurations.md    # MOVE from root
│   ├── web-hash-routing.md            # MOVE from root
│   └── navigation-menu-reorganization.md # MOVE from root
│
├── database/                          # NEW: Database migrations and upgrades
│   ├── README.md                      # NEW: Database overview
│   ├── drizzle-upgrade-analysis.md    # MOVE from root
│   └── drizzle-upgrade-completed.md   # MOVE from root
│
├── migration-history/                 # ✅ Already exists - Historical records
│   ├── README.md                      # NEW: Migration history index
│   └── [all existing migration files] # ✅ Already organized
│
├── agents/                            # ✅ Already exists - AI agent instructions
│   └── [all CSV files]                # ✅ Already organized
│
├── api/                               # ✅ Already exists - API documentation
│   └── [future API docs]              # Placeholder for future content
│
└── development-plans/                 # ✅ Already exists - Future planning
    └── [planning documents]           # ✅ Already organized
```

## Benefits of New Structure

### 1. **Clear Categorization**
- Each category has a dedicated folder
- Related documents are grouped together
- Easy to find documentation by topic

### 2. **Better Navigation**
- Each category has a README.md with overview
- Main README.md updated with clear links
- Consistent naming conventions

### 3. **Scalability**
- Easy to add new documents to existing categories
- Clear place for new topics
- Subdirectories for complex topics (e.g., deployment/terraform/)

### 4. **Reduced Clutter**
- Root docs/ only has README.md and category folders
- No more 58+ files in one directory
- Easier to browse in file explorer

### 5. **Role-Based Access**
- Developers: guides/, architecture/, authentication/
- DevOps: deployment/, ci-cd/, security/
- Mobile Developers: mobile/, authentication/
- Web Developers: web/, authentication/
- Platform Engineers: build-and-tooling/, ci-cd/

## Migration Strategy

### Phase 1: Create New Structure (No Breaking Changes)
1. Create new directories
2. Add README.md files to each directory
3. Copy (don't move) files to new locations
4. Update main README.md with new structure

### Phase 2: Update References
1. Search for internal links between documents
2. Update all cross-references to new locations
3. Test that all links work

### Phase 3: Archive Old Files
1. Move old files to `docs/_archive/` folder
2. Add deprecation notices in archive
3. Keep for 30 days before deletion

### Phase 4: Clean Up
1. Remove archived files after 30 days
2. Final verification of all links
3. Announce new structure to team

## File Movement Map

### Authentication (8 files)
- `CLI_OAUTH_AUTHENTICATION.md` → `authentication/`
- `oauth-auto-provisioning.md` → `authentication/`
- `oauth-auto-provisioning-summary.md` → `authentication/`
- `oauth-pre-authorization-fix.md` → `authentication/`
- `two-lambda-authentication.md` → `authentication/`
- `INVITE_CODE_IMPLEMENTATION.md` → `authentication/`
- `google-oauth-domain-setup.md` → `authentication/`

### CI/CD (15 files)
- `ci-system-documentation.md` → `ci-cd/`
- `ci-migration-plan.md` → `ci-cd/`
- `ci-workflow-migration-status.md` → `ci-cd/`
- `ci-troubleshooting-guide.md` → `ci-cd/`
- `improved-ci-system-design.md` → `ci-cd/`
- `cloud-ready-ci-configuration.md` → `ci-cd/`
- `deployment/ci-pipeline-evaluation.md` → `ci-cd/`
- `github-actions-cleanup.md` → `ci-cd/`
- `merge-queue-guide.md` → `ci-cd/`
- `merge-queue-permissions-fix.md` → `ci-cd/`
- `pr-comments-implementation-summary.md` → `ci-cd/`
- `pr-comments-merge-queue-analysis.md` → `ci-cd/`
- `CI_BADGES_SETUP.md` → `ci-cd/`
- `badge-logging-improvements.md` → `ci-cd/`
- `intelligent-dte-detection.md` → `ci-cd/`

### Build & Tooling (13 files)
- `nx-cloud-optimization-strategy.md` → `build-and-tooling/`
- `nx-cloud-ci-strategy.md` → `build-and-tooling/`
- `nx-cloud-workflow-migration.md` → `build-and-tooling/`
- `nx-cloud-conditional-usage.md` → `build-and-tooling/`
- `nx-cloud-quota-fix.md` → `build-and-tooling/`
- `nx-dte-badge-implementation.md` → `build-and-tooling/`
- `nx-background-tasks.md` → `build-and-tooling/`
- `nx-best-practices-assessment.md` → `build-and-tooling/`
- `nx-migration-summary.md` → `build-and-tooling/`
- `jest-changed-files-config.md` → `build-and-tooling/`
- `e2e-testing-migration.md` → `build-and-tooling/`
- `package-json-standards.md` → `build-and-tooling/`
- `script-cleanup-summary.md` → `build-and-tooling/`

### Deployment & Terraform (12 files)
- `route53-setup-quickstart.md` → `deployment/`
- `s3-lambda-deployment.md` → `deployment/`
- `lambda-build-strategy.md` → `deployment/`
- `deployment-security.md` → `deployment/`
- `https-certificate-setup.md` → `deployment/`
- `github-pages-certificate-pending.md` → `deployment/`
- `QUICK-FIX-HTTPS.md` → `deployment/`
- `headless-development.md` → `deployment/`
- `deployment/terraform-lambda-deployment.md` → `deployment/terraform/`
- `terraform-backend-setup.md` → `deployment/terraform/`
- `terraform-state-solution.md` → `deployment/terraform/`
- `terraform-lock-management.md` → `deployment/terraform/`
- `terraform-quick-reference.md` → `deployment/terraform/`

### Security (4 files)
- `security-audit-status.md` → `security/`
- `security-scanning-implementation.md` → `security/`
- `security-scanning-optimization.md` → `security/`
- `GITHUB_SECRETS_GUIDE.md` → `security/`

### Mobile (3 files)
- `android-build-setup.md` → `mobile/`
- `android-version-matrix.md` → `mobile/`
- `mobile-build-automation.md` → `mobile/`

### Web (3 files)
- `web-build-configurations.md` → `web/`
- `web-hash-routing.md` → `web/`
- `navigation-menu-reorganization.md` → `web/`

### Database (2 files)
- `drizzle-upgrade-analysis.md` → `database/`
- `drizzle-upgrade-completed.md` → `database/`

## Next Steps

1. **Review this plan** - Does this structure make sense for your team?
2. **Provide feedback** - Any categories missing or misplaced?
3. **Approve execution** - Ready to implement the reorganization?
4. **Post-migration** - Update team documentation and wikis

## Estimated Impact

- **Files moved**: ~60 files
- **New directories**: 7 new categories
- **New README files**: 10 navigation files
- **Time to complete**: 30-60 minutes
- **Risk**: Low (can use copy-first approach)
