# PlayersTable Component

A comprehensive table component for displaying player data with search, sorting, and pagination capabilities.

## Features

- **Search**: Filter players by name or Bref ID
- **Sorting**: Sort by first name, last name, ID, or Bref ID (ascending/descending)
- **Pagination**: Navigate through large datasets efficiently
- **Selection**: Optional player selection with callbacks
- **Responsive**: Works on both web and mobile platforms
- **Compact Mode**: Space-efficient variant for smaller screens

## Basic Usage

```tsx
import { PlayersTable } from '@legacy-sports/shared-components';

function MyComponent() {
  const handlePlayerSelect = (player) => {
    console.log('Selected player:', player);
  };

  return (
    <PlayersTable title="All Players" onPlayerSelect={handlePlayerSelect} />
  );
}
```

## Advanced Usage

```tsx
import { PlayersTable, PlayerFragment } from '@legacy-sports/shared-components';

function PlayerSelectionModal({ onPlayerSelected, onClose }) {
  const handlePlayerSelect = (player: PlayerFragment) => {
    onPlayerSelected(player);
    onClose();
  };

  return (
    <PlayersTable
      title="Select a Player"
      compact={true}
      selectable={true}
      pageSize={10}
      showPagination={false}
      onPlayerSelect={handlePlayerSelect}
    />
  );
}
```

## Props

| Prop             | Type                               | Default     | Description                        |
| ---------------- | ---------------------------------- | ----------- | ---------------------------------- |
| `onPlayerSelect` | `(player: PlayerFragment) => void` | -           | Callback when a player is selected |
| `pageSize`       | `number`                           | `50`        | Number of players per page         |
| `showSearch`     | `boolean`                          | `true`      | Show/hide search functionality     |
| `showSorting`    | `boolean`                          | `true`      | Show/hide sorting dropdown         |
| `showPagination` | `boolean`                          | `true`      | Show/hide pagination controls      |
| `title`          | `string`                           | `"Players"` | Table title                        |
| `selectable`     | `boolean`                          | `false`     | Add selection buttons to each row  |
| `compact`        | `boolean`                          | `false`     | Use compact styling                |

## Player Data Structure

The component works with the `PlayerFragment` type:

```typescript
interface PlayerFragment {
  id?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  brefId?: string | null;
}
```

## Sorting Options

- First Name (A-Z / Z-A)
- Last Name (A-Z / Z-A)
- ID (Low to High / High to Low)
- Bref ID (A-Z / Z-A)

## Accessibility

- Keyboard navigation support
- Screen reader friendly
- High contrast color scheme
- Responsive design for all screen sizes

## Dependencies

- GraphQL API with players query
- Apollo Client for data fetching
- Tamagui for UI components
- Lucide icons for visual elements
