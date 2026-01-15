import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { withOrgId } from '@/components/hooks/useOrgData';

// Hook para generar notificaciones automáticas basadas en eventos
export function useNotificacionesAutomaticas(userAccount) {
  const queryClient = useQueryClient();

  // P0.2: Si userAccount es null, congelar el sistema de notificaciones
  const enabled = !!userAccount?.organization_id;

  const { data: ordenes = [] } = useQuery({
    queryKey: ['ordenes-notif', userAccount?.organization_id],
    queryFn: () => base44.entities.OrdenTrabajo.filter({
      organization_id: userAccount.organization_id
    }),
    enabled,
    // P0.2: No refrescar automáticamente durante transiciones
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const { data: notificacionesExistentes = [] } = useQuery({
    queryKey: ['notif-existentes', userAccount?.organization_id],
    queryFn: () => base44.entities.Notificacion.filter({
      organization_id: userAccount.organization_id,
      estado: 'pendiente'
    }),
    enabled,
    // P0.2: No refrescar automáticamente durante transiciones
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const crearNotificacionMutation = useMutation({
    mutationFn: (data) => base44.entities.Notificacion.create(withOrgId(data, userAccount)),
    onSuccess: () => {
      // P0.2: No refrescar queries mientras el sistema está congelado
      if (enabled) {
        queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
      }
    },
  });

  useEffect(() => {
    // P0.2: No ejecutar lógica si el sistema está congelado
    if (!enabled || !ordenes.length || !userAccount) return;

    const ahora = new Date();

    ordenes.forEach((orden) => {
      // P1.4: Evitar duplicados + limpieza automática
      const yaExiste = (tipo, otId) => 
        notificacionesExistentes.some(n => 
          n.referencia_ot_id === otId && 
          n.mensaje.includes(tipo)
        );

      // P1.4: Archivar automáticamente notificaciones resueltas
      const archivarResuelta = (tipo, otId) => {
        const notifResuelta = notificacionesExistentes.find(n =>
          n.referencia_ot_id === otId && n.mensaje.includes(tipo)
        );
        if (notifResuelta) {
          base44.entities.Notificacion.update(notifResuelta.id, { estado: 'resuelta' });
        }
      };

      // P1.4: 1. OT ACTIVA sin movimiento > 4 horas (SOLO TÉCNICOS)
      if (orden.estado_atencion === 'ACTIVO' && orden.ultima_actividad_at && orden.tecnico_asignado_id) {
        const horasSinMovimiento = (ahora - new Date(orden.ultima_actividad_at)) / (1000 * 60 * 60);
        
        if (horasSinMovimiento > 4 && !yaExiste('sin movimiento', orden.id)) {
          const tipo = horasSinMovimiento > 8 ? 'critica' : 'importante';
          crearNotificacionMutation.mutate({
            user_id: orden.tecnico_asignado_id,
            role_target: 'TECHNICIAN',
            tipo,
            mensaje: `OT sin movimiento hace ${Math.floor(horasSinMovimiento)} horas: ${orden.motivo_ingreso}`,
            referencia_ot_id: orden.id,
            accion_sugerida: 'Actualizar progreso o pausar si está bloqueado',
            estado: 'pendiente'
          });
        } else if (horasSinMovimiento <= 1) {
          // Archivar si hubo movimiento reciente
          archivarResuelta('sin movimiento', orden.id);
        }
      }

      // P1.4: 2. OT PAUSADA > 48h (TÉCNICOS + ORG_ADMIN)
      if (orden.estado_atencion === 'PAUSADO' && orden.ultima_actividad_at && orden.tecnico_asignado_id) {
        const horasPausado = (ahora - new Date(orden.ultima_actividad_at)) / (1000 * 60 * 60);
        
        if (horasPausado > 48 && !yaExiste('pausada hace', orden.id)) {
          crearNotificacionMutation.mutate({
            user_id: orden.tecnico_asignado_id,
            role_target: 'ORG_ADMIN',
            tipo: 'importante',
            mensaje: `OT pausada hace ${Math.floor(horasPausado / 24)} días: ${orden.motivo_ingreso}`,
            referencia_ot_id: orden.id,
            accion_sugerida: 'Retomar o cambiar a ESPERANDO',
            estado: 'pendiente'
          });
        } else if (orden.estado_atencion !== 'PAUSADO') {
          // Archivar si ya no está pausado
          archivarResuelta('pausada hace', orden.id);
        }
      }

      // P1.4: 3. DIAGNOSTICADA sin notificar cliente (SALES + ORG_ADMIN)
      if (orden.estado === 'DIAGNOSTICADA' && !orden.public_last_viewed_at && !yaExiste('pendiente enviar', orden.id)) {
        crearNotificacionMutation.mutate({
          role_target: 'SALES',
          tipo: 'importante',
          mensaje: `Diagnóstico completado, pendiente enviar al cliente: ${orden.motivo_ingreso}`,
          referencia_ot_id: orden.id,
          accion_sugerida: 'Copiar y enviar link al cliente',
          estado: 'pendiente'
        });
      } else if (orden.estado === 'DIAGNOSTICADA' && orden.public_last_viewed_at) {
        // Archivar si el cliente ya lo vio
        archivarResuelta('pendiente enviar', orden.id);
      }

      // P1.4: 4. Cliente aprobó reparación (TÉCNICOS + ORG_ADMIN - CRÍTICA)
      if (orden.cliente_aprobado === true && orden.estado === 'EN_REPARACION' && !yaExiste('Cliente aprobó', orden.id) && orden.tecnico_asignado_id) {
        crearNotificacionMutation.mutate({
          user_id: orden.tecnico_asignado_id,
          role_target: 'TECHNICIAN',
          tipo: 'critica',
          mensaje: `¡Cliente aprobó reparación! Proceder con el trabajo: ${orden.motivo_ingreso}`,
          referencia_ot_id: orden.id,
          accion_sugerida: 'Iniciar reparación inmediatamente',
          estado: 'pendiente'
        });
      } else if (orden.estado === 'FINALIZADA' || orden.estado === 'ENTREGADA') {
        // Archivar si ya está finalizada
        archivarResuelta('Cliente aprobó', orden.id);
      }

      // P1.4: 5. FINALIZADA sin cobrar (SALES - CRÍTICA)
      if (orden.estado === 'FINALIZADA' && !yaExiste('pendiente cobro', orden.id)) {
        // Verificar si existe venta pagada
        // (simplificado - en producción verificaríamos contra Venta)
        crearNotificacionMutation.mutate({
          role_target: 'SALES',
          tipo: 'critica',
          mensaje: `💰 OT finalizada pendiente de cobro: ${orden.motivo_ingreso}`,
          referencia_ot_id: orden.id,
          accion_sugerida: 'Procesar pago en POS',
          estado: 'pendiente'
        });
      } else if (orden.estado === 'ENTREGADA') {
        // Archivar si ya fue entregada (implica cobro)
        archivarResuelta('pendiente cobro', orden.id);
      }
    });
  }, [ordenes, notificacionesExistentes, userAccount]);

  return null;
}