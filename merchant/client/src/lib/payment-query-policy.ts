export function shouldFetchPaymentConfiguration(previewMode: boolean, storePublicId: string | null): boolean {
  return !previewMode && Boolean(storePublicId?.trim());
}
