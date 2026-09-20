export const STATUS_KEYS={PENDING:'status.pending',OPEN:'status.active',ACTIVE:'status.active',CLOSED:'status.closed',CANCELLED:'status.cancelled',CONFIRMED:'status.confirmed',NOT_APPLICABLE:'status.notApplicable',SUSPENDED:'status.suspended',INVITED:'status.invited'};
export function translateStatus(t,status,fallback=status){return t(STATUS_KEYS[String(status||'').toUpperCase()],fallback)}
