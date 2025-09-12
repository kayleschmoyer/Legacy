import React from 'react';
import { render } from '@testing-library/react';
import { Text, View } from '../../../platform-components';
import { MLBHome } from '../MLBHome';

describe('MLBHome', () => {
  it('renders correctly with default props', () => {
    const { getByText } = render(<MLBHome />);
    expect(getByText('MLB Players')).toBeTruthy();
  });

  it('renders correctly with custom title and subtitle', () => {
    const { getByText } = render(
      <MLBHome title="Custom MLB Title" subtitle="Custom subtitle for MLB" />,
    );

    expect(getByText('Custom MLB Title')).toBeTruthy();
    expect(getByText('Custom subtitle for MLB')).toBeTruthy();
  });

  it('renders correctly with children', () => {
    const { getByText } = render(
      <MLBHome>
        <View>
          <Text>Custom child content</Text>
        </View>
      </MLBHome>,
    );

    expect(getByText('Custom child content')).toBeTruthy();
  });

  it('displays the default title', () => {
    const { getByText } = render(<MLBHome />);
    expect(getByText('MLB Players')).toBeTruthy();
  });

  it('displays custom title and subtitle', () => {
    const { getByText } = render(
      <MLBHome title="Custom Title" subtitle="Custom Subtitle" />,
    );

    expect(getByText('Custom Title')).toBeTruthy();
    expect(getByText('Custom Subtitle')).toBeTruthy();
  });
});
