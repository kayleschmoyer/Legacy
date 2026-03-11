/**
 * App Store Server Notification types (v2)
 *
 * Docs: https://developer.apple.com/documentation/appstoreservernotifications/notificationtype
 */

export type NotificationType =
  | 'SUBSCRIBED'
  | 'DID_RENEW'
  | 'DID_FAIL_TO_RENEW'
  | 'DID_RECOVER'
  | 'EXPIRED'
  | 'GRACE_PERIOD_EXPIRED'
  | 'REFUND'
  | 'REVOKE'
  | 'OFFER_REDEEMED'
  | 'PRICE_INCREASE'
  | 'RENEWAL_EXTENSION'
  | 'RENEWAL_EXTENDED'
  | 'TEST';

export interface JwsTransactionDecodedPayload {
  /** The unique identifier of the original transaction. */
  originalTransactionId: string;
  /** The transaction identifier of the original purchase. */
  transactionId: string;
  /** The product identifier of the in-app purchase. */
  productId: string;
  /** The bundle identifier. */
  bundleId: string;
  /** The UNIX time (milliseconds) when the subscription expires. */
  expiresDate?: number;
  /** The purchase date in milliseconds since epoch. */
  purchaseDate: number;
  /**
   * A UUID you provided at purchase time to correlate the transaction to a
   * user account in your system.
   */
  appAccountToken?: string;
  /** Subscription group identifier. */
  subscriptionGroupIdentifier?: string;
}

export interface AppStoreNotificationData {
  /** The bundle identifier of the app. */
  bundleId: string;
  /** The app version when the notification was generated. */
  bundleVersion?: string;
  /** The signed JWS string representing the transaction. */
  signedTransactionInfo: JwsTransactionDecodedPayload;
  /** The signed JWS string representing the renewal info. */
  signedRenewalInfo?: JwsRenewalInfoDecodedPayload;
  /** The environment the notification originated from. */
  environment: 'Sandbox' | 'Production';
}

export interface JwsRenewalInfoDecodedPayload {
  originalTransactionId: string;
  autoRenewProductId?: string;
  autoRenewStatus: 0 | 1;
  expirationIntent?: number;
  gracePeriodExpiresDate?: number;
  isInBillingRetryPeriod?: boolean;
}

export interface AppStoreNotification {
  /** The unique identifier of the notification. */
  notificationUUID: string;
  /** The category of the notification. */
  notificationType: NotificationType;
  /** Additional detail about the notification. */
  subtype?: string;
  /** The version of the notification payload. */
  version?: string;
  /** The UNIX time in milliseconds when the notification originated. */
  signedDate: number;
  /** The payload data. */
  data: AppStoreNotificationData;
}
