// Modern authentication system (recommended for new code)
export { LoginPage } from './LoginPage';
export { AuthProvider, useAuth, useOptionalAuth } from './hooks/useAuth';
export type { UseAuthResult } from './hooks/useAuth';
export { AuthService, AuthSessionExpiredError } from './services/AuthService';
export {
  buildGoogleAuthPayload,
  exchangeGoogleCode,
  OAuthServiceError,
} from './services/googleAuthExchange';
export type {
  GoogleAuthPayload,
  GoogleAuthExchangeResult,
} from './services/googleAuthExchange';
export * from './EnhancedAuthGuard';

// Platform types (convenience re-exports)
export type {
  OAuthConfig,
  OAuthResponse,
  OAuthError,
} from '../../platform-components/types';
export { OAuthErrorCode } from '../../platform-components/types';

// Legacy infrastructure completely removed - now using modern AuthProvider pattern
