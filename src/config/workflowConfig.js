/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SFHS: workflowConfig — ACTIVE CORE
 * ═══════════════════════════════════════════════════════════════════════════
 * STATUS: ACTIVE CORE
 * USED_BY: components/expediente/CentroMando
 * DESCRIPTION: Única fuente de verdad para la matriz operativa:
 *   Estado → Próxima Acción → Responsable → Indicadores visuales
 *   NO contiene lógica de negocio. Solo configuración declarativa.
 *   NO importa componentes React. Los iconos se referencian por nombre de
 *   string para que cada consumidor importe solo lo que necesita.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const ESTADO_SOT = {
  EN_COLA_REVISION: {
    accion: 'Asignar técnico y cobrar diagnóstico en POS',
    responsable: 'SALES / BRANCH_ADMIN',
    iconName: 'AlertCircle',
    color: 'bg-blue-50 border-blue-200',
    iconColor: 'text-blue-500',
    labelColor: 'text-blue-900',
  },
  ASIGNADA: {
    accion: 'Técnico debe iniciar revisión desde Mi Día',
    responsable: 'TECHNICIAN',
    iconName: 'Clock',
    color: 'bg-amber-50 border-amber-200',
    iconColor: 'text-amber-500',
    labelColor: 'text-amber-900',
  },
  EN_REVISION: {
    accion: 'Completar diagnóstico técnico detallado',
    responsable: 'TECHNICIAN',
    iconName: 'FlaskConical',
    color: 'bg-purple-50 border-purple-200',
    iconColor: 'text-purple-500',
    labelColor: 'text-purple-900',
  },
  DIAGNOSTICADA: {
    accion: 'Generar y enviar cotización al cliente',
    responsable: 'SALES / BRANCH_ADMIN',
    iconName: 'CreditCard',
    color: 'bg-yellow-50 border-yellow-200',
    iconColor: 'text-yellow-600',
    labelColor: 'text-yellow-900',
  },
  COTIZADA: {
    accion: 'Esperar aprobación / rechazo del cliente',
    responsable: 'SALES (seguimiento)',
    iconName: 'Clock',
    color: 'bg-orange-50 border-orange-200',
    iconColor: 'text-orange-500',
    labelColor: 'text-orange-900',
  },
  APROBADA: {
    accion: 'Cobrar reparación en POS e iniciar trabajo',
    responsable: 'SALES → TECHNICIAN',
    iconName: 'Wrench',
    color: 'bg-teal-50 border-teal-200',
    iconColor: 'text-teal-500',
    labelColor: 'text-teal-900',
  },
  EN_REPARACION: {
    accion: 'Ejecutar reparación y mover a Pruebas al terminar',
    responsable: 'TECHNICIAN',
    iconName: 'Wrench',
    color: 'bg-indigo-50 border-indigo-200',
    iconColor: 'text-indigo-500',
    labelColor: 'text-indigo-900',
  },
  PRUEBAS: {
    accion: 'Verificar funcionamiento y finalizar OT',
    responsable: 'TECHNICIAN',
    iconName: 'Package',
    color: 'bg-cyan-50 border-cyan-200',
    iconColor: 'text-cyan-500',
    labelColor: 'text-cyan-900',
  },
  FINALIZADA: {
    accion: 'Notificar cliente y gestionar entrega',
    responsable: 'SALES / BRANCH_ADMIN',
    iconName: 'CheckCircle2',
    color: 'bg-emerald-50 border-emerald-200',
    iconColor: 'text-emerald-500',
    labelColor: 'text-emerald-900',
  },
  ENTREGADA: {
    accion: 'OT completada — sin acciones pendientes',
    responsable: '—',
    iconName: 'CheckCircle2',
    color: 'bg-slate-50 border-slate-200',
    iconColor: 'text-slate-400',
    labelColor: 'text-slate-600',
  },
  CANCELADA: {
    accion: 'OT cancelada — sin acciones pendientes',
    responsable: '—',
    iconName: 'AlertCircle',
    color: 'bg-red-50 border-red-200',
    iconColor: 'text-red-400',
    labelColor: 'text-red-900',
  },
};