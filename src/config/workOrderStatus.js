// Columnas oficiales Bloque 3 — SOT-BASE44-OPERATIVO v1
// Estado destino al soltar en cada columna

export const KANBAN_COLUMNS = {
  EN_COLA: {
    label: 'En cola',
    statuses: ['EN_COLA_REVISION'],
    defaultStatus: 'EN_COLA_REVISION',
    colorClass: 'bg-amber-50 border-amber-200',
    headerClass: 'text-amber-700',
  },
  EN_PROCESO: {
    label: 'En proceso',
    statuses: ['ASIGNADA', 'EN_REVISION', 'DIAGNOSTICADA', 'COTIZADA'],
    defaultStatus: 'EN_REVISION',
    colorClass: 'bg-blue-50 border-blue-200',
    headerClass: 'text-blue-700',
  },
  EN_REPARACION: {
    label: 'En reparación',
    statuses: ['EN_REPARACION'],
    defaultStatus: 'EN_REPARACION',
    colorClass: 'bg-indigo-50 border-indigo-200',
    headerClass: 'text-indigo-700',
  },
  FINALIZADAS: {
    label: 'Finalizadas',
    statuses: ['FINALIZADA'],
    defaultStatus: 'FINALIZADA',
    colorClass: 'bg-emerald-50 border-emerald-200',
    headerClass: 'text-emerald-700',
  },
  ENTREGADAS: {
    label: 'Entregadas',
    statuses: ['ENTREGADA'],
    defaultStatus: 'ENTREGADA',
    colorClass: 'bg-green-50 border-green-200',
    headerClass: 'text-green-700',
  },
  CANCELADAS: {
    label: 'Canceladas',
    statuses: ['CANCELADA'],
    defaultStatus: 'CANCELADA',
    colorClass: 'bg-red-50 border-red-200',
    headerClass: 'text-red-700',
  },
};

// Mapa inverso: estado -> columnId (para agrupar en frontend)
export const STATUS_TO_COLUMN = Object.entries(KANBAN_COLUMNS).reduce((acc, [colId, col]) => {
  col.statuses.forEach(s => { acc[s] = colId; });
  return acc;
}, {});

// Badge visual por estado
export const WORK_ORDER_STATUSES = {
  EN_COLA_REVISION: { label: 'En Cola',       color: 'bg-amber-100 text-amber-700' },
  ASIGNADA:         { label: 'Asignada',       color: 'bg-blue-100 text-blue-700' },
  EN_REVISION:      { label: 'En Revisión',    color: 'bg-purple-100 text-purple-700' },
  DIAGNOSTICADA:    { label: 'Diagnosticada',  color: 'bg-yellow-100 text-yellow-700' },
  COTIZADA:         { label: 'Cotizada',        color: 'bg-orange-100 text-orange-700' },
  EN_REPARACION:    { label: 'En Reparación',  color: 'bg-indigo-100 text-indigo-700' },
  FINALIZADA:       { label: 'Finalizada',     color: 'bg-emerald-100 text-emerald-700' },
  ENTREGADA:        { label: 'Entregada',      color: 'bg-green-100 text-green-700' },
  CANCELADA:        { label: 'Cancelada',      color: 'bg-red-100 text-red-700' },
};