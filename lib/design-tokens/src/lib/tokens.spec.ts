import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  brand,
  breakpoints,
  colors,
  glassDark,
  glassLight,
  lightSurface,
  lightText,
  positions,
  radii,
  semantic,
  shadowsDark,
  shadowsLight,
  spacing,
} from '../index';

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');

function extractBlock(selector: string): string {
  // Capture the body of the first rule whose selector list contains `selector`.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[,\\s])${escaped}[^{]*\\{([^}]*)\\}`, 'm');
  const match = css.match(re);
  if (!match) throw new Error(`block not found: ${selector}`);
  return match[1] ?? '';
}

const rootBlock = extractBlock(':root');
const lightBlock = extractBlock("[data-theme='light']");

function expectVar(block: string, name: string, value: string) {
  expect(block).toContain(`--${name}: ${value};`);
}

describe('design-tokens', () => {
  it('exposes the heritage brand anchors from AGENTS.md', () => {
    expect(brand.navy).toBe('#1B3A5C');
    expect(brand.seamRed).toBe('#C41E3A');
    expect(brand.gold).toBe('#C5A55A');
  });

  it('layers dark surfaces from page → elevated per the brand stack', () => {
    expect(colors.dark.surface.bg).toBe('#0A0F1A');
    expect(colors.dark.surface.surfaceSubtle).toBe('#0D1526');
    expect(colors.dark.surface.surfacePanel).toBe('#111B2F');
    expect(colors.dark.surface.surfaceCard).toBe('#16223A');
  });

  it('matches the Tamagui $1–$10 spacing scale (px)', () => {
    expect(spacing[1]).toBe(4);
    expect(spacing[4]).toBe(16);
    expect(spacing[10]).toBe(72);
  });

  it('provides the full radius scale including pill', () => {
    expect(radii[1]).toBe(4);
    expect(radii[7]).toBe(24);
    expect(radii.pill).toBe(9999);
  });

  it('mirrors @tamagui/config breakpoint thresholds', () => {
    expect(breakpoints.xxs).toBe(0);
    expect(breakpoints.xs).toBe(660);
    expect(breakpoints.sm).toBe(800);
    expect(breakpoints.md).toBe(860);
    expect(breakpoints.lg).toBe(980);
    expect(breakpoints.xl).toBe(1120);
    expect(breakpoints.xxl).toBe(1280);
  });

  it('exposes position colors for the five baseball roles', () => {
    expect(positions.pitcher).toBe('#C41E3A');
    expect(positions.outfield).toBe('#2D6A4F');
    expect(positions.utility).toBe('#C5A55A');
  });

  it('exposes a focus ring tuned for dark backgrounds', () => {
    expect(semantic.focusRing).toBe('#4E8ED6');
  });

  it('ships dark-theme shadow recipes', () => {
    expect(shadowsDark.sm).toContain('rgba(8, 12, 20');
    expect(shadowsDark.gold).toContain('rgba(197, 165, 90');
  });

  // Regression guard: the CSS file is the shipped asset that downstream apps
  // (and the design preview bundle) compare against — keep the TS exports and
  // the CSS custom properties in lockstep.
  describe('CSS ↔ TS lockstep', () => {
    it('mirrors every brand anchor in :root', () => {
      expectVar(rootBlock, 'brand-navy', brand.navy.toLowerCase());
      expectVar(rootBlock, 'brand-navy-light', brand.navyLight.toLowerCase());
      expectVar(rootBlock, 'brand-navy-dark', brand.navyDark.toLowerCase());
      expectVar(rootBlock, 'brand-seam-red', brand.seamRed.toLowerCase());
      expectVar(
        rootBlock,
        'brand-seam-red-light',
        brand.seamRedLight.toLowerCase(),
      );
      expectVar(
        rootBlock,
        'brand-seam-red-dark',
        brand.seamRedDark.toLowerCase(),
      );
      expectVar(rootBlock, 'brand-gold', brand.gold.toLowerCase());
      expectVar(rootBlock, 'brand-gold-light', brand.goldLight.toLowerCase());
      expectVar(rootBlock, 'brand-gold-dark', brand.goldDark.toLowerCase());
    });

    it('mirrors every dark-theme surface + text token in :root', () => {
      const surface = colors.dark.surface;
      expectVar(rootBlock, 'bg', surface.bg.toLowerCase());
      expectVar(rootBlock, 'bg-hover', surface.bgHover.toLowerCase());
      expectVar(rootBlock, 'bg-press', surface.bgPress.toLowerCase());
      expectVar(
        rootBlock,
        'surface-subtle',
        surface.surfaceSubtle.toLowerCase(),
      );
      expectVar(rootBlock, 'surface-panel', surface.surfacePanel.toLowerCase());
      expectVar(rootBlock, 'surface-card', surface.surfaceCard.toLowerCase());
      expectVar(
        rootBlock,
        'surface-raised',
        surface.surfaceRaised.toLowerCase(),
      );
      expectVar(
        rootBlock,
        'outline-subtle',
        surface.outlineSubtle.toLowerCase(),
      );
      expectVar(
        rootBlock,
        'outline-default',
        surface.outlineDefault.toLowerCase(),
      );
      expectVar(
        rootBlock,
        'outline-strong',
        surface.outlineStrong.toLowerCase(),
      );
      expectVar(rootBlock, 'panel-border', surface.panelBorder.toLowerCase());

      const text = colors.dark.text;
      expectVar(rootBlock, 'fg1', text.fg1.toLowerCase());
      expectVar(rootBlock, 'fg1-strong', text.fg1Strong.toLowerCase());
      expectVar(rootBlock, 'fg2', text.fg2.toLowerCase());
      expectVar(rootBlock, 'fg3', text.fg3.toLowerCase());
      expectVar(rootBlock, 'fg4', text.fg4.toLowerCase());
      expectVar(rootBlock, 'fg-on-accent', text.fgOnAccent.toLowerCase());
    });

    it('mirrors all five position colors and the semantic focus ring', () => {
      expectVar(rootBlock, 'pos-pitcher', positions.pitcher.toLowerCase());
      expectVar(rootBlock, 'pos-catcher', positions.catcher.toLowerCase());
      expectVar(rootBlock, 'pos-infield', positions.infield.toLowerCase());
      expectVar(rootBlock, 'pos-outfield', positions.outfield.toLowerCase());
      expectVar(rootBlock, 'pos-utility', positions.utility.toLowerCase());
      expectVar(rootBlock, 'focus-ring', semantic.focusRing.toLowerCase());
    });

    it('mirrors glass tokens for both themes', () => {
      expectVar(rootBlock, 'glass-surface', glassDark.surface);
      expectVar(rootBlock, 'glass-surface-light', glassDark.surfaceLight);
      expectVar(rootBlock, 'glass-border', glassDark.border);
      expectVar(rootBlock, 'glass-border-hover', glassDark.borderHover);
      expectVar(lightBlock, 'glass-surface', glassLight.surface);
      expectVar(lightBlock, 'glass-surface-light', glassLight.surfaceLight);
      expectVar(lightBlock, 'glass-border', glassLight.border);
      expectVar(lightBlock, 'glass-border-hover', glassLight.borderHover);
    });

    it('mirrors the full spacing scale', () => {
      for (const [step, px] of Object.entries(spacing)) {
        expectVar(rootBlock, `space-${step}`, `${px}px`);
      }
    });

    it('mirrors the full radius scale (with pill)', () => {
      for (const [step, px] of Object.entries(radii)) {
        expectVar(rootBlock, `radius-${step}`, `${px}px`);
      }
    });

    it('mirrors the full breakpoint scale', () => {
      for (const [name, px] of Object.entries(breakpoints)) {
        expectVar(rootBlock, `bp-${name}`, `${px}px`);
      }
    });

    it('mirrors dark-theme shadow recipes', () => {
      expectVar(rootBlock, 'shadow-sm', shadowsDark.sm);
      expectVar(rootBlock, 'shadow-md', shadowsDark.md);
      expectVar(rootBlock, 'shadow-lg', shadowsDark.lg);
      expectVar(rootBlock, 'shadow-xl', shadowsDark.xl);
    });

    it('mirrors light-theme surface + text + shadow overrides', () => {
      expectVar(lightBlock, 'bg', lightSurface.bg.toLowerCase());
      expectVar(lightBlock, 'bg-hover', lightSurface.bgHover.toLowerCase());
      expectVar(lightBlock, 'bg-press', lightSurface.bgPress.toLowerCase());
      expectVar(
        lightBlock,
        'surface-subtle',
        lightSurface.surfaceSubtle.toLowerCase(),
      );
      expectVar(
        lightBlock,
        'surface-panel',
        lightSurface.surfacePanel.toLowerCase(),
      );
      expectVar(
        lightBlock,
        'surface-card',
        lightSurface.surfaceCard.toLowerCase(),
      );
      expectVar(
        lightBlock,
        'surface-raised',
        lightSurface.surfaceRaised.toLowerCase(),
      );
      expectVar(
        lightBlock,
        'outline-subtle',
        lightSurface.outlineSubtle.toLowerCase(),
      );
      expectVar(
        lightBlock,
        'outline-default',
        lightSurface.outlineDefault.toLowerCase(),
      );
      expectVar(
        lightBlock,
        'outline-strong',
        lightSurface.outlineStrong.toLowerCase(),
      );
      expectVar(
        lightBlock,
        'panel-border',
        lightSurface.panelBorder.toLowerCase(),
      );

      expectVar(lightBlock, 'fg1', lightText.fg1.toLowerCase());
      expectVar(lightBlock, 'fg1-strong', lightText.fg1Strong.toLowerCase());
      expectVar(lightBlock, 'fg2', lightText.fg2.toLowerCase());
      expectVar(lightBlock, 'fg3', lightText.fg3.toLowerCase());
      expectVar(lightBlock, 'fg4', lightText.fg4.toLowerCase());

      expectVar(lightBlock, 'shadow-sm', shadowsLight.sm);
      expectVar(lightBlock, 'shadow-md', shadowsLight.md);
      expectVar(lightBlock, 'shadow-lg', shadowsLight.lg);
      expectVar(lightBlock, 'shadow-xl', shadowsLight.xl);
    });

    it('overrides brand gold for light theme (desaturated for AA on white)', () => {
      const lightGold = colors.light.brandGoldOverride;
      expectVar(lightBlock, 'brand-gold', lightGold.gold.toLowerCase());
      expectVar(
        lightBlock,
        'brand-gold-light',
        lightGold.goldLight.toLowerCase(),
      );
      expectVar(
        lightBlock,
        'brand-gold-dark',
        lightGold.goldDark.toLowerCase(),
      );
    });
  });
});
