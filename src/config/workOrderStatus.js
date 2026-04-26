export const WORK_ORDER_STATUSES = {
  EN_COLA_REVISION: { label: 'En Cola', color: 'bg-amber-100 text-amber-700', column: 'PENDIENTE' },
  ASIGNADA: { label: 'Asignada', color: 'bg-blue-100 text-blue-700', column: 'PENDIENTE' },
  EN_REVISION: { label: 'En Revisión', color: 'bg-purple-100 text-purple-700', column: 'EN_PROCESO' },
  DIAGNOSTICADA: { label: 'Diagnosticada', color: 'bg-yellow-100 text-yellow-700', column: 'EN_PROCESO' },
  COTIZADA: { label: 'Cotizada', color: 'bg-orange-100 text-orange-700', column: 'EN_PROCESO' },
  EN_REPARACION: { label: 'En Reparación', color: 'bg-indigo-100 text-indigo-700', column: 'EN_PROCESO' },
  FINALIZADA: { label: 'Finalizada', color: 'bg-emerald-100 text-emerald-700', column: 'FINALIZADO' },
  ENTREGADA: { label: 'Entregada', color: 'bg-green-100 text-green-700', column: 'FINALIZADO' },
  CANCELADA: { label: 'Cancelada', color: 'bg-red-100 text-red-700', column: 'CANCELADO' }
};

export const KANBAN_COLUMNS = {
  PENDIENTE: ['EN_COLA_REVISION', 'ASIGNADA'],
  EN_PROCESO: ['EN_REVISION', 'DIAGNOSTICADA', 'COTIZADA', 'EN_REPARACION'],
  FINALIZADO: ['FINALIZADA', 'ENTREGADA']
};