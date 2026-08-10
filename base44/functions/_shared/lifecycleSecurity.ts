const EVENT_REQUIRED_STATE = Object.freeze({
  FINALIZADA: 'FINALIZADA',
  ENTREGADA: 'ENTREGADA',
  CANCELADA: 'CANCELADA',
});

export function requiredWorkOrderStateForEvent(eventType) {
  return EVENT_REQUIRED_STATE[eventType] || null;
}

export function eventMatchesCurrentWorkOrderState(eventType, workOrder) {
  const requiredState = requiredWorkOrderStateForEvent(eventType);
  return !requiredState || workOrder?.estado === requiredState;
}
