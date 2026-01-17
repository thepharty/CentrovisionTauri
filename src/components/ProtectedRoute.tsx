import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';

type ProtectedRouteProps = {
  children: React.ReactNode;
  allowedRoles?: string[];
};

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading, role, roles } = useAuth();
  const [gracePeriod, setGracePeriod] = useState(true);

  useEffect(() => {
    // Grace period of 1 second after component mount
    const timer = setTimeout(() => {
      setGracePeriod(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  // During grace period, show loading state instead of redirecting
  if (!user && gracePeriod) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  // Si hay usuario pero los roles aún no se han cargado, esperar
  if (user && allowedRoles && roles.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando permisos...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Verificar si CUALQUIERA de los roles del usuario está permitido
  const hasAllowedRole = roles.length > 0 && roles.some(r => allowedRoles?.includes(r));
  
  if (allowedRoles && roles.length > 0 && !hasAllowedRole) {
    // Redirigir según el rol del usuario
    const redirectTo = roles.includes('caja') ? '/caja' : '/dashboard';
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
