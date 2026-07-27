/**
 * Unified ESLint Configuration System for Legacy Sports (flat config)
 *
 * This module provides centralized ESLint flat configs for different project types,
 * eliminating conflicts and ensuring consistency across the workspace.
 *
 * Usage:
 *   import { base, react, lambda, library, e2e } from '@legacy-sports/eslint-config';
 *
 *   export default [...react, ...myProjectRules];
 *
 * Based on Repository Improvements Plan - High Priority Issue #4
 */
import base from './base.mjs';
import e2e from './e2e.mjs';
import lambda from './lambda.mjs';
import library from './library.mjs';
import react from './react.mjs';

export { base, react, lambda, library, e2e };
