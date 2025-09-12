import React from 'react';
import { render } from '@testing-library/react';
import { Text, View } from '../../../platform-components';
import {
  BaseballScreen,
  BasketballScreen,
  FootballScreen,
  HockeyScreen,
  SportScreen,
} from '../SportScreens';

describe('SportScreens', () => {
  describe('SportScreen', () => {
    it('renders correctly with default props', () => {
      const { getByText } = render(<SportScreen sportName="Soccer" />);
      expect(getByText('Soccer Fantasy')).toBeTruthy();
    });

    it('renders correctly with custom props', () => {
      const { getByText } = render(
        <SportScreen
          sportName="Soccer"
          title="Custom Soccer Title"
          subtitle="Custom subtitle"
          backgroundColor="#FF0000"
          titleColor="#FFFFFF"
          subtitleColor="#CCCCCC"
        />,
      );
      expect(getByText('Custom Soccer Title')).toBeTruthy();
      expect(getByText('Custom subtitle')).toBeTruthy();
    });

    it('renders correctly with children', () => {
      const { getByText } = render(
        <SportScreen sportName="Soccer">
          <View>
            <Text>Custom content</Text>
          </View>
        </SportScreen>,
      );
      expect(getByText('Custom content')).toBeTruthy();
    });

    it('displays sport name in default title', () => {
      const { getByText } = render(<SportScreen sportName="Soccer" />);
      expect(getByText('Soccer Fantasy')).toBeTruthy();
    });

    it('displays custom title when provided', () => {
      const { getByText } = render(
        <SportScreen sportName="Soccer" title="Custom Title" />,
      );
      expect(getByText('Custom Title')).toBeTruthy();
    });
  });

  describe('BaseballScreen', () => {
    it('renders correctly with default props', () => {
      const { getByText } = render(<BaseballScreen />);
      expect(getByText('Baseball Fantasy')).toBeTruthy();
    });

    it('displays Baseball Fantasy title', () => {
      const { getByText } = render(<BaseballScreen />);
      expect(getByText('Baseball Fantasy')).toBeTruthy();
    });

    it('renders with custom props', () => {
      const { getByText } = render(
        <BaseballScreen
          title="MLB Season"
          subtitle="2024 Season Starting Soon"
        />,
      );
      expect(getByText('MLB Season')).toBeTruthy();
      expect(getByText('2024 Season Starting Soon')).toBeTruthy();
    });
  });

  describe('FootballScreen', () => {
    it('renders correctly with default props', () => {
      const { getByText } = render(<FootballScreen />);
      expect(getByText('Football Fantasy')).toBeTruthy();
    });

    it('displays Football Fantasy title', () => {
      const { getByText } = render(<FootballScreen />);
      expect(getByText('Football Fantasy')).toBeTruthy();
    });
  });

  describe('BasketballScreen', () => {
    it('renders correctly with default props', () => {
      const { getByText } = render(<BasketballScreen />);
      expect(getByText('Basketball Fantasy')).toBeTruthy();
    });

    it('displays Basketball Fantasy title', () => {
      const { getByText } = render(<BasketballScreen />);
      expect(getByText('Basketball Fantasy')).toBeTruthy();
    });
  });

  describe('HockeyScreen', () => {
    it('renders correctly with default props', () => {
      const { getByText } = render(<HockeyScreen />);
      expect(getByText('Hockey Fantasy')).toBeTruthy();
    });

    it('displays Hockey Fantasy title', () => {
      const { getByText } = render(<HockeyScreen />);
      expect(getByText('Hockey Fantasy')).toBeTruthy();
    });
  });
});
