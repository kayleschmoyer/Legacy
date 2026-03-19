import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { BrandIcon, BrandIconBadge, type BrandIconName } from './BrandIcon';
import {
  BG_DARK,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';

const WHITE = '#FFFFFF';

// ─── Storybook-friendly wrapper (flattens the discriminated union) ────────────
type BrandIconStoryProps = {
  name: BrandIconName;
  size?: number;
  color?: string;
  accentColor?: string;
  strokeWidth?: number;
};

function BrandIconStory(props: BrandIconStoryProps) {
  return <BrandIcon {...props} decorative />;
}

const ALL_ICONS: BrandIconName[] = [
  'baseball',
  'football',
  'stats',
  'draft',
  'live',
  'secure',
  'settings',
  'book',
  'google',
];

// ─── Wrapper helpers ──────────────────────────────────────────────────────────

function DarkBg({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: BG_DARK,
        padding: 24,
        borderRadius: 12,
        display: 'inline-flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      {children}
    </div>
  );
}

function Label({ text }: { text: string }) {
  return (
    <span
      style={{
        color: WHITE,
        fontSize: 10,
        fontFamily: 'monospace',
        opacity: 0.55,
        display: 'block',
        marginTop: 6,
        textAlign: 'center',
      }}
    >
      {text}
    </span>
  );
}

// ─── All Icons Grid ───────────────────────────────────────────────────────────

function AllIconsGrid() {
  return (
    <DarkBg>
      {ALL_ICONS.map((name) => (
        <div key={name} style={{ textAlign: 'center' }}>
          <BrandIcon name={name} size={32} decorative />
          <Label text={name} />
        </div>
      ))}
    </DarkBg>
  );
}

// ─── Size Scale ───────────────────────────────────────────────────────────────

function SizeScale() {
  const sizes = [16, 22, 28, 44] as const;
  return (
    <DarkBg>
      {sizes.map((size) => (
        <div key={size} style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 52,
            }}
          >
            <BrandIcon name="draft" size={size} decorative />
          </div>
          <Label text={`${size}px`} />
        </div>
      ))}
    </DarkBg>
  );
}

// ─── Colour Variants ──────────────────────────────────────────────────────────

function ColourVariants() {
  const variants = [
    {
      label: 'Gold + Red (default)',
      color: BRAND_GOLD_LIGHT,
      accent: BRAND_SEAM_RED,
    },
    { label: 'Navy + Gold', color: BRAND_NAVY_LIGHT, accent: BRAND_GOLD_LIGHT },
    { label: 'White mono', color: WHITE, accent: WHITE },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {variants.map(({ label, color, accent }) => (
        <div key={label}>
          <div
            style={{
              color: WHITE,
              fontSize: 11,
              fontFamily: 'monospace',
              marginBottom: 8,
              opacity: 0.7,
            }}
          >
            {label}
          </div>
          <DarkBg>
            {ALL_ICONS.map((name) => (
              <BrandIcon
                key={name}
                name={name}
                size={28}
                color={color}
                accentColor={accent}
                decorative
              />
            ))}
          </DarkBg>
        </div>
      ))}
    </div>
  );
}

// ─── Badge Variants ───────────────────────────────────────────────────────────

function BadgeVariants() {
  return (
    <DarkBg>
      {/* Circle badges at different sizes */}
      {([34, 44, 56] as const).map((size) => (
        <div key={`circle-${size}`} style={{ textAlign: 'center' }}>
          <BrandIconBadge
            name="draft"
            size={size}
            iconSize={Math.round(size * 0.55)}
            rounded="circle"
            decorative
          />
          <Label text={`circle ${size}`} />
        </div>
      ))}
      {/* Square badges */}
      {([44, 56] as const).map((size) => (
        <div key={`square-${size}`} style={{ textAlign: 'center' }}>
          <BrandIconBadge
            name="stats"
            size={size}
            iconSize={Math.round(size * 0.55)}
            rounded="square"
            decorative
          />
          <Label text={`square ${size}`} />
        </div>
      ))}
      {/* Navbar logo usage */}
      <div style={{ textAlign: 'center' }}>
        <BrandIconBadge
          name="baseball"
          size={34}
          iconSize={18}
          rounded="circle"
          decorative
        />
        <Label text="navbar logo" />
      </div>
      {/* Stats CTA usage */}
      <div style={{ textAlign: 'center' }}>
        <BrandIconBadge
          name="stats"
          size={56}
          iconSize={28}
          rounded="square"
          decorative
        />
        <Label text="stats CTA" />
      </div>
    </DarkBg>
  );
}

// ─── Feature Cards Context ────────────────────────────────────────────────────

