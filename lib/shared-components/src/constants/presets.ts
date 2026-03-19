/**
 * Preset avatar images for user profiles and team logos.
 *
 * All assets are self-hosted under /presets/ (apps/web/public/presets/).
 * On mobile, the resolvePresetUrl callback should convert relative paths
 * to fully-qualified HTTPS URLs.
 * Users can also paste any custom URL.
 */

export interface PresetImage {
  id: string;
  label: string;
  url: string;
}

/** Curated avatar presets -- sports-persona characters. */
export const PRESET_AVATARS: PresetImage[] = [
  {
    id: 'avatar-astronaut',
    label: 'Astronaut',
    url: '/presets/avatar-astronaut.png',
  },
  {
    id: 'avatar-athlete',
    label: 'Athlete',
    url: '/presets/avatar-athlete.png',
  },
  { id: 'avatar-chef', label: 'Chef', url: '/presets/avatar-chef.png' },
  { id: 'avatar-cowboy', label: 'Cowboy', url: '/presets/avatar-cowboy.png' },
  {
    id: 'avatar-detective',
    label: 'Detective',
    url: '/presets/avatar-detective.png',
  },
  {
    id: 'avatar-explorer',
    label: 'Explorer',
    url: '/presets/avatar-explorer.png',
  },
  { id: 'avatar-knight', label: 'Knight', url: '/presets/avatar-knight.png' },
  { id: 'avatar-ninja', label: 'Ninja', url: '/presets/avatar-ninja.png' },
  { id: 'avatar-pirate', label: 'Pirate', url: '/presets/avatar-pirate.png' },
  { id: 'avatar-pixel', label: 'Pixel', url: '/presets/avatar-pixel.png' },
  { id: 'avatar-robot', label: 'Robot', url: '/presets/avatar-robot.png' },
  {
    id: 'avatar-samurai',
    label: 'Samurai',
    url: '/presets/avatar-samurai.png',
  },
  {
    id: 'avatar-scientist',
    label: 'Scientist',
    url: '/presets/avatar-scientist.png',
  },
  {
    id: 'avatar-silhouette',
    label: 'Silhouette',
    url: '/presets/avatar-silhouette.png',
  },
  { id: 'avatar-viking', label: 'Viking', url: '/presets/avatar-viking.png' },
  { id: 'avatar-wizard', label: 'Wizard', url: '/presets/avatar-wizard.png' },
];

// -- Team Logos -------------------------------------------------------

/** Curated team logo presets -- minimalist mascot emblems. */
export const PRESET_TEAM_LOGOS: PresetImage[] = [
  { id: 'logo-bear', label: 'Bear', url: '/presets/logo-bear.png' },
  { id: 'logo-bull', label: 'Bull', url: '/presets/logo-bull.png' },
  { id: 'logo-cobra', label: 'Cobra', url: '/presets/logo-cobra.png' },
  { id: 'logo-dragon', label: 'Dragon', url: '/presets/logo-dragon.png' },
  { id: 'logo-eagle', label: 'Eagle', url: '/presets/logo-eagle.png' },
  { id: 'logo-falcon', label: 'Falcon', url: '/presets/logo-falcon.png' },
  { id: 'logo-fox', label: 'Fox', url: '/presets/logo-fox.png' },
  { id: 'logo-phoenix', label: 'Phoenix', url: '/presets/logo-phoenix.png' },
  { id: 'logo-rhino', label: 'Rhino', url: '/presets/logo-rhino.png' },
  { id: 'logo-shark', label: 'Shark', url: '/presets/logo-shark.png' },
  { id: 'logo-tiger', label: 'Tiger', url: '/presets/logo-tiger.png' },
  { id: 'logo-wolf', label: 'Wolf', url: '/presets/logo-wolf.png' },
];

// -- League Banners ---------------------------------------------------

/** Wide-format (3:1) league banner presets. */
export const PRESET_BANNERS: PresetImage[] = [
  {
    id: 'banner-blue-gold',
    label: 'Blue & Gold',
    url: '/presets/banner-blue-gold.png',
  },
  {
    id: 'banner-green-silver',
    label: 'Green & Silver',
    url: '/presets/banner-green-silver.png',
  },
  {
    id: 'banner-purple-white',
    label: 'Purple & White',
    url: '/presets/banner-purple-white.png',
  },
  {
    id: 'banner-red-black',
    label: 'Red & Black',
    url: '/presets/banner-red-black.png',
  },
];
