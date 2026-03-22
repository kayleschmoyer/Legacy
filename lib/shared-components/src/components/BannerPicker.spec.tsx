import { BannerPicker } from './BannerPicker';
import { render } from '../test-utils';

describe('BannerPicker', () => {
  const onSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "PREVIEW" section', () => {
    const { getByText } = render(<BannerPicker onSelect={onSelect} />);
    expect(getByText('PREVIEW')).toBeTruthy();
  });

  it('renders "PRESETS" section', () => {
    const { getByText } = render(<BannerPicker onSelect={onSelect} />);
    expect(getByText('PRESETS')).toBeTruthy();
  });

  it('renders Save and Clear buttons', () => {
    const { getByText } = render(<BannerPicker onSelect={onSelect} />);
    expect(getByText('Save')).toBeTruthy();
    expect(getByText('Clear')).toBeTruthy();
  });

  it('shows "Saving..." when loading', () => {
    const { getByText } = render(<BannerPicker onSelect={onSelect} loading />);
    expect(getByText('Saving...')).toBeTruthy();
  });

  it('shows "No banner selected" when no URL', () => {
    const { getByText } = render(<BannerPicker onSelect={onSelect} />);
    expect(getByText('No banner selected')).toBeTruthy();
  });
});
