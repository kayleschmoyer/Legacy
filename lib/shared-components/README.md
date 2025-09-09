# Shared Components Library

A comprehensive collection of cross-platform React Native components for fantasy sports applications, designed to work seamlessly across mobile and web platforms.

## Overview

This shared components library provides a complete UI toolkit for fantasy sports applications, including authentication, league management, player drafting, statistics display, and navigation. All components are built with React Native and support both native mobile apps and web applications through react-native-web.

## Migration Summary

Successfully migrated the following UI functionality from `apps/app` to shared components:

✅ **Stats Tables**: Generic table component with baseball batting/pitching variants  
✅ **Draft Board**: Complete draft interface with timer, filtering, and player selection  
✅ **League Creation**: Modal-based league creation with sport selection  
✅ **Free Agents**: Waiver wire interface with FAAB bidding system  
✅ **Authentication**: Login/register/forgot password forms with validation  
✅ **Navigation**: Drawer, tab, and breadcrumb navigation systems  
✅ **Sport Home**: Unified home screen template for all sports  
✅ **Home Screen**: Main landing page with sport selection and custom actions  
✅ **Type System**: Comprehensive TypeScript interfaces and configurations  
✅ **Theming**: Sport-specific colors and consistent design system

## Key Features

- 🏆 **Multi-sport support**: Baseball, Football, Basketball, Hockey
- 📊 **Statistics display**: Sortable tables with sport-specific stats
- 🏈 **Draft management**: Real-time draft board with timer and filtering
- 👥 **League management**: Create leagues, manage rosters, waiver claims
- 🔐 **Authentication**: Complete auth flows with form validation
- 🧭 **Navigation**: Multiple navigation patterns for mobile and web
- 🏠 **Home Screen**: Customizable landing page with sport selection grid
- 📱 **Cross-platform**: Works on React Native and react-native-web
- 🎨 **Theming**: Sport-specific colors and consistent design

## Usage Examples

```typescript
// Home screen
import { HomeScreen } from '@legacy-sports/shared-components';

// Statistics display
import {
  BattingStatsTable,
  PitchingStatsTable,
} from '@legacy-sports/shared-components';

// Draft management
import { DraftBoard } from '@legacy-sports/shared-components';

// League creation
import { CreateLeagueModal, SportHome } from '@legacy-sports/shared-components';

// Player management
import { FreeAgents } from '@legacy-sports/shared-components';

// Authentication
import { AuthForm, AuthProvider } from '@legacy-sports/shared-components';

// Navigation
import {
  NavigationDrawer,
  TabNavigation,
} from '@legacy-sports/shared-components';
```

All components are fully typed, cross-platform compatible, and ready for use in both mobile and web applications.

## Building

Run `nx build shared-components` to build the library.

## Running unit tests

Run `nx test shared-components` to execute the unit tests via [Jest](https://jestjs.io).
