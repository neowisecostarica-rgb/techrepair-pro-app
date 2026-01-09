import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuthContext } from '../contexts/AuthContext';
import { useMemo } from 'react';

export function useOrgAdminMetrics({ days = 7, branchId = null }) {
  const { effectiveRole, effectiveOrgId } = useAuthContext();

  // Validación ORG_ADMIN
  if (effectiveRole !== 'ORG_ADMIN') {
    throw new Error('Acceso denegado: solo ORG_ADMIN');
  }

  // Query 1: Actividades
  const { data: actividadesRaw = [], isLoading: loadingActividades } = useQuery({
    queryKey: ['actividades_metrics', effectiveOrgId],
    queryFn: () => base44.entities.ActividadTecnica.filter({
      organization_id: effectiveOrgId,
      soft_deleted: false
    }),
    enabled: !!effectiveOrgId && effectiveRole === 'ORG_ADMIN',
    staleTime: 5 * 60 * 1000 // 5 min
  });

  // Query 2: OTs
  const { data: ordenesRaw = [], isLoading: loadingOrdenes } = useQuery({
    queryKey: ['ordenes_metrics', effectiveOrgId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({
      organization_id: effectiveOrgId
    }),
    enabled: !!effectiveOrgId && effectiveRole === 'ORG_ADMIN',
    staleTime: 5 * 60 * 1000
  });

  // Query 3: Inventario
  const { data: inventarioRaw = [], isLoading: loadingInventario } = useQuery({
    queryKey: ['inventario_metrics', effectiveOrgId],
    queryFn: () => base44.entities.Inventario.filter({
      organization_id: effectiveOrgId
    }),
    enabled: !!effectiveOrgId && effectiveRole === 'ORG_ADMIN',
    staleTime: 30 * 60 * 1000 // 30 min
  });

  // Filtrar por fecha client-side
  const { actividadesFiltradas, ordenesFiltradas } = useMemo(() => {
    const fechaCorte = new Date();
    fechaCorte.setDate(fechaCorte.getDate() - days);

    let actsFiltradas = actividadesRaw.filter(a => 
      new Date(a.created_date) >= fechaCorte
    );
    let ordsFiltradas = ordenesRaw.filter(o => 
      new Date(o.created_date) >= fechaCorte
    );

    // Filtro por branch (opcional)
    if (branchId) {
      actsFiltradas = actsFiltradas.filter(a => a.branch_id === branchId);
      ordsFiltradas = ordsFiltradas.filter(o => o.branch_id === branchId);
    }

    return { actividadesFiltradas: actsFiltradas, ordenesFiltradas: ordsFiltradas };
  }, [actividadesRaw, ordenesRaw, days, branchId]);

  // Calcular métricas
  const metrics = useMemo(() => {
    // Helper: promedio
    const avg = (arr) => {
      const validos = arr.filter(x => x != null && !isNaN(x));
      return validos.length > 0 ? validos.reduce((sum, x) => sum + x, 0) / validos.length : 0;
    };

    // Helper: count unique
    const countUnique = (arr) => new Set(arr).size;

    // Helper: días desde fecha
    const diasDesde = (fecha) => Math.floor((new Date() - new Date(fecha)) / (1000 * 60 * 60 * 24));

    // Estados cerrados
    const estadosCerrados = ['CERRADA', 'FINALIZADA', 'ENTREGADA', 'CANCELADA'];

    // Resumen operativo
    const otsAbiertas = ordenesFiltradas.filter(o => !estadosCerrados.includes(o.estado)).length;
    const otsCerradas = ordenesFiltradas.filter(o => ['CERRADA', 'FINALIZADA', 'ENTREGADA'].includes(o.estado)).length;
    const actividadesTotales = actividadesFiltradas.length;

    // Productividad: tiempo promedio por tipo
    const tipos = ['diagnostico', 'reparacion', 'instalacion', 'prueba', 'limpieza', 'entrega', 'otro'];
    const tiempoPromedioPorTipo = {};
    tipos.forEach(tipo => {
      const acts = actividadesFiltradas.filter(a => 
        a.tipo_actividad === tipo && 
        a.estado === 'finalizada' && 
        a.duracion_minutos != null
      );
      tiempoPromedioPorTipo[tipo] = avg(acts.map(a => a.duracion_minutos));
    });

    const tasaFinalizacion = actividadesFiltradas.length > 0
      ? actividadesFiltradas.filter(a => a.estado === 'finalizada').length / actividadesFiltradas.length
      : 0;

    // Salud del taller
    const otsConBloqueos = countUnique(
      actividadesFiltradas.filter(a => a.estado === 'bloqueada').map(a => a.orden_trabajo_id)
    );

    const reprocesoRate = actividadesFiltradas.length > 0
      ? actividadesFiltradas.filter(a => a.resultado === 'reproceso').length / actividadesFiltradas.length
      : 0;

    const otsAntiguas = ordenesRaw.filter(o => 
      diasDesde(o.created_date) > 7 && 
      !['CERRADA', 'FINALIZADA', 'ENTREGADA', 'CANCELADA'].includes(o.estado)
    ).length;

    // Equipo
    const tecnicosActivos = countUnique(actividadesFiltradas.map(a => a.tecnico_id));

    // Inventario operativo
    const repuestosUsados = actividadesFiltradas
      .filter(a => a.inventario_id)
      .reduce((acc, a) => {
        acc[a.inventario_id] = (acc[a.inventario_id] || 0) + 1;
        return acc;
      }, {});
    
    const repuestosMasUsadosTop10 = Object.entries(repuestosUsados)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => ({ inventario_id: id, count }));

    const repuestosBloqueos = actividadesFiltradas
      .filter(a => a.estado === 'bloqueada' && a.inventario_id)
      .reduce((acc, a) => {
        acc[a.inventario_id] = (acc[a.inventario_id] || 0) + 1;
        return acc;
      }, {});

    const repuestosAsociadosABloqueosTop10 = Object.entries(repuestosBloqueos)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => ({ inventario_id: id, count }));

    return {
      otsAbiertas,
      otsCerradas,
      actividadesTotales,
      tiempoPromedioPorTipo,
      tasaFinalizacion,
      otsConBloqueos,
      reprocesoRate,
      otsAntiguas,
      tecnicosActivos,
      tecnicosIdle: null, // P0: sin lista total de técnicos
      repuestosMasUsadosTop10,
      repuestosAsociadosABloqueosTop10
    };
  }, [actividadesFiltradas, ordenesFiltradas, ordenesRaw]);

  return {
    metrics,
    raw: { actividadesFiltradas, ordenesFiltradas, inventarioRaw },
    isLoading: loadingActividades || loadingOrdenes || loadingInventario,
    error: null
  };
}