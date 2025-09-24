import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { TamaguiProvider } from 'tamagui';
import {
  BaseballScreen,
  FootballScreen,
  HomeScreen,
} from '@legacy-sports/shared-components';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';

export function App() {
  const handleSportPress = (sportKey: string): void => {
    console.log('Sport pressed:', sportKey);
    // Navigation logic would go here
  };

  return (
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    <TamaguiProvider config={tamaguiConfig}>
      <Routes>
        <Route
          path="/"
          element={<HomeScreen onSportPress={handleSportPress} />}
        />
        <Route path="/football" element={<FootballScreen />} />
        <Route path="/baseball" element={<BaseballScreen />} />
      </Routes>
    </TamaguiProvider>
  );
}
