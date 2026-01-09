import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuthContext } from '../contexts/AuthContext';

export function useActividadesTecnicas(ordenTrabajoId) {
  const { effectiveRole, user, effectiveOrgId } = useAuthContext();

  const { data: actividades = [], isLoading, error, refetch } = useQuery({
    queryKey: ['actividades_tecnicas', ordenTrabajoId, effectiveOrgId, user?.id],
    queryFn: async () => {
      if (!ordenTrabajoId || !effectiveOrgId) {
        return [];
      }

      const baseFilter = {
        orden_trabajo_id: ordenTrabajoId,
        organization_id: effectiveOrgId,
        soft_deleted: false
      };

      // RBAC Manual
      if (effectiveRole === 'TECHNICIAN') {
        // Solo sus actividades
        return base44.entities.ActividadTecnica.filter({
          ...baseFilter,
          tecnico_id: user.id
        });
      } else if (['ORG_ADMIN', 'BRANCH_ADMIN'].includes(effectiveRole)) {
        // Todas las actividades de la org
        return base44.entities.ActividadTecnica.filter(baseFilter);
      } else {
        // SALES, AUDITOR: solo lectura, todas
        return base44.entities.ActividadTecnica.filter(baseFilter);
      }
    },
    enabled: !!ordenTrabajoId && !!effectiveOrgId
  });

  return { actividades, isLoading, error, refetch };
}