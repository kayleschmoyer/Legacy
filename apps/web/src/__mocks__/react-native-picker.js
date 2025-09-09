// Mock for @react-native-picker/picker
const React = require('react');

const MockPicker = ({ children, ...props }) => {
  return React.createElement('select', props, children);
};

MockPicker.Item = ({ label, value, ...props }) => {
  return React.createElement('option', { value, ...props }, label);
};

module.exports = {
  Picker: MockPicker,
};
