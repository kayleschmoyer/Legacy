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
        headerStyle: { backgroundColor: '#0A0F1A' },
        headerTintColor: '#F8FAFC',
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
