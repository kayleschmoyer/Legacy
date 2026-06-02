# About Page — Reference

**Route**: `/about`  
**File**: `apps/web/src/pages/about/AboutPage.tsx`

---

## Layout (in order)

1. Page header — "ℹ️ About Legacy Sports" + subtitle
2. Build Information card
3. Application Info card
4. Links card
5. Get Started card
6. Footer copyright

---

## Build Information Card

| Field      | Source                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------- |
| Version    | `env.appVersion`                                                                             |
| Commit SHA | `env.commitSha` — clickable link to GitHub commit if valid; plain text if "unknown" or "dev" |
| Build Date | `env.buildDate` (formatted)                                                                  |

---

## Application Info Card

| Field       | Value                                                              |
| ----------- | ------------------------------------------------------------------ |
| Environment | "development" if `env.isDev`, else "production"                    |
| GraphQL API | `env.graphqlUrl` — **dev only** (hidden in production per LS-5706) |
| Base URL    | `env.baseUrl`                                                      |

---

## Links Card

| Button              | URL                                       | Condition                                             |
| ------------------- | ----------------------------------------- | ----------------------------------------------------- |
| View on GitHub      | `https://github.com/bkrupa/legacy-sports` | Always                                                |
| View Current Commit | GitHub commit URL                         | Only if `commitUrl` is valid (not "unknown" or "dev") |

---

## Get Started Card

- "Ready to manage your fantasy sports league? Join Legacy Sports for free."
- "Get Started Free" button → `/`

---

## Footer

- "© {year} Legacy Sports"
- "Built with React, TypeScript, and Tamagui"

---

## Notes

- No GraphQL queries or mutations
- No loading/error states — purely static
- Falls back to "unknown" for any missing environment values
