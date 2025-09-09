# Web App Hash Routing

The web application now uses hash-based routing (`HashRouter`) instead of browser routing (`BrowserRouter`).

## What Changed

- **Before**: URLs like `http://localhost:4200/players`
- **After**: URLs like `http://localhost:4200/#/players`

## Benefits

1. **Static Deployment Friendly**: Works with GitHub Pages, Netlify, and other static hosts without server configuration
2. **No Server Routing Required**: All routing is handled client-side
3. **Backward Compatible**: Old bookmarks will redirect to the hash-based equivalents
4. **Configurable Base URL**: Supports different base URLs via environment variable

## Environment Configuration

The build supports configurable base URLs via the `VITE_BASE_URL` environment variable:

- **Development**: `VITE_BASE_URL=/` (default)
- **GitHub Pages**: `VITE_BASE_URL=/legacy-sports/`
- **Custom Domain**: `VITE_BASE_URL=/your-path/`

## URLs

### Development (localhost)

- Home: `http://localhost:4200/#/`
- Players: `http://localhost:4200/#/players`
- Baseball: `http://localhost:4200/#/baseball`
- Football: `http://localhost:4200/#/football`
- Demo: `http://localhost:4200/#/demo`

### GitHub Pages

- Home: `https://bkrupa.github.io/legacy-sports/#/`
- Players: `https://bkrupa.github.io/legacy-sports/#/players`
- Baseball: `https://bkrupa.github.io/legacy-sports/#/baseball`
- Football: `https://bkrupa.github.io/legacy-sports/#/football`
- Demo: `https://bkrupa.github.io/legacy-sports/#/demo`

## Technical Details

- Changed import from `BrowserRouter` to `HashRouter` in `apps/web/src/main.tsx`
- Added `base: process.env.VITE_BASE_URL || '/'` to `vite.config.ts`
- Updated GitHub Actions workflow to set `VITE_BASE_URL=/legacy-sports/`
- No changes needed to route definitions in the app components

## Development Commands

### Standard Development

```bash
npx nx dev web              # Development server
npx nx dev:headless web     # Headless development server
npx nx build web            # Build with default base URL (/)
```

### GitHub Pages Testing

```bash
npx nx build:github-pages web    # Build with GitHub Pages base URL
npx nx preview:github-pages web  # Preview the built app
```

### Manual Environment Override

```bash
# PowerShell
$env:VITE_BASE_URL="/custom-path/"; npx nx build web

# Bash
VITE_BASE_URL="/custom-path/" npx nx build web
```

## Deployment

The GitHub Actions workflow automatically sets the correct base URL for GitHub Pages deployment. No manual intervention required.
