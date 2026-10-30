import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PopupAdOverlay } from "../../../shared/PopupAdOverlay";
import ErrorBoundary from "./components/ErrorBoundary";
import { PhoneOnboardingGate } from "./components/PhoneOnboardingGate";
import { RegionProvider } from "./contexts/RegionContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { resolveCentralPreviewApiBaseUrl } from "./lib/central-preview-url";
import { getPreviewConsumerSessionToken } from "./lib/preview-consumer-session";
import { isConsumerPreviewDemo } from "./lib/preview-demo";
import AdminDashboard from "./pages/AdminDashboard";
import CouponManagement from "./pages/CouponManagement";
import Home from "./pages/Home";
import StoreAccessPage from "./pages/StoreAccessPage";

export default function App() {
  const isMerchantPreview = typeof window !== "undefined" && window.location.pathname === "/merchant";
  const isAdminPreview = typeof window !== "undefined" && window.location.pathname === "/admin";
  const storePathMatch = typeof window !== "undefined" ? window.location.pathname.match(/^\/stores\/([^/]+)\/?$/) : null;
  const storePublicId = storePathMatch?.[1] ?? "";
  const consumerPopupPreviewEnabled = import.meta.env.DEV && isConsumerPreviewDemo();
  const consumerPopupApiBaseUrl = typeof window !== "undefined"
    ? resolveCentralPreviewApiBaseUrl(import.meta.env.VITE_CENTRAL_MOCK_URL, window.location.origin)
    : null;

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <RegionProvider>
          <TooltipProvider>
            <Toaster />
            {isAdminPreview ? <AdminDashboard />
              : isMerchantPreview ? <CouponManagement />
                : storePathMatch ? <StoreAccessPage key={storePublicId} storePublicId={storePublicId} />
                  : <PhoneOnboardingGate>
                    <>
                      <Home />
                      <PopupAdOverlay
                        enabled={consumerPopupPreviewEnabled}
                        audience="consumer"
                        apiBaseUrl={consumerPopupApiBaseUrl}
                        getSessionToken={getPreviewConsumerSessionToken}
                      />
                    </>
                  </PhoneOnboardingGate>}
          </TooltipProvider>
        </RegionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
