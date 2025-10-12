# UI Abstractions (@legacy-sports/ui-abstractions)

A stable, type-safe abstraction layer over Tamagui UI components for the Legacy Sports monorepo.

## 🎯 Purpose

This package provides:

- **Stable Types**: Well-defined TypeScript interfaces that isolate Tamagui's complex type system
- **Consistent API**: Unified component API across web and React Native platforms
- **Type Safety**: Strong typing to prevent common Tamagui type errors
- **Theme Management**: Simplified theme provider and styling utilities
- **Future-Proofing**: Abstraction layer allows easier migration if needed

## 🚀 Quick Start

### Installation

This package is automatically available in the Legacy Sports monorepo:

```typescript
import { 
  Button, 
  Text, 
  View, 
  XStack, 
  YStack,
  UIThemeProvider 
} from '@legacy-sports/ui-abstractions';
```

### Basic Usage

```typescript
import React from 'react';
import { 
  UIThemeProvider, 
  Container, 
  YStack, 
  Text, 
  Button 
} from '@legacy-sports/ui-abstractions';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';

function App() {
  return (
    <UIThemeProvider tamaguiConfig={tamaguiConfig} theme="auto">
      <Container>
        <YStack space="$4" padding="$4">
          <Text fontSize="$6" fontWeight="bold">
            Welcome to Legacy Sports
          </Text>
          <Button 
            variant="primary" 
            onPress={() => console.log('Pressed!')}
          >
            Get Started
          </Button>
        </YStack>
      </Container>
    </UIThemeProvider>
  );
}
```

## 📦 Components

### Layout Components
- **View**: Basic container component
- **XStack**: Horizontal stack layout
- **YStack**: Vertical stack layout  
- **ZStack**: Layered stack layout
- **Card**: Elevated card container
- **Container**: Screen-level container
- **ScrollView**: Scrollable container

### Text Components
- **Text**: Base text component with variants
- **H1, H2, H3, H4, H5, H6**: Heading components
- **Paragraph**: Body text component
- **Label**: Form label text
- **Caption**: Secondary text

### Input Components
- **Input**: Base input component
- **TextArea**: Multiline text input
- **PasswordInput**: Password input with secure entry
- **EmailInput**: Email-optimized input
- **PhoneInput**: Phone number input
- **NumberInput**: Numeric input

### Button Components
- **Button**: Base button with variants
- **PrimaryButton**: Primary action button
- **SecondaryButton**: Secondary action button
- **OutlineButton**: Outlined button
- **GhostButton**: Minimal button
- **LinkButton**: Link-style button

### Utility Components
- **Spinner**: Loading indicator
- **LoadingPanel**: Full loading screen
- **Separator/Divider**: Visual separator
- **ActivityIndicator**: React Native compatible spinner

## Building

Run `nx build ui-abstractions` to build the library.

## Running unit tests

Run `nx test ui-abstractions` to execute the unit tests via [Jest](https://jestjs.io).
