// Shared types for the Login route
export type HeadlineVariant = 'dynasty' | 'dugout' | 'history';
export type Layout = 'split-right' | 'split-left' | 'centered';
export type Provider = 'google' | 'discord';

export interface Tweaks {
  headlineVariant: HeadlineVariant;
  layout: Layout;
  showStatStrip: boolean;
  showMarquee: boolean;
}

export interface Headline {
  eyebrow: string;
  h1a: string;
  h1b: string;
  lede: string;
}

export interface LoginRouteProps {
  /** Called when the user successfully authenticates via an OAuth provider. */
  onAuthenticated?: (provider: Provider) => void;
  /** Override the path used by the "Create an account" link. Defaults to "/signup". */
  signupHref?: string;
  /** Initial headline variant. Defaults to "dynasty". */
  defaultHeadlineVariant?: HeadlineVariant;
  /** Initial layout variant. Defaults to "split-right". */
  defaultLayout?: Layout;
}
