# Web App (Next.js)

The Legacy Sports web application built with Next.js and deployed to GitHub Pages.

## 🚀 Quick Start

```bash
# From project root
npm run web:start

# Or run directly
cd apps/web
npm run dev
```

The app will be available at http://localhost:4200

## 🌐 Live Deployment

- **Production URL**: https://bkrupa.github.io/legacy-sports/
- **Auto-deploy**: Pushes to `main` branch automatically deploy
- **Build Status**: Check GitHub Actions for deployment status

## 🏗️ Architecture

### Technology Stack

- **Framework**: Vite + React
- **UI Library**: Tamagui (shared with mobile app)
- **Routing**: React Router with Hash routing (GitHub Pages compatible)
- **State Management**: Apollo Client for GraphQL
- **Styling**: Tamagui + CSS modules

### Project Structure

```
apps/web/
├── src/
│   ├── app/           # Main application components
│   ├── lib/           # Apollo client and utilities
│   ├── styles.css     # Global styles
│   └── main.tsx       # Application entry point
├── index.html         # HTML template
├── vite.config.ts     # Vite configuration
└── project.json       # NX project configuration
```

## 🔧 Configuration

### Environment Variables

Create `.env.local` for local overrides:

```bash
# Override GraphQL endpoint
VITE_GRAPHQL_HOST=https://u65oy98s9d.execute-api.us-east-1.amazonaws.com/dev/graphql
```

### GraphQL Configuration

Apollo Client is configured in `src/lib/apollo-client.ts`:

- Connects to AWS Lambda GraphQL API
- Includes operation name in query parameters
- Error handling and caching configured

### Routing Configuration

Uses Hash Router for GitHub Pages compatibility:

- URLs like `/#/players` instead of `/players`
- All routes work with direct links
- No server-side configuration needed

## 🧪 Testing

```bash
# Run unit tests
npm run test

# Run E2E tests
npm run test:e2e

# Test with coverage
npm run test:coverage
```

## 📦 Building & Deployment

### Local Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

### GitHub Pages Deployment

Automatic deployment via GitHub Actions:

1. **Trigger**: Push to `main` branch
2. **Build**: Vite build with correct base path
3. **Deploy**: GitHub Pages artifact deployment
4. **URL**: https://bkrupa.github.io/legacy-sports/

### Manual Deployment

```bash
# Build and deploy to GitHub Pages
npm run deploy
```

## 🎨 UI Components

### Tamagui Integration

Shared UI components with mobile app:

- Cross-platform design system
- Dark/light theme support
- Responsive breakpoints

### Platform-Specific Features

- Web-optimized components
- Keyboard navigation
- Responsive layouts
- SEO optimization

## 🔍 Development

### Hot Module Replacement

Vite provides fast HMR:

- Instant updates on file changes
- Preserves component state
- CSS hot reloading

### Debugging

- **Browser DevTools**: Standard web debugging
- **Apollo DevTools**: GraphQL query inspection
- **React DevTools**: Component inspection
- **Vite Inspector**: Build analysis

### Common Development Tasks

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Analyze bundle size
npm run analyze
```

## 🔍 Troubleshooting

### Common Issues

**Build fails**:

```bash
# Clear cache and rebuild
rm -rf dist node_modules
npm install
npm run build
```

**GraphQL connection issues**:

- Check network tab for failed requests
- Verify GraphQL endpoint URL
- Check AWS Lambda function status

**Routing doesn't work on GitHub Pages**:

- Ensure Hash Router is being used
- Check base path configuration in `vite.config.ts`

**Styling issues**:

- Verify Tamagui provider is wrapping the app
- Check CSS import order
- Clear browser cache

### Performance Optimization

**Bundle size**:

- Use dynamic imports for large components
- Configure manual chunks in Vite config
- Analyze bundle with `npm run analyze`

**Runtime performance**:

- Use React.memo for expensive components
- Implement proper Apollo Client caching
- Optimize images and assets

## 📚 Resources

- [Vite Documentation](https://vitejs.dev)
- [React Router Documentation](https://reactrouter.com)
- [Apollo Client Documentation](https://apollographql.com/docs/react)
- [Tamagui Documentation](https://tamagui.dev)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)

---

For deployment issues, check GitHub Actions logs or the main project README.
