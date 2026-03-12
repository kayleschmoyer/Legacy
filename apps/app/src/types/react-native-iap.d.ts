/**
 * Type declarations for react-native-iap v14 (NitroModules).
 *
 * The package is in package.json and pnpm-lock.yaml but requires native build
 * steps (pod install / gradle sync) to fully resolve in the TS environment.
 * This stub provides the shapes used by useIAP.ts so the monorepo type-check
 * and lint passes without needing a native build context.
 */
declare module 'react-native-iap' {
  export enum ErrorCode {
    UserCancelled = 'E_USER_CANCELLED',
    Unknown = 'E_UNKNOWN',
    ServiceError = 'E_SERVICE_ERROR',
    ItemAlreadyOwned = 'E_ALREADY_OWNED',
  }

  export interface ProductSubscription {
    productId: string;
    id: string;
    title: string;
    description: string;
    displayPrice: string;
    price: string;
    currency: string;
    localizedPrice?: string;
  }

  export interface Purchase {
    productId: string;
    transactionId?: string;
    transactionDate: number;
    purchaseToken?: string;
    transactionReceipt?: string;
  }

  export interface PurchaseError {
    code: ErrorCode;
    message?: string;
    responseCode?: number;
  }

  export interface EmitterSubscription {
    remove(): void;
  }

  export function initConnection(): Promise<boolean>;

  export function endConnection(): Promise<void>;

  export function fetchProducts(options: {
    skus: string[];
    type?: string;
  }): Promise<ProductSubscription[]>;

  export function getAvailablePurchases(): Promise<Purchase[]>;

  export function requestPurchase(options: {
    type?: string;
    request?: {
      apple?: { sku: string };
      android?: { skus: string[] };
    };
    sku?: string;
  }): Promise<void | Purchase>;

  export function finishTransaction(options: {
    purchase: Purchase;
    isConsumable: boolean;
    developerPayloadAndroid?: string;
  }): Promise<void>;

  export function purchaseUpdatedListener(
    listener: (purchase: Purchase) => void,
  ): EmitterSubscription;

  export function purchaseErrorListener(
    listener: (error: PurchaseError) => void,
  ): EmitterSubscription;
}
