// Mock for Tamagui components
import React from 'react';

// Basic styled components that render as simple divs/spans
export const View = ({ children, ...props }) =>
  React.createElement('div', props, children);
export const Text = ({ children, ...props }) =>
  React.createElement('span', props, children);
export const Button = ({ children, ...props }) =>
  React.createElement('button', props, children);
export const Input = ({ ...props }) => React.createElement('input', props);
export const XStack = ({ children, ...props }) =>
  React.createElement(
    'div',
    {
      ...props,
      style: { ...props.style, display: 'flex', flexDirection: 'row' },
    },
    children,
  );
export const YStack = ({ children, ...props }) =>
  React.createElement(
    'div',
    {
      ...props,
      style: { ...props.style, display: 'flex', flexDirection: 'column' },
    },
    children,
  );
export const Stack = ({ children, ...props }) =>
  React.createElement('div', props, children);
export const ScrollView = ({ children, ...props }) =>
  React.createElement(
    'div',
    { ...props, style: { ...props.style, overflow: 'auto' } },
    children,
  );
export const Card = ({ children, ...props }) =>
  React.createElement('div', props, children);
export const H1 = ({ children, ...props }) =>
  React.createElement('h1', props, children);
export const H2 = ({ children, ...props }) =>
  React.createElement('h2', props, children);
export const H3 = ({ children, ...props }) =>
  React.createElement('h3', props, children);
export const H4 = ({ children, ...props }) =>
  React.createElement('h4', props, children);
export const H5 = ({ children, ...props }) =>
  React.createElement('h5', props, children);
export const H6 = ({ children, ...props }) =>
  React.createElement('h6', props, children);
export const Paragraph = ({ children, ...props }) =>
  React.createElement('p', props, children);
export const Separator = ({ ...props }) => React.createElement('hr', props);
export const Avatar = ({ children, ...props }) =>
  React.createElement('div', props, children);
export const Image = ({ ...props }) => React.createElement('img', props);
export const Spinner = ({ ...props }) =>
  React.createElement('div', { ...props, children: 'Loading...' });
export const Progress = ({ ...props }) => React.createElement('div', props);
export const Slider = ({ ...props }) =>
  React.createElement('input', { ...props, type: 'range' });
export const Switch = ({ ...props }) =>
  React.createElement('input', { ...props, type: 'checkbox' });
export const RadioGroup = ({ children, ...props }) =>
  React.createElement('div', props, children);
export const Checkbox = ({ ...props }) =>
  React.createElement('input', { ...props, type: 'checkbox' });
export const Label = ({ children, ...props }) =>
  React.createElement('label', props, children);
export const Form = ({ children, ...props }) =>
  React.createElement('form', props, children);
export const Fieldset = ({ children, ...props }) =>
  React.createElement('fieldset', props, children);
export const Sheet = ({ children, ...props }) =>
  React.createElement('div', props, children);
export const Dialog = ({ children, ...props }) =>
  React.createElement('div', props, children);
export const Popover = ({ children, ...props }) =>
  React.createElement('div', props, children);
export const Tooltip = ({ children, ...props }) =>
  React.createElement('div', props, children);
export const AlertDialog = ({ children, ...props }) =>
  React.createElement('div', props, children);
export const Select = ({ children, ...props }) =>
  React.createElement('select', props, children);
export const Tabs = ({ children, ...props }) =>
  React.createElement('div', props, children);
export const ListItem = ({ children, ...props }) =>
  React.createElement('li', props, children);
export const Group = ({ children, ...props }) =>
  React.createElement('div', props, children);

// Tamagui provider and theme
export const TamaguiProvider = ({ children, ...props }) =>
  React.createElement('div', props, children);
export const Theme = ({ children, ...props }) =>
  React.createElement('div', props, children);
export const createTamagui = () => ({});
export const config = {};

// Styled function mock
export const styled = (component) => {
  return (styles) => {
    const StyledComponent = ({ children, ...props }) => {
      return React.createElement(component, props, children);
    };
    return StyledComponent;
  };
};

// Default export
export default {
  View,
  Text,
  Button,
  Input,
  XStack,
  YStack,
  Stack,
  ScrollView,
  Card,
  styled,
  TamaguiProvider,
  Theme,
};
