# Web Development Documentation

This directory contains web application documentation, focusing on Next.js, build configurations, and routing for the Legacy Sports platform.

## 📑 Contents

### Build Configuration
- **[Web Build Configurations](web-build-configurations.md)** - Next.js and Vite build setup
- **[Hash Routing](web-hash-routing.md)** - Client-side hash routing configuration

### UI & Navigation
- **[Navigation Menu Reorganization](navigation-menu-reorganization.md)** - Menu structure and organization

## 🎯 Quick Start

### Setting Up Web Development
1. Configure build per [Web Build Configurations](web-build-configurations.md)
2. Set up routing via [Hash Routing](web-hash-routing.md)
3. Review navigation in [Navigation Menu Reorganization](navigation-menu-reorganization.md)

### Building for Production
1. Follow [Web Build Configurations](web-build-configurations.md)
2. Test production build locally
3. Deploy to AWS (see [Deployment docs](../deployment/))

### Configuring Navigation
1. Review [Navigation Menu Reorganization](navigation-menu-reorganization.md)
2. Update menu structure in code
3. Test navigation flows

## 🔗 Related Documentation
- [Cross-Platform System](../architecture/cross-platform-system.md) - Shared components
- [Authentication](../authentication/) - Web authentication
- [Deployment](../deployment/) - Web app deployment
- [Development Setup](../guides/development-setup.md) - Dev environment

## 💡 Common Tasks

### Configure Build System
1. Review [Web Build Configurations](web-build-configurations.md)
2. Update `next.config.js` or `vite.config.ts`
3. Test build: `nx run web:build`
4. Verify output

### Set Up Routing
1. Implement routing per [Hash Routing](web-hash-routing.md)
2. Configure routes in Next.js
3. Test navigation
4. Handle 404s appropriately

### Update Navigation Menu
1. Check [Navigation Menu Reorganization](navigation-menu-reorganization.md)
2. Update menu component
3. Test on desktop and mobile
4. Verify accessibility

### Troubleshoot Build Issues
1. Check [Web Build Configurations](web-build-configurations.md)
2. Verify dependencies in `package.json`
3. Clear build cache: `rm -rf .next` or `rm -rf dist`
4. Review [Troubleshooting Guide](../guides/troubleshooting.md)

## 🌐 Web-Specific Notes

### Next.js
- Server-side rendering (SSR) support
- Static site generation (SSG) support
- API routes available
- Image optimization built-in

### Vite
- Fast development server
- Hot module replacement (HMR)
- Optimized production builds
- ESM-first approach

### Routing
- Client-side: Hash routing via [Hash Routing](web-hash-routing.md)
- Server-side: Next.js file-based routing
- Dynamic routes supported
- Catch-all routes for SPAs

### Deployment
- Static hosting on S3 + CloudFront
- Lambda@Edge for SSR (if enabled)
- See [Deployment Documentation](../deployment/) for details

---

[← Back to Documentation Hub](../README.md)
