import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { TamaguiProvider } from 'tamagui';
import {
  BaseballScreen,
  DemoScreen,
  FootballScreen,
  HomeScreen,
  tamaguiConfig,
} from '@legacy-sports/shared-components';

export function App() {
  const handleSportPress = (sportKey: string) => {
    console.log('Sport pressed:', sportKey);
    // Navigation logic would go here
  };

  return (
    <TamaguiProvider config={tamaguiConfig}>
      <Routes>
        <Route
          path="/"
          element={<HomeScreen onSportPress={handleSportPress} />}
        />
        <Route path="/football" element={<FootballScreen />} />
        <Route path="/baseball" element={<BaseballScreen />} />
        <Route path="/demo" element={<DemoScreen />} />
      </Routes>
    </TamaguiProvider>
  );
}
