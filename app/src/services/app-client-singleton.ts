import { AppClient } from './app-client';

/**
 * Global AppClient singleton
 * 
 * This ensures that there is only one AppClient instance across the entire app,
 * preventing issues with multiple connections and maintaining pairing state
 * across navigation.
 */
let appClientInstance: AppClient | null = null;

export function getAppClient(): AppClient {
  if (!appClientInstance) {
    appClientInstance = new AppClient();
  }
  return appClientInstance;
}

export function resetAppClient(): void {
  if (appClientInstance) {
    appClientInstance.disconnect();
    appClientInstance = null;
  }
}
