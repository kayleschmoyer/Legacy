/**
 * Unified ESLint Configuration System for Legacy Sports
 *
 * This module provides centralized ESLint configurations for different project types,
 * eliminating conflicts and ensuring consistency across the workspace.
 *
 * Usage:
 *   const { base, react, lambda, library } = require('@legacy-sports/eslint-config');
 *
 * Based on Repository Improvements Plan - High Priority Issue #4
 */

module.exports = {
  base: require('./base'),
  react: require('./react'),
  lambda: require('./lambda'),
  library: require('./library'),
  e2e: require('./e2e'),
};
