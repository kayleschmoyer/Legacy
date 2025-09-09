// Mock for @react-navigation/drawer
const React = require('react');

const createDrawerNavigator = () => {
  const Navigator = ({ children, ...props }) => {
    return React.createElement('div', { 'data-testid': 'drawer-navigator', ...props }, children);
  };
  
  const Screen = ({ children, ...props }) => {
    return React.createElement('div', { 'data-testid': 'drawer-screen', ...props }, children);
  };

  return { Navigator, Screen };
};

module.exports = {
  createDrawerNavigator,
};
