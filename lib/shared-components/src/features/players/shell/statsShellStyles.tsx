import React from 'react';
import { BG_PAGE, FONT_BODY } from './tokens';
import { Platform } from '../../../platform-components';
import {
  BRAND_GOLD,
  SURFACE_PANEL,
  TEXT_PRIMARY,
  WHITE,
  withAlpha,
} from '../../../utils/colors';

/**
 * Web-only CSS for the stats shell: tab crossfade, advanced-panel slide, slider
 * track/thumb, state-card shimmer, and the responsive toolbar / advanced /
 * column grid templates. Rendered once near the top of the shell. Extracted from
 * the baseball monolith so both sport configs share identical `.ps-*` styling.
 */
export function StatsShellStyles(): React.JSX.Element | null {
  if (Platform.OS !== 'web') return null;
  return (
    <style>{`
      @keyframes ps-fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes ps-advSlide {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes ps-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
      @media (prefers-reduced-motion: no-preference) {
        .ps-tabContent { animation: ps-fadeIn 140ms ease forwards; }
        .ps-adv-panel { animation: ps-advSlide 180ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
      }
      @media (prefers-reduced-motion: reduce) {
        .ps-adv-panel { animation: none; }
      }
      .ps-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 4px;
        background: linear-gradient(to right, ${BRAND_GOLD} 0%, ${BRAND_GOLD} var(--pct,0%), ${withAlpha(WHITE, 0.08)} var(--pct,0%), ${withAlpha(WHITE, 0.08)} 100%);
        border-radius: 9999px; outline: 0; cursor: pointer; }
      .ps-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px;
        border-radius: 50%; background: ${BRAND_GOLD}; border: 2px solid ${BG_PAGE}; cursor: pointer; }
      .ps-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%;
        background: ${BRAND_GOLD}; border: 2px solid ${BG_PAGE}; cursor: pointer; }
      .ps-select-native { appearance: none; background: transparent; border: 0; outline: 0;
        color: ${TEXT_PRIMARY}; font-family: ${FONT_BODY}; font-size: 14px; padding: 0; cursor: pointer; width: 100%; }
      .ps-select-native option { background: ${SURFACE_PANEL}; color: ${TEXT_PRIMARY}; }
      .ps-sk-bar { display: inline-block; height: 10px; border-radius: 3px;
        background: linear-gradient(90deg, ${withAlpha(WHITE, 0.04)} 0%, ${withAlpha(WHITE, 0.14)} 50%, ${withAlpha(WHITE, 0.04)} 100%);
        background-size: 400px 100%; animation: ps-shimmer 1.4s linear infinite; }
      @media (prefers-reduced-motion: reduce) {
        .ps-tabContent { animation: none; }
        .ps-sk-bar { animation: none; background: ${withAlpha(WHITE, 0.08)}; }
      }
      .ps-toolbar { grid-template-columns: minmax(240px, 1.5fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) auto; }
      @media (max-width: 640px) {
        .ps-toolbar { grid-template-columns: 1fr; }
        .ps-toolbar > * { width: 100%; }
      }
      .ps-adv-grid { grid-template-columns: repeat(3, 1fr); }
      @media (max-width: 640px) {
        .ps-adv-grid { grid-template-columns: 1fr; }
      }
      .ps-col-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); column-gap: 20px; }
    `}</style>
  );
}
