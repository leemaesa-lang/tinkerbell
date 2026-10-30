export type BusinessInfoRedirectState = {
  demoMode: boolean;
  authenticated: boolean;
  accountsLoaded: boolean;
  hasAccount: boolean;
  storesLoaded: boolean;
  storeCount: number;
};

export function shouldRedirectToBusinessInfoSettings(state: BusinessInfoRedirectState): boolean {
  return !state.demoMode
    && state.authenticated
    && state.accountsLoaded
    && state.hasAccount
    && state.storesLoaded
    && state.storeCount === 0;
}

export function canUseStoreOperations(input: {
  storePublicId: string | null | undefined;
  canWriteStore: boolean | null | undefined;
}): boolean {
  return Boolean(input.storePublicId?.trim() && input.canWriteStore);
}
