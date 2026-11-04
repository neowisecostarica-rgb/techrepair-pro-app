/**
 * TRP P0-AUD-01 -- NOT CONNECTED TO PRODUCTION.
 * Dependency-injected PostgreSQL ledger candidate. No credentials or network
 * connection are provisioned here. Do not call from live commerce until the
 * database and independent runtime concurrency gate are approved.
 */
export type LedgerQuery = {
  query: (sql: string, params: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};
export type AuditIdentity = {
  organization_id: string;
  audit_operation_id: string;
  event_type: string;
  principal_class: string;
  actor_user_id: string | null;
  effective_technician_user_id?: string | null;
  resource_type: string;
  resource_id: string;
  command_policy_id: string;
  operation_semantics?: Record<string, unknown>;
};
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value === null || typeof value !== 'object') return value ?? null;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
};
const required = (v: string | null | undefined, name: string) => {
  if (typeof v !== 'string' || v.trim().length < 1 || v.length > 240) {
    throw new Error('AUDIT_EVENT_FIELD_REQUIRED:' + name);
  }
  return v;
};
const INSERT = `INSERT INTO trp_audit_ledger
(organization_id, audit_operation_id, immutable_sha256, event_payload)
VALUES ($1, $2, $3, $4::jsonb)
ON CONFLICT (organization_id, audit_operation_id) DO NOTHING
RETURNING ledger_id, immutable_sha256`;
const SELECT = `SELECT ledger_id, immutable_sha256
FROM trp_audit_ledger WHERE organization_id = $1 AND audit_operation_id = $2`;

export async function prepareAtomicAuditRecord(input: AuditIdentity) {
  const organizationId = required(input.organization_id, 'organization_id');
  const operationId = required(input.audit_operation_id, 'audit_operation_id');
  const identity = stable({
    event_type: required(input.event_type, 'event_type'),
    principal_class: required(input.principal_class, 'principal_class'),
    actor_user_id: input.actor_user_id || null,
    effective_technician_user_id: input.effective_technician_user_id || null,
    resource_type: required(input.resource_type, 'resource_type'),
    resource_id: required(input.resource_id, 'resource_id'),
    command_policy_id: required(input.command_policy_id, 'command_policy_id'),
    operation_semantics: input.operation_semantics || {},
  });
  const encoded = new TextEncoder().encode(JSON.stringify(identity));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  // No dynamic metadata, customer names, credentials, snapshots or PII payload.
  // Authorization must be performed by the invoking backend before this call.
  const payload = JSON.stringify({ event_type: input.event_type, resource_type: input.resource_type,
    resource_id: input.resource_id, command_policy_id: input.command_policy_id });
  return { organizationId, operationId, hash, payload };
}

export async function appendAtomicAuditLedger(db: LedgerQuery | undefined, input: AuditIdentity) {
  if (!db || typeof db.query !== 'function') throw new Error('AUDIT_LEDGER_NOT_CONFIGURED');
  const row = await prepareAtomicAuditRecord(input);
  // Unique constraint, not this application process, resolves concurrent writes.
  // Query #2 is intentionally a fresh READ COMMITTED statement after conflict
  // resolution, not a SELECT in the same INSERT CTE statement snapshot.
  const inserted = await db.query(INSERT, [row.organizationId, row.operationId, row.hash, row.payload]);
  if (inserted.rows.length > 1) throw new Error('AUDIT_LEDGER_INCONSISTENT');
  if (inserted.rows.length === 1) {
    if (inserted.rows[0].immutable_sha256 !== row.hash) throw new Error('AUDIT_LEDGER_INCONSISTENT');
    return { ledgerId: inserted.rows[0].ledger_id, duplicate: false, immutableHash: row.hash };
  }
  const selected = await db.query(SELECT, [row.organizationId, row.operationId]);
  if (selected.rows.length !== 1) throw new Error('AUDIT_LEDGER_UNAVAILABLE');
  if (selected.rows[0].immutable_sha256 !== row.hash) throw new Error('AUDIT_OPERATION_ID_COLLISION');
  return { ledgerId: selected.rows[0].ledger_id, duplicate: true, immutableHash: row.hash };
}

export const ledgerSqlContract = { insert: INSERT, select: SELECT };
