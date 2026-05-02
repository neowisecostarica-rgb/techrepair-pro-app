import { Outlet } from 'react-router-dom';
import { useAuthContext } from '@/components/contexts/AuthContext';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { user, loading, status } = useAuthContext();

  if (loading || status === 'idle') {
    return fallback;
  }

  if (!user) {
    return unauthenticatedElement ?? null;
  }

  return <Outlet />;
}