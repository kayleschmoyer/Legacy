// Mock for @react-navigation/native
const React = require('react');

const NavigationContainer = ({ children, ...props }) => {
  return React.createElement('div', { 'data-testid': 'navigation-container', ...props }, children);
};

module.exports = {
  NavigationContainer,
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    reset: jest.fn(),
    setParams: jest.fn(),
    dispatch: jest.fn(),
  }),
  useRoute: () => ({
    params: {},
    name: 'TestRoute',
    key: 'test-key',
  }),
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
  useNavigationState: () => ({}),
};
