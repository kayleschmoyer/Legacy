/**
 * Type stubs for react-native-iap v14 (NitroModules)
 *
 * These declarations are needed because react-native-iap is a React Native
 * package with native dependencies that cannot be installed in all environments
 * (e.g. Windows). They reflect the subset of the API used by useIAP.ts.
 */
declare module 'react-native-iap' {
  export enum ErrorCode {
    UserCancelled = 'E_USER_CANCELLED',
    Unknown = 'E_UNKNOWN',
    ServiceError = 'E_SERVICE_ERROR',
    BillingResponse = 'E_BILLING_RESPONSE',
    PaymentInvalid = 'E_PAYMENT_INVALID',
    ItemAlreadyOwned = 'E_ALREADY_OWNED',
    ItemNotAvailable = 'E_ITEM_UNAVAILABLE',
    CloudServiceNetworkConnectionFailed = 'E_CLOUD_SERVICE_NETWORK_CONNECTION_FAILED',
    CloudServicePermissionDenied = 'E_CLOUD_SERVICE_PERMISSION_DENIED',
    CloudServiceRevoked = 'E_CLOUD_SERVICE_REVOKED',
    PrivacyAcknowledgementRequired = 'E_PRIVACY_ACKNOWLEDGEMENT_REQUIRED',
  }

  export interface ProductSubscription {
    id: string;
    title: string;
    description: string;
    displayPrice: string;
    currency: string;
    introductoryPrice?: string;
    introductoryPriceAsAmountIOS?: string;
  }

  export interface Purchase {
    productId: string;
    purchaseToken?: string;
    transactionDate: number;
    transactionId?: string;
    transactionReceipt?: string;
  }

  export interface PurchaseError {
    code?: ErrorCode;
    message?: string;
    productId?: string;
    responseCode?: number;
  }

  export interface Subscription {
    productId: string;
    title: string;
    description: string;
    price: string;
    currency: string;
    localizedPrice: string;
    introductoryPrice?: string;
  }

  export type EmitterSubscription = {
    remove(): void;
  };

  export function initConnection(): Promise<boolean>;
  export function endConnection(): Promise<void>;

  export function fetchProducts(params: {
    skus: string[];
    type?: string;
  }): Promise<(ProductSubscription | Subscription)[]>;

  export function requestPurchase(params: {
    type?: string;
    request: { apple?: { sku: string }; andoid?: { skus: string[] } };
  }): Promise<Purchase | void>;

  export function finishTransaction(params: {
    purchase: Purchase;
    isConsumable?: boolean;
  }): Promise<void>;

  export function getAvailablePurchases(): Promise<Purchase[]>;

  export function purchaseUpdatedListener(
    callback: (purchase: Purchase) => void,
  ): EmitterSubscription;

  export function purchaseErrorListener(
    callback: (error: PurchaseError) => void,
  ): EmitterSubscription;
}
