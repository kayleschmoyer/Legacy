import React from 'react';
import {
  View,
  Text,
  Button,
  YStack,
  XStack,
  H1,
  H2,
  H3,
  Paragraph,
  Separator,
  Card,
  Container,
  Spinner,
  LoadingPanel,
} from '@legacy-sports/ui-abstractions';

// Example component showing how to use UI Abstractions instead of direct Tamagui
export function ExampleAbstractedComponent() {
  return (
    <Container backgroundColor="$background">
      <YStack space="$4" padding="$4">
        {/* Typography examples */}
        <H1>Welcome to Legacy Sports</H1>
        <H2>Using UI Abstractions</H2>
        <H3>Stable, Type-Safe Components</H3>
        <Paragraph>
          This component demonstrates how to use the UI abstractions layer
          instead of direct Tamagui imports. All types are stable and consistent.
        </Paragraph>
        
        <Separator />
        
        {/* Button examples */}
        <YStack space="$2">
          <H3>Button Variants</H3>
          <XStack space="$2" flexWrap="wrap">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </XStack>
        </YStack>
        
        <Separator />
        
        {/* Loading examples */}
        <YStack space="$2">
          <H3>Loading Components</H3>
          <XStack space="$4" alignItems="center">
            <Text>Spinner:</Text>
            <Spinner size="small" />
            <Spinner size="large" />
          </XStack>
          
          <Card padding="$4" minHeight={100}>
            <LoadingPanel message="Loading data..." />
          </Card>
        </YStack>
        
        {/* Layout examples */}
        <YStack space="$2">
          <H3>Layout Components</H3>
          <Card elevated padding="$4">
            <XStack space="$3" justifyContent="space-between" alignItems="center">
              <View flex={1}>
                <Text fontWeight="bold">Player Name</Text>
                <Text variant="caption" color="$gray11">Position: QB</Text>
              </View>
              <Button size="small" variant="outline">
                View Details
              </Button>
            </XStack>
          </Card>
        </YStack>
      </YStack>
    </Container>
  );
}

// Example of migrating from direct Tamagui to UI Abstractions
export function BeforeAfterExample() {
  return (
    <Container>
      <YStack space="$4" padding="$4">
        <H2>Migration Example</H2>
        
        {/* BEFORE: Direct Tamagui (complex types, potential issues) */}
        <Card padding="$4">
          <Text fontWeight="bold" color="$red10">
            ❌ Before (Direct Tamagui):
          </Text>
          <Text variant="caption">
            {`import { Button, Text, XStack } from 'tamagui';`}
          </Text>
          <Text variant="caption">
            {`// Complex type inference, potential breaking changes`}
          </Text>
        </Card>
        
        {/* AFTER: UI Abstractions (stable types, consistent API) */}
        <Card padding="$4">
          <Text fontWeight="bold" color="$green10">
            ✅ After (UI Abstractions):
          </Text>
          <Text variant="caption">
            {`import { Button, Text, XStack } from '@legacy-sports/ui-abstractions';`}
          </Text>
          <Text variant="caption">
            {`// Stable types, consistent API, future-proof`}
          </Text>
        </Card>
        
        <Separator />
        
        <Text>
          The UI abstractions provide a stable, consistent API that isolates
          your components from Tamagui's type system complexity while still
          leveraging all of Tamagui's cross-platform capabilities.
        </Text>
      </YStack>
    </Container>
  );
}

export default ExampleAbstractedComponent;
