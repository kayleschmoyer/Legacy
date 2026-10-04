// Modern authentication system (recommended for new code)
export { LoginPage } from './LoginPage';
export { AuthProvider, useAuth, useOptionalAuth } from './hooks/useAuth';
export type { UseAuthResult } from './hooks/useAuth';
export {
  AuthService,
  AuthSessionExpiredError,
  hasStoredSession,
} from './services/AuthService';
export {
  useStepUpGate,
  isStepUpFresh,
  markStepUpVerified,
  clearStepUp,
} from './hooks/useStepUpGate';
export type { UseStepUpGateResult } from './hooks/useStepUpGate';
export { consumeBillingNotice } from './services/billingNotice';
export type { BillingNoticeStatus } from './services/billingNotice';
export {
  consumeSessionExpiredNotice,
  SESSION_EXPIRED_MESSAGE,
} from './services/sessionExpiredNotice';
export {
  buildGoogleAuthPayload,
  exchangeGoogleCode,
  OAuthServiceError,
} from './services/googleAuthExchange';
export type {
  GoogleAuthPayload,
  GoogleAuthExchangeResult,
} from './services/googleAuthExchange';
export { exchangeAppleCode } from './services/appleAuthExchange';
export type {
  AppleAuthPayload,
  AppleAuthExchangeResult,
} from './services/appleAuthExchange';
export { exchangeDiscordCode } from './services/discordAuthExchange';
export type {
  DiscordAuthPayload,
  DiscordAuthExchangeResult,
} from './services/discordAuthExchange';
export * from './EnhancedAuthGuard';
export { useMfa } from './hooks/useMfa';
export type { UseMfaResult, MfaEnrollData } from './hooks/useMfa';

// Platform types (convenience re-exports)
export type {
  OAuthConfig,
  OAuthResponse,
  OAuthError,
} from '../../platform-components/types';
export { OAuthErrorCode } from '../../platform-components/types';

// Legacy infrastructure completely removed - now using modern AuthProvider pattern
