import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { withOrgId } from '@/components/hooks/useOrgData';

// Hook para generar notificaciones automáticas basadas en eventos
export function useNotificacionesAutomaticas(userAccount) {
  const queryClient = useQueryClient();

  const { data: ordenes = [] } = useQuery({
    queryKey: ['ordenes-notif', userAccount?.organization_id],
    queryFn: () => base44.entities.OrdenTrabajo.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: notificacionesExistentes = [] } = useQuery({
    queryKey: ['notif-existentes', userAccount?.organization_id],
    queryFn: () => base44.entities.Notificacion.filter({
      organization_id: userAccount.organization_id,
      estado: 'pendiente'
    }),
    enabled: !!userAccount?.organization_id,
  });

  const crearNotificacionMutation = useMutation({
    mutationFn: (data) => base44.entities.Notificacion.create(withOrgId(data, userAccount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
    },
  });

  useEffect(() => {
    if (!ordenes.length || !userAccount) return;

    const ahora = new Date();

    ordenes.forEach((orden) => {
      // Evitar duplicados
      const yaExiste = (tipo, otId) => 
        notificacionesExistentes.some(n => 
          n.referencia_ot_id === otId && 
          n.mensaje.includes(tipo)
        );

      // 1. OT ACTIVA sin movimiento > 4 horas
      if (orden.estado_atencion === 'ACTIVO' && orden.ultima_actividad_at) {
        const horasSinMovimiento = (ahora - new Date(orden.ultima_actividad_at)) / (1000 * 60 * 60);
        
        if (horasSinMovimiento > 4 && !yaExiste('sin movimiento', orden.id)) {
          const tipo = horasSinMovimiento > 8 ? 'critica' : 'importante';
          crearNotificacionMutation.mutate({
            user_id: orden.tecnico_asignado_id,
            tipo,
            mensaje: `OT sin movimiento hace ${Math.floor(horasSinMovimiento)} horas: ${orden.motivo_ingreso}`,
            referencia_ot_id: orden.id,
            accion_sugerida: 'Actualizar progreso o pausar si está bloqueado',
            estado: 'pendiente'
          });
        }
      }

      // 2. OT PAUSADA > 48h
      if (orden.estado_atencion === 'PAUSADO' && orden.ultima_actividad_at) {
        const horasPausado = (ahora - new Date(orden.ultima_actividad_at)) / (1000 * 60 * 60);
        
        if (horasPausado > 48 && !yaExiste('pausada hace', orden.id)) {
          crearNotificacionMutation.mutate({
            user_id: orden.tecnico_asignado_id,
            role_target: 'ADMIN',
            tipo: 'importante',
            mensaje: `OT pausada hace ${Math.floor(horasPausado / 24)} días: ${orden.motivo_ingreso}`,
            referencia_ot_id: orden.id,
            accion_sugerida: 'Retomar o cambiar a ESPERANDO',
            estado: 'pendiente'
          });
        }
      }

      // 3. DIAGNOSTICADA sin notificar cliente
      if (orden.estado === 'DIAGNOSTICADA' && !orden.public_last_viewed_at && !yaExiste('pendiente enviar', orden.id)) {
        crearNotificacionMutation.mutate({
          role_target: 'CASHIER',
          tipo: 'importante',
          mensaje: `Diagnóstico completado, pendiente enviar al cliente: ${orden.motivo_ingreso}`,
          referencia_ot_id: orden.id,
          accion_sugerida: 'Copiar y enviar link al cliente',
          estado: 'pendiente'
        });
      }

      // 4. Cliente aprobó reparación
      if (orden.cliente_aprobado === true && orden.estado === 'EN_REPARACION' && !yaExiste('Cliente aprobó', orden.id)) {
        crearNotificacionMutation.mutate({
          user_id: orden.tecnico_asignado_id,
          role_target: 'ADMIN',
          tipo: 'critica',
          mensaje: `¡Cliente aprobó reparación! Proceder con el trabajo: ${orden.motivo_ingreso}`,
          referencia_ot_id: orden.id,
          accion_sugerida: 'Iniciar reparación',
          estado: 'pendiente'
        });
      }

      // 5. FINALIZADA sin cobrar
      if (orden.estado === 'FINALIZADA' && !yaExiste('pendiente cobro', orden.id)) {
        // Verificar si existe venta pagada
        // (simplificado - en producción verificaríamos contra Venta)
        crearNotificacionMutation.mutate({
          role_target: 'CASHIER',
          tipo: 'critica',
          mensaje: `OT finalizada pendiente de cobro: ${orden.motivo_ingreso}`,
          referencia_ot_id: orden.id,
          accion_sugerida: 'Procesar pago en POS',
          estado: 'pendiente'
        });
      }
    });
  }, [ordenes, notificacionesExistentes, userAccount]);

  return null;
}