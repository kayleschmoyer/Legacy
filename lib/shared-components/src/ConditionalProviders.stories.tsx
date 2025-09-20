import type { Meta, StoryObj } from '@storybook/react';
import { ConditionalProviders } from './ConditionalProviders';

const meta: Meta<typeof ConditionalProviders> = {
  title: 'Providers/ConditionalProviders',
  component: ConditionalProviders,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A provider component that conditionally applies different providers based on the platform (web vs native).',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    children: {
      control: 'text',
      description: 'Child components to wrap with providers',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Sample child component to demonstrate the provider
const SampleChildComponent = () => (
  <div
    style={{
      padding: '20px',
      backgroundColor: '#f0f8ff',
      borderRadius: '8px',
      border: '2px dashed #007bff',
      textAlign: 'center',
    }}
  >
    <h3>Child Component</h3>
    <p>This component is wrapped by ConditionalProviders</p>
    <p>On web: Includes Google OAuth Provider</p>
    <p>On native: Includes React Native specific providers</p>
  </div>
);

export const Default: Story = {
  args: {
    children: <SampleChildComponent />,
  },
};

export const WithTextContent: Story = {
  args: {
    children: (
      <div style={{ padding: '16px' }}>
        <h2>Application Content</h2>
        <p>This content is wrapped by platform-specific providers.</p>
        <ul>
          <li>Web platform gets Google OAuth Provider</li>
          <li>Native platform gets React Native providers</li>
          <li>Graceful fallback if providers fail to load</li>
        </ul>
      </div>
    ),
  },
};

export const WithComplexChildren: Story = {
  args: {
    children: (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '20px',
        }}
      >
        <header
          style={{
            backgroundColor: '#343a40',
            color: 'white',
            padding: '16px',
            borderRadius: '4px',
          }}
        >
          <h1>Sample App Header</h1>
        </header>

        <main
          style={{
            backgroundColor: '#f8f9fa',
            padding: '16px',
            borderRadius: '4px',
          }}
        >
          <h2>Main Content</h2>
          <p>
            This demonstrates how ConditionalProviders wraps complex component
            trees.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginTop: '16px',
            }}
          >
            <div
              style={{
                backgroundColor: 'white',
                padding: '12px',
                borderRadius: '4px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <h3>Feature 1</h3>
              <p>Provider context available here</p>
            </div>
            <div
              style={{
                backgroundColor: 'white',
                padding: '12px',
                borderRadius: '4px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <h3>Feature 2</h3>
              <p>Provider context available here</p>
            </div>
            <div
              style={{
                backgroundColor: 'white',
                padding: '12px',
                borderRadius: '4px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <h3>Feature 3</h3>
              <p>Provider context available here</p>
            </div>
          </div>
        </main>

        <footer
          style={{
            backgroundColor: '#6c757d',
            color: 'white',
            padding: '12px',
            borderRadius: '4px',
            textAlign: 'center',
          }}
        >
          Footer - Providers active throughout the entire tree
        </footer>
      </div>
    ),
  },
  parameters: {
    layout: 'fullscreen',
  },
};

export const SimpleWrapper: Story = {
  args: {
    children: (
      <button
        style={{
          padding: '12px 24px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        Button with Provider Context
      </button>
    ),
  },
};

export const NestedComponents: Story = {
  args: {
    children: (
      <div style={{ padding: '20px' }}>
        <ConditionalProviders>
          <div
            style={{
              backgroundColor: '#fff3cd',
              padding: '16px',
              borderRadius: '4px',
              marginBottom: '16px',
            }}
          >
            <strong>Note:</strong> This shows nested ConditionalProviders
            (though not recommended in practice)
          </div>
          <SampleChildComponent />
        </ConditionalProviders>
      </div>
    ),
  },
};

// Platform detection demo
export const PlatformInfo: Story = {
  args: {
    children: (
      <div
        style={{
          padding: '20px',
          backgroundColor: '#e9ecef',
          borderRadius: '8px',
          fontFamily: 'monospace',
        }}
      >
        <h3>Platform Detection</h3>
        <p>
          <strong>Current Platform:</strong> web (in Storybook)
        </p>
        <p>
          <strong>Active Providers:</strong>
        </p>
        <ul>
          <li>Google OAuth Provider (web only)</li>
          <li>Error boundary handling</li>
          <li>Graceful fallback for missing providers</li>
        </ul>
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: '#d4edda',
            borderRadius: '4px',
            border: '1px solid #c3e6cb',
          }}
        >
          <span role="img" aria-label="Check mark">
            ✅
          </span>{' '}
          ConditionalProviders is working correctly
        </div>
      </div>
    ),
  },
};

// Error handling demonstration
export const ErrorHandling: Story = {
  render: () => (
    <ConditionalProviders>
      <div style={{ padding: '20px' }}>
        <h3>Error Handling Demo</h3>
        <p>
          ConditionalProviders includes error boundaries and graceful fallbacks:
        </p>
        <ul>
          <li>If Google OAuth provider fails to load, children still render</li>
          <li>Console warnings for debugging</li>
          <li>No app crashes due to missing dependencies</li>
        </ul>
        <div
          style={{
            backgroundColor: '#f8d7da',
            padding: '12px',
            borderRadius: '4px',
            border: '1px solid #f5c6cb',
            marginTop: '16px',
          }}
        >
          Even if provider initialization fails, this content renders
          successfully.
        </div>
      </div>
    </ConditionalProviders>
  ),
};
