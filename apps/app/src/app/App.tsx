import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import Home from '../pages/Home';
import FootballHome from '../pages/NFLHome';
import BaseballHome from '../pages/MLBHome';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen name="FootballHome" component={FootballHome} />
        <Stack.Screen name="BaseballHome" component={BaseballHome} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
