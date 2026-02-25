import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from '../app/(app)/index';
import FootballScreen from '../screens/FootballScreen';
import BaseballScreen from '../screens/BaseballScreen';
import AboutScreen from '../screens/AboutScreen';

const Drawer = createDrawerNavigator();
const Stack = createStackNavigator();

function HomeStack() {
  return (
    <Stack.Navigator id="home-stack">
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
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ title: 'About' }}
      />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Drawer.Navigator
        id="main-drawer"
        initialRouteName="HomeStack"
        screenOptions={{
          headerStyle: { backgroundColor: '#0A0F1A' },
          headerTintColor: '#F8FAFC',
          drawerStyle: { backgroundColor: '#0A0F1A' },
          drawerLabelStyle: { color: '#F8FAFC' },
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
