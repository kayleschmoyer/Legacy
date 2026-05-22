import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import React, { useState } from 'react';
import { Button, Text, YStack } from 'tamagui';
import { ErrorBoundary, ErrorBoundaryBase } from './ErrorBoundary';

const ThrowingComponent = ({
  shouldThrow,
  error,
}: {
  shouldThrow: boolean;
  error?: Error;
}): React.ReactElement => {
  if (shouldThrow) {
    throw error ?? new Error('Intentional render error for story');
  }
  return (
    <YStack padding="$4" backgroundColor="$green3" borderRadius="$3">
      <Text color="$green11" fontWeight="600">
        Component rendered successfully
      </Text>
    </YStack>
  );
};

const meta: Meta<typeof ErrorBoundary> = {
  title: 'Components/ErrorBoundary',
  component: ErrorBoundary,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Catches React render errors and shows a fallback UI. Uses Tamagui primitives so it renders correctly on both web and native.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {
  render: () => (
    <ErrorBoundary>
      <ThrowingComponent shouldThrow={false} />
    </ErrorBoundary>
  ),
};

export const DefaultFallback: Story = {
  render: () => (
    <ErrorBoundary>
      <ThrowingComponent
        shouldThrow
        error={new Error('Unexpected render failure')}
      />
    </ErrorBoundary>
  ),
};

export const CustomFallback: Story = {
  render: () => (
    <ErrorBoundary
      fallback={
        <YStack
          padding="$4"
          backgroundColor="$orange3"
          borderRadius="$3"
          gap="$2"
        >
          <Text color="$orange11" fontWeight="700" fontSize="$5">
            Custom Error Screen
          </Text>
          <Text color="$orange10" fontSize="$3">
            This is a caller-supplied fallback UI.
          </Text>
        </YStack>
      }
    >
      <ThrowingComponent shouldThrow error={new Error('Something failed')} />
    </ErrorBoundary>
  ),
};

export const WithOnErrorCallback: Story = {
  render: () => (
    <ErrorBoundary onError={fn()}>
      <ThrowingComponent shouldThrow error={new Error('Callback test error')} />
    </ErrorBoundary>
  ),
};

const RetryDemo = (): React.ReactElement => {
  const [shouldThrow, setShouldThrow] = useState(true);

  return (
    <YStack gap="$4" width={360}>
      <Button
        size="$2"
        chromeless
        onPress={() => setShouldThrow((prev) => !prev)}
      >
        <Text fontSize="$2">{shouldThrow ? 'Fix child' : 'Break child'}</Text>
      </Button>
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={shouldThrow} />
      </ErrorBoundary>
    </YStack>
  );
};

export const AdminFallback: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'When the current user is an admin, the fallback shows an extra "Admin debug info" panel containing `error.message` and the React component stack. Uses `ErrorBoundaryBase` directly so the story does not require an `AuthProvider` in the tree.',
      },
    },
  },
  render: () => (
    <ErrorBoundaryBase isAdmin>
      <ThrowingComponent
        shouldThrow
        error={new Error('Boom: rendering admin debug panel')}
      />
    </ErrorBoundaryBase>
  ),
};

export const NonAdminFallback: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Non-admin users see the standard fallback with no error details or component stack.',
      },
    },
  },
  render: () => (
    <ErrorBoundaryBase isAdmin={false}>
      <ThrowingComponent
        shouldThrow
        error={new Error('Boom: hidden from non-admins')}
      />
    </ErrorBoundaryBase>
  ),
};

export const RetryInteraction: Story = {
  render: () => <RetryDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Initially the child throws so the error fallback should be visible
    const retryButton = canvas.getByRole('button', { name: /try again/i });
    await expect(retryButton).toBeInTheDocument();

    // Fix the child so it won't throw on the next render attempt
    const fixChildButton = canvas.getByRole('button', { name: /fix child/i });
    await userEvent.click(fixChildButton);

    // Retry — ErrorBoundary re-renders the (now fixed) child
    await userEvent.click(retryButton);

    // Child should now render the healthy state
    const successMessage = await canvas.findByText(
      'Component rendered successfully',
    );
    await expect(successMessage).toBeInTheDocument();
  },
  tags: ['test'],
};
