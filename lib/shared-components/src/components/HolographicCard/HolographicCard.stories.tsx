import type { Meta, StoryObj } from '@storybook/react';
import { HolographicCard } from './HolographicCard';
import { H3, Paragraph, XStack, YStack, Button } from 'tamagui';

const meta: Meta<typeof HolographicCard> = {
  title: 'Components/HolographicCard',
  component: HolographicCard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
A stunning holographic card component with rainbow effects and mouse tracking.

**Features:**
- Multiple holographic variants (rainbow, chrome, aurora)
- Adjustable animation intensity
- Mouse tracking effects
- Smooth animations and transitions
- Accessible and keyboard navigable

**Inspired by:** Modern holographic trading cards and rainbow foil effects.
        `,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'rainbow', 'chrome', 'aurora'],
      description: 'Visual variant of the holographic effect',
    },
    intensity: {
      control: 'select',
      options: ['subtle', 'normal', 'intense'],
      description: 'Animation intensity level',
    },
    enableHover: {
      control: 'boolean',
      description: 'Enable hover effects and mouse tracking',
    },
    animationDelay: {
      control: { type: 'range', min: 0, max: 2000, step: 100 },
      description: 'Animation delay in milliseconds',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Sample content component
const CardContent = ({ title, subtitle, showButton = false }: { 
  title: string; 
  subtitle: string; 
  showButton?: boolean;
}) => (
  <YStack padding="$6" gap="$4" minHeight={200} justifyContent="space-between">
    <YStack gap="$2">
      <H3 color="$color" fontSize="$7" fontWeight="800">
        {title}
      </H3>
      <Paragraph color="$color11" fontSize="$4" opacity={0.9}>
        {subtitle}
      </Paragraph>
    </YStack>
    {showButton && (
      <Button
        backgroundColor="rgba(255, 255, 255, 0.1)"
        borderColor="rgba(255, 255, 255, 0.3)"
        borderWidth={1}
        color="$color"
        fontSize="$3"
        fontWeight="600"
        marginTop="$3"
      >
        ✨ Interact
      </Button>
    )}
  </YStack>
);

export const Rainbow: Story = {
  args: {
    variant: 'rainbow',
    intensity: 'normal',
    enableHover: true,
    animationDelay: 0,
  },
  render: (args) => (
    <HolographicCard {...args} style={{ width: 320, height: 240 }}>
      <CardContent 
        title="Rainbow Holographic" 
        subtitle="Beautiful rainbow effects with mouse tracking and smooth animations" 
        showButton 
      />
    </HolographicCard>
  ),
};

export const Chrome: Story = {
  args: {
    variant: 'chrome',
    intensity: 'normal',
    enableHover: true,
    animationDelay: 0,
  },
  render: (args) => (
    <HolographicCard {...args} style={{ width: 320, height: 240 }}>
      <CardContent 
        title="Chrome Finish" 
        subtitle="Metallic chrome effect with subtle reflections" 
        showButton 
      />
    </HolographicCard>
  ),
};

export const Aurora: Story = {
  args: {
    variant: 'aurora',
    intensity: 'normal',
    enableHover: true,
    animationDelay: 0,
  },
  render: (args) => (
    <HolographicCard {...args} style={{ width: 320, height: 240 }}>
      <CardContent 
        title="Aurora Borealis" 
        subtitle="Northern lights inspired with flowing colors" 
        showButton 
      />
    </HolographicCard>
  ),
};

export const IntensityComparison: Story = {
  render: () => (
    <XStack gap="$4" flexWrap="wrap">
      <HolographicCard variant="rainbow" intensity="subtle" style={{ width: 280, height: 200 }}>
        <CardContent title="Subtle" subtitle="Gentle holographic effects" />
      </HolographicCard>
      <HolographicCard variant="rainbow" intensity="normal" style={{ width: 280, height: 200 }}>
        <CardContent title="Normal" subtitle="Balanced holographic effects" />
      </HolographicCard>
      <HolographicCard variant="rainbow" intensity="intense" style={{ width: 280, height: 200 }}>
        <CardContent title="Intense" subtitle="Maximum holographic effects" />
      </HolographicCard>
    </XStack>
  ),
};

export const VariantShowcase: Story = {
  render: () => (
    <XStack gap="$4" flexWrap="wrap">
      <HolographicCard variant="rainbow" style={{ width: 240, height: 180 }}>
        <CardContent title="Rainbow" subtitle="Full spectrum colors" />
      </HolographicCard>
      <HolographicCard variant="chrome" style={{ width: 240, height: 180 }}>
        <CardContent title="Chrome" subtitle="Metallic finish" />
      </HolographicCard>
      <HolographicCard variant="aurora" style={{ width: 240, height: 180 }}>
        <CardContent title="Aurora" subtitle="Northern lights" />
      </HolographicCard>
    </XStack>
  ),
};

export const AnimationDelays: Story = {
  render: () => (
    <XStack gap="$4" flexWrap="wrap">
      <HolographicCard variant="rainbow" animationDelay={0} style={{ width: 200, height: 150 }}>
        <CardContent title="No Delay" subtitle="Immediate" />
      </HolographicCard>
      <HolographicCard variant="rainbow" animationDelay={200} style={{ width: 200, height: 150 }}>
        <CardContent title="200ms" subtitle="Slight delay" />
      </HolographicCard>
      <HolographicCard variant="rainbow" animationDelay={400} style={{ width: 200, height: 150 }}>
        <CardContent title="400ms" subtitle="More delay" />
      </HolographicCard>
      <HolographicCard variant="rainbow" animationDelay={600} style={{ width: 200, height: 150 }}>
        <CardContent title="600ms" subtitle="Staggered" />
      </HolographicCard>
    </XStack>
  ),
};

export const Interactive: Story = {
  args: {
    variant: 'rainbow',
    intensity: 'normal',
    enableHover: true,
    onPress: () => alert('Holographic card clicked!'),
  },
  render: (args) => (
    <HolographicCard {...args} style={{ width: 350, height: 260 }}>
      <YStack padding="$6" gap="$4" minHeight={200} justifyContent="space-between">
        <YStack gap="$2">
          <H3 color="$color" fontSize="$8" fontWeight="800">
            🎮 Interactive Card
          </H3>
          <Paragraph color="$color11" fontSize="$4" opacity={0.9}>
            Click me to see the interaction! Hover for mouse tracking effects.
          </Paragraph>
        </YStack>
        <XStack gap="$2" justifyContent="space-between">
          <Button
            backgroundColor="rgba(255, 0, 128, 0.2)"
            borderColor="rgba(255, 0, 128, 0.4)"
            borderWidth={1}
            color="$color"
            fontSize="$3"
            flex={1}
          >
            Action 1
          </Button>
          <Button
            backgroundColor="rgba(0, 128, 255, 0.2)"
            borderColor="rgba(0, 128, 255, 0.4)"
            borderWidth={1}
            color="$color"
            fontSize="$3"
            flex={1}
          >
            Action 2
          </Button>
        </XStack>
      </YStack>
    </HolographicCard>
  ),
};

export const Playground: Story = {
  args: {
    variant: 'rainbow',
    intensity: 'normal',
    enableHover: true,
    animationDelay: 0,
  },
  render: (args) => (
    <HolographicCard {...args} style={{ width: 400, height: 300 }}>
      <YStack padding="$6" gap="$4" flex={1} justifyContent="space-between">
        <YStack gap="$3">
          <H3 color="$color" fontSize="$8" fontWeight="800">
            🌈 Playground
          </H3>
          <Paragraph color="$color11" fontSize="$4" opacity={0.9}>
            Adjust the controls above to customize the holographic effects. 
            Move your mouse around to see the interactive tracking!
          </Paragraph>
          <Paragraph color="$color10" fontSize="$3" opacity={0.7}>
            Variant: {args.variant} • Intensity: {args.intensity}
          </Paragraph>
        </YStack>
        <XStack gap="$2" justifyContent="center">
          <div style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'linear-gradient(45deg, #ff0080, #0080ff)',
            animation: 'pulse 2s infinite'
          }} />
          <div style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'linear-gradient(45deg, #00ff80, #ff8000)',
            animation: 'pulse 2s infinite 0.2s'
          }} />
          <div style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'linear-gradient(45deg, #8000ff, #ff0040)',
            animation: 'pulse 2s infinite 0.4s'
          }} />
        </XStack>
      </YStack>
    </HolographicCard>
  ),
};
