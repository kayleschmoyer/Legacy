# Navigation Menu Reorganization

## Summary

Reorganized the header navigation menu by grouping related items into dropdown menus to reduce clutter and improve user experience.

## Changes Made

### Before

The navigation menu had 7 individual items:

1. Home
2. Football
3. Baseball
4. Players
5. Player Stats
6. Management
7. About

### After

The navigation menu now has 5 items (3 individual + 2 dropdowns):

1. **Home** (individual link)
2. **Sports** (dropdown) ▾
   - 🏈 Football
   - ⚾ Baseball
3. **Players** (dropdown) ▾
   - 👤 All Players
   - 📊 Player Stats
4. **Management** (individual link)
5. **About** (individual link)

## New Components Created

### 1. SportsDropdown.tsx

- Location: `apps/web/src/components/SportsDropdown.tsx`
- Groups Football and Baseball under a "Sports" dropdown
- Shows active state when either sport page is active
- Uses 🏆 trophy icon for the dropdown button

### 2. PlayersDropdown.tsx

- Location: `apps/web/src/components/PlayersDropdown.tsx`
- Groups All Players and Player Stats under a "Players" dropdown
- Shows active state when either player page is active
- Uses 👥 people icon for the dropdown button

## Technical Details

Both dropdown components:

- Use the same pattern as `UserProfileDropdown` for consistency
- Include click-outside detection to close the dropdown
- Styled with Tamagui styled components
- Position dropdown content absolutely below the button
- Highlight active state when on any of the grouped routes
- Close automatically when a menu item is clicked

## Benefits

1. **Reduced visual clutter** - Fewer top-level menu items
2. **Logical grouping** - Related items are grouped together
3. **Scalability** - Easy to add more sports or player-related pages in the future
4. **Consistent UX** - Dropdown pattern matches existing user profile dropdown
5. **Improved navigation** - Clear categorization of app sections

## Files Modified

1. `apps/web/src/app/app.tsx`
   - Added imports for new dropdown components
   - Replaced individual links with dropdown components
   - Removed obsolete `BaseballDropdownMenu` function

2. `apps/web/src/components/SportsDropdown.tsx` (new)
3. `apps/web/src/components/PlayersDropdown.tsx` (new)
