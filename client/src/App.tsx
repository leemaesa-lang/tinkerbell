import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import AppShell from "./components/dashboard/AppShell";
import { ThemeProvider } from "./contexts/ThemeContext";
import CouponsPage from "./pages/CouponsPage";
import EventsPage from "./pages/EventsPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import NotificationsPage from "./pages/NotificationsPage";
import SupportPage from "./pages/SupportPage";
import OverviewPage from "@/pages/OverviewPage";
import PartnersPage from "@/pages/PartnersPage";
import ConsumerOperationsPage from "./pages/ConsumerOperationsPage";
import CommunityOperationsPage from "./pages/CommunityOperationsPage";
import BusinessOperationsPage from "./pages/BusinessOperationsPage";
import PreviewWorkspacePage from "@/pages/PreviewWorkspacePage";
import TodayActionsWorkbench from "./components/dashboard/TodayActionsWorkbench";
import ChargesPage from "./pages/ChargesPage";
import RefundsPage from "./pages/RefundsPage";
import BenefitsPage from "./pages/BenefitsPage";
import ReservationsPage from "./pages/ReservationsPage";
import StoresPage from "./pages/StoresPage";
import UsersPage from "./pages/UsersPage";

function Router() {
  return <AppShell><Switch>
    <Route path="/" component={OverviewPage} />
    <Route path="/overview" component={OverviewPage} />
    <Route path="/ops-overview" component={TodayActionsWorkbench} />
    <Route path="/charges" component={ChargesPage} />
    <Route path="/refunds" component={RefundsPage} />
    <Route path="/admin" component={OverviewPage} />
    <Route path="/integrations" component={IntegrationsPage} />
    <Route path="/app-previews" component={PreviewWorkspacePage} />
    <Route path="/events" component={EventsPage} />
    <Route path="/stores" component={StoresPage} />
    <Route path="/users" component={UsersPage} />
    <Route path="/coupons" component={CouponsPage} />
    <Route path="/reservations" component={ReservationsPage} />
    <Route path="/partners" component={PartnersPage} />
    <Route path="/consumer-activity" component={ConsumerOperationsPage} />
    <Route path="/community-ops" component={CommunityOperationsPage} />
    <Route path="/business-operations" component={BusinessOperationsPage} />
    <Route path="/notifications" component={NotificationsPage} />
    <Route path="/popup-ads" component={PopupAdsPage} />
    <Route path="/support" component={SupportPage} />
    <Route path="/benefits" component={BenefitsPage} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch></AppShell>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
import PopupAdsPage from "./pages/PopupAdsPage";
