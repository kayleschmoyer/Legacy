import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import {
  BaseballScreen,
  FootballScreen,
  HomeScreen,
} from '@legacy-sports/shared-components';

const Drawer = createDrawerNavigator();
const Stack = createStackNavigator();

function HomeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1E1E1E' },
        headerTintColor: '#FFFFFF',
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Fantasy Sports Hub' }}
      />
      <Stack.Screen
        name="Football"
        component={FootballScreen}
        options={{ title: 'Football' }}
      />
      <Stack.Screen
        name="Baseball"
        component={BaseballScreen}
        options={{ title: 'Baseball' }}
      />
    </Stack.Navigator>
  );
}

export function TamaguiAppNavigator() {
  return (
    <NavigationContainer>
      <Drawer.Navigator
        initialRouteName="HomeStack"
        screenOptions={{
          headerStyle: { backgroundColor: '#1E1E1E' },
          headerTintColor: '#FFFFFF',
          drawerStyle: { backgroundColor: '#1E1E1E' },
          drawerLabelStyle: { color: '#FFFFFF' },
        }}
      >
        <Drawer.Screen
          name="HomeStack"
          component={HomeStack}
          options={{ title: 'Sports Hub' }}
        />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}
