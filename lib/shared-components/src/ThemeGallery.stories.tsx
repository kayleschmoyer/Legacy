import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { Button } from './Button';
import { Card, Paragraph, Separator } from './Layout';

type ThemeMode = 'light' | 'dark';

type UIColors = {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  success: string;
  warning: string;
  error: string;
  disabled: string;
};

type ThemePalette = {
  label: string;
  light: UIColors;
  dark: UIColors;
};

const palettes: Record<string, ThemePalette> = {
  classic: {
    label: 'Classic Blue',
    light: {
      primary: '#1D4ED8',
      secondary: '#7C3AED',
      background: '#FFFFFF',
      surface: '#F5F7FB',
      text: '#0B1220',
      textSecondary: '#4B5563',
      border: '#D1D5DB',
      success: '#16A34A',
      warning: '#D97706',
      error: '#DC2626',
      disabled: '#C7C7CC',
    },
    dark: {
      primary: '#60A5FA',
      secondary: '#A78BFA',
      background: '#0B1220',
      surface: '#111A2E',
      text: '#F8FAFC',
      textSecondary: '#CBD5E1',
      border: '#263248',
      success: '#22C55E',
      warning: '#F59E0B',
      error: '#F87171',
      disabled: '#3B4253',
    },
  },
  sport: {
    label: 'Sport Green',
    light: {
      primary: '#0E9F6E',
      secondary: '#2563EB',
      background: '#FFFFFF',
      surface: '#F3FAF7',
      text: '#0B1220',
      textSecondary: '#475569',
      border: '#D1FAE5',
      success: '#22C55E',
      warning: '#F59E0B',
      error: '#EF4444',
      disabled: '#C7C7CC',
    },
    dark: {
      primary: '#34D399',
      secondary: '#60A5FA',
      background: '#061A12',
      surface: '#0A241B',
      text: '#ECFDF5',
      textSecondary: '#A7F3D0',
      border: '#144C37',
      success: '#22C55E',
      warning: '#FBBF24',
      error: '#FB7185',
      disabled: '#23423A',
    },
  },
  neutral: {
    label: 'Neutral Slate',
    light: {
      primary: '#0F172A',
      secondary: '#334155',
      background: '#FFFFFF',
      surface: '#F8FAFC',
      text: '#0F172A',
      textSecondary: '#475569',
      border: '#E2E8F0',
      success: '#16A34A',
      warning: '#D97706',
      error: '#DC2626',
      disabled: '#CBD5E1',
    },
    dark: {
      primary: '#E2E8F0',
      secondary: '#94A3B8',
      background: '#0B1220',
      surface: '#0F172A',
      text: '#F8FAFC',
      textSecondary: '#CBD5E1',
      border: '#1F2937',
      success: '#22C55E',
      warning: '#F59E0B',
      error: '#F87171',
      disabled: '#334155',
    },
  },
};

function Swatches({ colors }: { colors: UIColors }) {
  const entries = Object.entries(colors) as Array<[keyof UIColors, string]>;

  return (
    <XStack flexWrap="wrap" gap="$3">
      {entries.map(([name, value]) => (
        <YStack
          key={name}
          width={180}
          borderWidth={1}
          borderColor={colors.border}
          borderRadius={12}
          overflow="hidden"
          backgroundColor={colors.surface}
        >
          <YStack height={44} backgroundColor={value} />
          <YStack padding="$3" gap="$2">
            <Text fontSize={12} color={colors.textSecondary}>
              {name}
            </Text>
            <Text fontSize={12} color={colors.text}>
              {value}
            </Text>
          </YStack>
        </YStack>
      ))}
    </XStack>
  );
}

function SampleUI({ colors }: { colors: UIColors }) {
  return (
    <Card title="Sample UI" subtitle="Buttons, copy, dividers">
      <YStack gap="$3">
        <Paragraph>
          This preview is rendered with the selected palette. Use this to pick a
          direction before we implement tokens broadly.
        </Paragraph>

        <Separator />

        <XStack gap="$2" flexWrap="wrap">
          <Button
            variant="primary"
            backgroundColor={colors.primary}
            borderColor={colors.border}
          >
            Primary
          </Button>
          <Button
            variant="secondary"
            backgroundColor={colors.surface}
            borderColor={colors.border}
          >
            Secondary
          </Button>
          <Button
            variant="outlined"
            borderWidth={1}
            borderColor={colors.primary}
            backgroundColor="transparent"
          >
            Outline
          </Button>
          <Button disabled backgroundColor={colors.disabled}>
            Disabled
          </Button>
        </XStack>
      </YStack>
    </Card>
  );
}

function PalettePreview({
  paletteKey,
  mode,
}: {
  paletteKey: string;
  mode: ThemeMode;
}) {
  const palette = palettes[paletteKey] ?? palettes.classic;
  const colors = mode === 'dark' ? palette.dark : palette.light;

  return (
    <YStack
      padding="$4"
      gap="$4"
      backgroundColor={colors.background}
      minHeight="100vh"
    >
      <YStack gap="$2">
        <Text fontSize={18} fontWeight="700" color={colors.text}>
          Theme Gallery
        </Text>
        <Text fontSize={13} color={colors.textSecondary}>
          Palette: {palette.label} • Mode: {mode}
        </Text>
      </YStack>

      <Swatches colors={colors} />
      <SampleUI colors={colors} />
    </YStack>
  );
}

const meta: Meta = {
  title: 'Design System/Theme Gallery',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Visual palette explorer for agent-driven UI suggestions. Use the Palette Grid stories for screenshot generation.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    paletteKey: {
      control: { type: 'select' },
      options: Object.keys(palettes),
    },
    mode: {
      control: { type: 'inline-radio' },
      options: ['light', 'dark'],
    },
  },
};

export default meta;

type StoryArgs = { paletteKey: string; mode: ThemeMode };
type Story = StoryObj<StoryArgs>;

export const Explorer: Story = {
  args: {
    paletteKey: 'classic',
    mode: 'light',
  },
  render: (args) => (
    <PalettePreview paletteKey={args.paletteKey} mode={args.mode} />
  ),
};

export const PaletteGridLight: Story = {
  name: 'Palette Grid (Light)',
  args: {
    paletteKey: 'classic',
    mode: 'light',
  },
  render: (_args) => (
    <YStack gap="$4" padding="$4">
      {Object.entries(palettes).map(([key, palette]) => (
        <YStack
          key={key}
          borderWidth={1}
          borderColor="#E5E7EB"
          borderRadius={14}
          overflow="hidden"
        >
          <PalettePreview paletteKey={key} mode="light" />
          <YStack padding="$3">
            <Text fontSize={13} color="#111827">
              {palette.label}
            </Text>
          </YStack>
        </YStack>
      ))}
    </YStack>
  ),
};

export const PaletteGridDark: Story = {
  name: 'Palette Grid (Dark)',
  args: {
    paletteKey: 'classic',
    mode: 'dark',
  },
  render: (_args) => (
    <YStack gap="$4" padding="$4">
      {Object.entries(palettes).map(([key, palette]) => (
        <YStack
          key={key}
          borderWidth={1}
          borderColor="#111827"
          borderRadius={14}
          overflow="hidden"
        >
          <PalettePreview paletteKey={key} mode="dark" />
          <YStack padding="$3" backgroundColor="#0B1220">
            <Text fontSize={13} color="#F8FAFC">
              {palette.label}
            </Text>
          </YStack>
        </YStack>
      ))}
    </YStack>
  ),
};
