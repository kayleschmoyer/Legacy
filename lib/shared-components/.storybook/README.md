# Legacy Sports Shared Components Storybook

This directory contains the Storybook configuration and stories for the Legacy Sports shared components library.

## Quick Start

To run Storybook locally:

```bash
# From the root of the workspace
cd lib/shared-components
npx storybook dev -p 6008 -c .storybook

# Or using the npm script
npm run storybook
```

Storybook will be available at http://localhost:6008/

## Building Storybook

To build a static version of Storybook for deployment:

```bash
# From the shared-components directory
npm run build-storybook

# Or using Storybook CLI directly
npx storybook build -c .storybook -o ../../dist/storybook
```

## What's Included

### Current Stories

- **Introduction/Welcome** - Overview of the component library
- **Components/Button** - Interactive button component with variants
- **Components/LoadingPanel** - Loading states and spinners
- **Layout/Card** - Content containers with titles and subtitles
- **Layout/XStack** - Horizontal layout components
- **Layout/YStack** - Vertical layout components
- **Typography** - Heading and text components

### Features

- **Interactive Controls** - Test component props in real-time
- **Documentation** - Auto-generated docs from TypeScript definitions
- **Responsive Design** - Test components across different viewport sizes
- **Accessibility Testing** - Built-in a11y checks with addon-a11y
- **Multiple Addons**:
  - Essential controls and actions
  - Viewport simulation (mobile, tablet, desktop)
  - Documentation generation
  - Accessibility testing
  - Interactive examples

## Adding New Stories

To add a story for a new component:

1. Create a `.stories.tsx` file next to your component:

   ```typescript
   // src/components/MyComponent.stories.tsx
   import type { Meta, StoryObj } from '@storybook/react';
   import { MyComponent } from './MyComponent';

   const meta: Meta<typeof MyComponent> = {
     title: 'Components/MyComponent',
     component: MyComponent,
     parameters: {
       layout: 'centered',
     },
     tags: ['autodocs'],
   };

   export default meta;
   type Story = StoryObj<typeof meta>;

   export const Default: Story = {
     args: {
       // your component props
     },
   };
   ```

2. Storybook will automatically detect and include the new story

## Configuration

### Main Configuration (`main.ts`)

- Framework: React with Vite
- TypeScript support with react-docgen
- Auto-discovery of `*.stories.*` files

### Preview Configuration (`preview.ts`)

- Global parameters and settings
- Viewport configurations for responsive testing
- Control matchers for automatic prop detection

## Architecture Integration

This Storybook setup is integrated with:

- **Tamagui** - Design system and component library
- **Nx Workspace** - Monorepo tooling and build system
- **React Native Web** - Cross-platform component compatibility
- **TypeScript** - Type safety and auto-generated documentation

## Nx Integration

Storybook is configured to work with the Nx workspace. You can also run it using Nx commands:

```bash
# From the workspace root
npx nx storybook shared-components
npx nx build-storybook shared-components
```

## Deployment

The built Storybook can be deployed to any static hosting service:

- Netlify
- Vercel
- GitHub Pages
- AWS S3
- Azure Static Web Apps

## Troubleshooting

### Common Issues

1. **Port conflicts**: Use `-p <port>` to specify a different port
2. **Build errors**: Ensure all component dependencies are properly installed
3. **Missing stories**: Check that your `.stories.tsx` files are in the correct location

### Development Tips

- Use the Controls addon to test different prop values
- Test responsive behavior with the Viewport addon
- Check accessibility with the A11y addon
- Use the Docs tab to see auto-generated documentation
