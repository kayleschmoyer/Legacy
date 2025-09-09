// Mock for @react-navigation/stack
const React = require('react');

const createStackNavigator = () => {
  const Navigator = ({ children, ...props }) => {
    return React.createElement(
      'div',
      { 'data-testid': 'stack-navigator', ...props },
      children,
    );
  };

  const Screen = ({ children, ...props }) => {
    return React.createElement(
      'div',
      { 'data-testid': 'stack-screen', ...props },
      children,
    );
  };

  return { Navigator, Screen };
};

module.exports = {
  createStackNavigator,
};
