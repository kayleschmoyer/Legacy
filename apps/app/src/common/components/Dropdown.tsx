/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-redundant-type-constituents */
import { Select } from 'tamagui';

export interface DropdownItem {
  text: string;
  value: string;
}

export interface DropdownProperties {
  value: string;
  onChange: (value: string) => void;
  items: readonly Readonly<DropdownItem>[];
}

export function Dropdown(props: DropdownProperties): JSX.Element {
  const { value, onChange, items } = props;

  return (
    <Select value={value} onValueChange={onChange}>
      <Select.Trigger>
        <Select.Value placeholder="Select an option..." />
      </Select.Trigger>

      <Select.Content>
        <Select.ScrollUpButton />
        <Select.Viewport>
          {items.map((item) => (
            <Select.Item key={item.value} index={item.value} value={item.value}>
              <Select.ItemText>{item.text}</Select.ItemText>
            </Select.Item>
          ))}
        </Select.Viewport>
        <Select.ScrollDownButton />
      </Select.Content>
    </Select>
  );
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-redundant-type-constituents */
