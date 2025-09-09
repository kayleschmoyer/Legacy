import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
  title: 'Introduction/Welcome',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Welcome to the Legacy Sports Shared Components Storybook.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;

export const Welcome: StoryObj = {
  name: 'Welcome to Legacy Sports Components',
  render: () => (
    <div
      style={{ padding: '40px', maxWidth: '600px', fontFamily: 'system-ui' }}
    >
      <h1>Legacy Sports Shared Components</h1>

      <p>
        Welcome to the component library for the Legacy Sports application. This
        Storybook contains all the reusable components used across our web and
        mobile applications.
      </p>

      <hr style={{ margin: '20px 0' }} />

      <h2>Available Component Categories</h2>

      <div
        style={{
          marginBottom: '20px',
          padding: '16px',
          border: '1px solid #ddd',
          borderRadius: '8px',
        }}
      >
        <h3>Layout Components</h3>
        <p>Building blocks for UI structure</p>
        <ul>
          <li>Card - Content containers with optional titles</li>
          <li>XStack - Horizontal layout component</li>
          <li>YStack - Vertical layout component</li>
          <li>ScreenContainer - Scrollable page container</li>
        </ul>
      </div>

      <div
        style={{
          marginBottom: '20px',
          padding: '16px',
          border: '1px solid #ddd',
          borderRadius: '8px',
        }}
      >
        <h3>Typography</h3>
        <p>Text components with consistent styling</p>
        <ul>
          <li>H1, H2, H3 - Heading components</li>
          <li>Paragraph - Body text component</li>
          <li>Separator - Visual content divider</li>
        </ul>
      </div>

      <div
        style={{
          marginBottom: '20px',
          padding: '16px',
          border: '1px solid #ddd',
          borderRadius: '8px',
        }}
      >
        <h3>Interactive Components</h3>
        <p>User interface controls</p>
        <ul>
          <li>Button - Primary action component</li>
          <li>LoadingPanel - Loading states</li>
          <li>Auth Forms - Authentication components</li>
        </ul>
      </div>

      <hr style={{ margin: '20px 0' }} />

      <p>
        Navigate through the sidebar to explore all available components, their
        properties, and usage examples.
      </p>
    </div>
  ),
};
