import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { BranchProvider } from "@/hooks/useBranch";
import ProtectedRoute from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Caja from "./pages/Caja";
import Analytics from "./pages/Analytics";
import Consultation from "./pages/Consultation";
import Reconsulta from "./pages/Reconsulta";
import Surgery from "./pages/Surgery";
import Procedimiento from "./pages/Procedimiento";
import Estudios from "./pages/Estudios";
import ViewEstudios from "./pages/ViewEstudios";
import Research from "./pages/Research";
import CRM from "./pages/CRM";
import InventarioSala from "./pages/InventarioSala";
import NotFound from "./pages/NotFound";
import Index from "./pages/Index";

// Configuración optimizada de React Query para mejor performance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 segundos - datos considerados frescos
      gcTime: 5 * 60 * 1000, // 5 minutos - tiempo en cache (antes cacheTime)
      refetchOnWindowFocus: false, // No refetch automático al cambiar de ventana
      retry: 1, // Solo un reintento en caso de error
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <BranchProvider>
              <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/research"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Research />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crm"
            element={
              <ProtectedRoute allowedRoles={['admin', 'reception', 'caja', 'contabilidad', 'nurse', 'diagnostico']}>
                <CRM />
              </ProtectedRoute>
            }
          />
            <Route
              path="/caja"
              element={
                <ProtectedRoute allowedRoles={['admin', 'caja', 'contabilidad']}>
                  <Caja />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute allowedRoles={['admin', 'caja', 'contabilidad']}>
                  <Analytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/consultation/:encounterId"
              element={
                <ProtectedRoute>
                  <Consultation />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reconsulta/:encounterId"
              element={
                <ProtectedRoute>
                  <Reconsulta />
                </ProtectedRoute>
              }
            />
            <Route
              path="/surgery/:encounterId"
              element={
                <ProtectedRoute>
                  <Surgery />
                </ProtectedRoute>
              }
            />
            <Route
              path="/procedimiento/:encounterId"
              element={
                <ProtectedRoute>
                  <Procedimiento />
                </ProtectedRoute>
              }
            />
            <Route
              path="/estudios/:appointmentId"
              element={
                <ProtectedRoute allowedRoles={['diagnostico']}>
                  <Estudios />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ver-estudios/:patientId"
              element={
                <ProtectedRoute>
                  <ViewEstudios />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventario-sala"
              element={
                <ProtectedRoute allowedRoles={['admin', 'nurse']}>
                  <InventarioSala />
                </ProtectedRoute>
              }
            />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
              </Routes>
            </BranchProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
