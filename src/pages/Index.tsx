import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const Index = () => {
  const { user, loading, roles } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && roles.length > 0) {
      // Redirigir según los roles del usuario
      if (roles.some(r => r === 'caja' || r === 'contabilidad')) {
        navigate('/caja', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } else if (!loading && !user) {
      // Si no está autenticado, ir a login
      navigate('/auth', { replace: true });
    }
  }, [user, loading, roles, navigate]);

  // Mostrar loading mientras se verifica
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    </div>
  );
};

export default Index;
