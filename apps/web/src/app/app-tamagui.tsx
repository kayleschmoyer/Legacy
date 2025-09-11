import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { TamaguiProvider } from '@tamagui/core';
import config from '../../../../lib/shared-components/src/tamagui.config.web';
import {
  BaseballScreen,
  DemoScreen,
  FootballScreen,
  HomeScreen,
} from '@legacy-sports/shared-components';

export function App() {
  return (
    <TamaguiProvider config={config}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/football" element={<FootballScreen />} />
        <Route path="/baseball" element={<BaseballScreen />} />
        <Route path="/demo" element={<DemoScreen />} />
      </Routes>
    </TamaguiProvider>
  );
}