function FeatureCardContext() {
  const features: { icon: BrandIconName; label: string }[] = [
    { icon: 'stats', label: 'Live Stats' },
    { icon: 'draft', label: 'Draft Tools' },
    { icon: 'live', label: 'Instant Updates' },
    { icon: 'secure', label: 'Secure Leagues' },
  ];

  return (
    <DarkBg>
      {features.map(({ icon, label }) => (
        <div
          key={icon}
          style={{
            background: withAlpha(BRAND_NAVY_LIGHT, 0.18),
            border: `1px solid ${withAlpha(BRAND_GOLD_LIGHT, 0.18)}`,
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 140,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 9999,
              background: withAlpha(BRAND_NAVY_LIGHT, 0.22),
              border: `1px solid ${withAlpha(BRAND_GOLD_LIGHT, 0.15)}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <BrandIcon name={icon} size={22} decorative />
          </div>
          <span
            style={{ color: WHITE, fontSize: 13, fontFamily: 'sans-serif' }}
          >
            {label}
          </span>
        </div>
      ))}
    </DarkBg>
  );
}

// ─── Button Context ───────────────────────────────────────────────────────────

function ButtonContext() {
  return (
    <DarkBg>
      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          background: BRAND_NAVY,
          border: `1px solid ${withAlpha(BRAND_GOLD_LIGHT, 0.25)}`,
          borderRadius: 8,
          color: WHITE,
          fontSize: 14,
          fontFamily: 'sans-serif',
          cursor: 'pointer',
        }}
      >
        <BrandIcon name="google" size={18} decorative />
        Continue with Google
      </button>
      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          background: 'transparent',
          border: `1px solid ${withAlpha(BRAND_GOLD_LIGHT, 0.25)}`,
          borderRadius: 8,
          color: BRAND_GOLD_LIGHT,
          fontSize: 14,
          fontFamily: 'sans-serif',
          cursor: 'pointer',
        }}
      >
        <BrandIcon name="settings" size={16} decorative />
        Preferences
      </button>
      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          background: 'transparent',
          border: `1px solid ${withAlpha(BRAND_GOLD_LIGHT, 0.25)}`,
          borderRadius: 8,
          color: BRAND_GOLD_LIGHT,
          fontSize: 14,
          fontFamily: 'sans-serif',
          cursor: 'pointer',
        }}
      >
        <BrandIcon name="book" size={16} decorative />
        How It Works
      </button>
    </DarkBg>
  );
}

// ─── Single BrandIcon story (controls) ───────────────────────────────────────

const meta: Meta<typeof BrandIconStory> = {
  title: 'Components/BrandIcon',
  component: BrandIconStory,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: BG_DARK },
        { name: 'navy', value: '#1B3A5C' },
        { name: 'light', value: '#F5F7FA' },
      ],
    },
    docs: {
      description: {
        component:
          'Bespoke sport-branded SVG icons with two-colour (gold + red) brand palette. ' +
          'Drawn on a 32×32 viewBox; stroke weight auto-scales to 2.2 at ≤16px for legibility.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    name: {
      control: 'select',
      options: ALL_ICONS,
      description: 'Icon glyph to render',
    },
    size: {
      control: { type: 'range', min: 12, max: 64, step: 2 },
      description: 'Rendered width & height in px',
    },
    color: {
      control: 'color',
      description: 'Primary stroke / fill colour (default: brand gold)',
    },
    accentColor: {
      control: 'color',
      description:
        'Accent colour for seams, star, checkmark (default: seam red)',
    },
    strokeWidth: {
      control: { type: 'range', min: 1.0, max: 3.0, step: 0.1 },
      description:
        'Override stroke weight (auto-calculated from size by default)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof BrandIconStory>;

// ─── Individual icon stories ──────────────────────────────────────────────────

export const Default: Story = {
  args: {
    name: 'baseball',
    size: 32,
  },
};

export const AllIcons: Story = {
  render: () => <AllIconsGrid />,
  parameters: { controls: { disable: true } },
};

export const SizeScaleStory: Story = {
  name: 'Size Scale',
  render: () => <SizeScale />,
  parameters: { controls: { disable: true } },
};

export const ColourVariantsStory: Story = {
  name: 'Colour Variants',
  render: () => <ColourVariants />,
  parameters: { controls: { disable: true } },
};

export const BadgeVariantsStory: Story = {
  name: 'Badge Variants',
  render: () => <BadgeVariants />,
  parameters: { controls: { disable: true } },
};

export const FeatureCardContextStory: Story = {
  name: 'Feature Card Context',
  render: () => <FeatureCardContext />,
  parameters: { controls: { disable: true } },
};

export const ButtonContextStory: Story = {
  name: 'Button Context',
  render: () => <ButtonContext />,
  parameters: { controls: { disable: true } },
};
