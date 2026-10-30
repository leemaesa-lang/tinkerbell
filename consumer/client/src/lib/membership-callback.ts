export function membershipCallbackBaseUrl(): string {
  const configured = import.meta.env.VITE_CENTRAL_MOCK_URL?.trim();
  if (configured) {
    try {
      return new URL(configured, window.location.origin).origin;
    } catch {
      // Fall back to the same-workspace Preview mapping below.
    }
  }

  const current = new URL(window.location.origin);
  const previewWorkspace = /^\d+-(.+\.manus\.computer)$/i.exec(current.hostname)?.[1];
  return previewWorkspace ? `${current.protocol}//3000-${previewWorkspace}` : current.origin;
}
