import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ClientPortal from "./pages/ClientPortal";
import DesktopDashboard from "./pages/DesktopDashboard";
import Auth from "./pages/Auth";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { session, workspace, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session || !workspace) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Public auth */}
              <Route path="/auth" element={<Auth />} />

              {/* Public portal route - clients view their data */}
              <Route path="/client-view" element={<ClientPortal />} />

              {/* Authenticated desktop view */}
              <Route path="/desk" element={<RequireAuth><DesktopDashboard /></RequireAuth>} />

              {/* Main app routes - inside phone frame, behind auth */}
              <Route path="/*" element={
                <RequireAuth>
                  <div className="mobile-preview-container">
                    <div className="mobile-phone-frame">
                      <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </div>
                  </div>
                </RequireAuth>
              } />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
