# Storybook Testing for Shared Components

This guide explains how to run automated tests on your Storybook stories using Jest and the Storybook test runner.

## Overview

We have implemented several testing approaches for our Storybook stories:

1. **Storybook Test Runner** - Runs all stories as tests automatically
2. **Jest Story Tests** - Unit tests that render and test individual stories
3. **Interaction Tests** - Tests user interactions within stories
4. **Accessibility Tests** - Automated a11y testing on all stories

## Testing Methods

### 1. Storybook Test Runner

The test runner visits each story in a headless browser and runs basic tests.

```bash
# Start Storybook first
pnpm run storybook

# In another terminal, run the test runner
pnpm run test-storybook

# For CI environments (starts Storybook automatically)
pnpm run test-storybook:ci
```

### 2. Jest Story Tests

Unit tests that import and test stories directly:

```bash
# Run story tests
pnpm run test:stories

# Run with coverage
pnpm run test:coverage

# Run all tests
pnpm run test:all
```

### 3. Interaction Tests

Stories can include `play` functions that test user interactions:

```typescript
export const WithInteraction: Story = {
  args: {
    children: 'Click Me!',
    onPress: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button');

    // Test that button is rendered
    await expect(button).toBeInTheDocument();

    // Test button click
    await userEvent.click(button);

    // Verify the function was called
    await expect(args.onPress).toHaveBeenCalled();
  },
  tags: ['test'],
};
```

## Available Scripts

| Script                       | Description                                            |
| ---------------------------- | ------------------------------------------------------ |
| `pnpm run test`              | Run standard Jest tests                                |
| `pnpm run test:watch`        | Run Jest tests in watch mode                           |
| `pnpm run test:coverage`     | Run tests with coverage report                         |
| `pnpm run test-storybook`    | Run Storybook test runner (requires running Storybook) |
| `pnpm run test-storybook:ci` | Run Storybook tests in CI mode                         |
| `pnpm run test:stories`      | Run Jest tests on story files                          |
| `pnpm run test:all`          | Run all test types                                     |

## Test Configuration

### Jest Configuration

- **Main config**: `jest.config.ts` - Standard component tests
- **Storybook config**: `jest.storybook.config.ts` - Story-specific tests

### Storybook Test Runner Configuration

- **Config file**: `.storybook/test-runner.ts`
- **Setup file**: `.storybook/jest-setup.ts`

## Writing Tests

### 1. Basic Story Test

```typescript
import { render, screen } from '@testing-library/react';
import { composeStories } from '@storybook/react';
import * as MyStories from './MyComponent.stories';

const { Default } = composeStories(MyStories);

test('renders without errors', () => {
  render(<Default />);
  expect(screen.getByRole('button')).toBeInTheDocument();
});
```

### 2. Interaction Story

```typescript
import { expect, fn, userEvent, within } from '@storybook/test';

export const Interactive: Story = {
  args: {
    onClick: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button');

    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalled();
  },
};
```

### 3. Accessibility Testing

All stories automatically get basic accessibility testing when using the test runner. You can also add specific a11y tests:

```typescript
import { expect } from '@storybook/test';
import { injectAxe, checkA11y } from 'axe-playwright';

export const AccessibilityTest: Story = {
  play: async ({ canvasElement }) => {
    await injectAxe(canvasElement);
    await checkA11y(canvasElement);
  },
};
```

## Coverage

Coverage reports are generated in:

- `coverage/` - Standard Jest coverage
- `coverage/storybook/` - Storybook test coverage

## Best Practices

1. **Tag stories appropriately**:
   - Use `tags: ['test']` for stories with interaction tests
   - Use `tags: ['skip-test']` to exclude from automated testing

2. **Mock external dependencies**:
   - Mock API calls and external services in stories
   - Use `fn()` for function props that should be tracked

3. **Test user interactions**:
   - Include `play` functions for interactive components
   - Test both happy path and error scenarios

4. **Accessibility**:
   - Ensure all interactive elements have proper labels
   - Test keyboard navigation in complex components

## Troubleshooting

### Common Issues

1. **"No tests found"**:
   - Check that Storybook is running on the correct port
   - Verify story files have correct extensions (.stories.tsx)

2. **React Native errors in tests**:
   - Mocks are configured in `jest-setup.ts`
   - Ensure React Native Web aliases are working

3. **Type errors**:
   - Check that all Storybook test dependencies are installed
   - Verify TypeScript configurations are compatible

### Debug Mode

```bash
# Run with verbose output
pnpm run test-storybook -- --verbose

# Run specific story
pnpm run test-storybook -- --stories="Button*"

# Run with coverage
pnpm run test-storybook -- --coverage
```

## Integration with CI/CD

Add to your CI pipeline:

```yaml
- name: Run Storybook Tests
  run: |
    pnpm run build-storybook
    pnpm run test-storybook:ci
```

This setup provides comprehensive testing for your Storybook stories, ensuring components work correctly in isolation and meet accessibility standards.
