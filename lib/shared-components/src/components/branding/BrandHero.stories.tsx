import type { Meta, StoryObj } from '@storybook/react';
import { BrandHero } from './BrandHero';

const meta: Meta<typeof BrandHero> = {
  title: 'Branding/BrandHero',
  component: BrandHero,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Signature dark-stadium hero composition. Layered radial gradients on the night-stadium background, with a gold eyebrow, display-face headline, and editorial subhead. Mirrors `docs/design/7SRWFMj3a6khIhwLuWkSKA/.../preview/brand-hero.html` in the design bundle.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    eyebrow: 'Night Stadium · Signature Background',
    headline: (
      <>
        Build Your Dynasty.
        <br />
        Dominate Your League.
      </>
    ),
    subhead:
      'The only fantasy baseball platform powered by real MLB history — draft legends across every era.',
  },
};

export const WithoutEyebrow: Story = {
  args: {
    headline: 'Where History Plays On.',
    subhead: 'Fantasy baseball, anchored in real MLB seasons since 1871.',
  },
};

export const HeadlineOnly: Story = {
  args: {
    headline: 'Opening Day awaits.',
  },
};
