import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuthContext } from '../contexts/AuthContext';
import { useMemo } from 'react';

export function useTecnicoMetrics({ days = 30 }) {
  const { effectiveRole, effectiveOrgId } = useAuthContext();

  // Validación ORG_ADMIN
  if (effectiveRole !== 'ORG_ADMIN') {
    throw new Error('Acceso denegado: solo ORG_ADMIN');
  }

  const { data: actividadesRaw = [], isLoading } = useQuery({
    queryKey: ['actividades_tecnicos', effectiveOrgId, days],
    queryFn: () => base44.entities.ActividadTecnica.filter({
      organization_id: effectiveOrgId,
      soft_deleted: false
    }),
    enabled: !!effectiveOrgId && effectiveRole === 'ORG_ADMIN',
    staleTime: 5 * 60 * 1000
  });

  const tecnicoMetrics = useMemo(() => {
    const fechaCorte = new Date();
    fechaCorte.setDate(fechaCorte.getDate() - days);

    const actividadesFiltradas = actividadesRaw.filter(a => 
      new Date(a.created_date) >= fechaCorte
    );

    // Agrupar por técnico
    const porTecnico = actividadesFiltradas.reduce((acc, a) => {
      const key = a.tecnico_id;
      if (!acc[key]) {
        acc[key] = {
          tecnico_id: a.tecnico_id,
          tecnico_email: a.tecnico_email,
          actividades: []
        };
      }
      acc[key].actividades.push(a);
      return acc;
    }, {});

    // Calcular métricas por técnico
    const tecnicos = Object.values(porTecnico).map(t => {
      const acts = t.actividades;
      const actividadesCount = acts.length;

      // Tiempo promedio por tipo
      const tipos = ['diagnostico', 'reparacion', 'instalacion', 'prueba', 'limpieza', 'entrega', 'otro'];
      const tiempoPromedioPorTipo = {};
      tipos.forEach(tipo => {
        const actsTipo = acts.filter(a => 
          a.tipo_actividad === tipo && 
          a.estado === 'finalizada' && 
          a.duracion_minutos != null
        );
        const avg = actsTipo.length > 0
          ? actsTipo.reduce((sum, a) => sum + a.duracion_minutos, 0) / actsTipo.length
          : 0;
        tiempoPromedioPorTipo[tipo] = avg;
      });

      // Reproceso
      const reprocesoRate = acts.length > 0
        ? acts.filter(a => a.resultado === 'reproceso').length / acts.length
        : 0;

      // Bloqueos
      const bloqueosRate = acts.length > 0
        ? acts.filter(a => a.estado === 'bloqueada').length / acts.length
        : 0;

      const bloqueosPorCausa = acts
        .filter(a => a.estado === 'bloqueada' && a.causa_bloqueo)
        .reduce((acc, a) => {
          acc[a.causa_bloqueo] = (acc[a.causa_bloqueo] || 0) + 1;
          return acc;
        }, {});

      // Tendencia simple (P0: sin datos = sin_datos)
      const tendencia = 'sin_datos';

      return {
        tecnico_id: t.tecnico_id,
        tecnico_email: t.tecnico_email,
        actividadesCount,
        tiempoPromedioPorTipo,
        reprocesoRate,
        bloqueosRate,
        bloqueosPorCausa,
        tendencia
      };
    });

    // Ordenar alfabéticamente por email
    tecnicos.sort((a, b) => (a.tecnico_email || '').localeCompare(b.tecnico_email || ''));

    return tecnicos;
  }, [actividadesRaw, days]);

  return {
    tecnicos: tecnicoMetrics,
    isLoading
  };
}