import assert from 'node:assert/strict';
import test from 'node:test';
import { appendAuditEvent } from '../base44/functions/_shared/auditEvent.ts';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function store({ atomicClaim = true, withOrganization = true } = {}) {
  const records = [];
  const organization = { id: 'org-1', audit_lock_token: null, audit_lock_at: null };
  const auditEntity = {
    async filter(query) {
      await wait(6);
      return records
        .filter(record => Object.entries(query).every(([key, value]) => record[key] === value))
        .slice(0, 2)
        .map(record => structuredClone(record));
    },
    async create(event) {
      await wait(6);
      const record = { ...structuredClone(event), id: `audit-${records.length + 1}` };
      records.push(record);
      return structuredClone(record);
    },
  };
  const organizationEntity = {
    async filter(query) {
      return query.id === organization.id ? [structuredClone(organization)] : [];
    },
    async updateMany(query, change) {
      if (query.id !== organization.id) return { updated: 0 };
      const matches = () => {
        if (query.$or && organization.audit_lock_token) return false;
        if (query.audit_lock_token !== undefined &&
          organization.audit_lock_token !== query.audit_lock_token) return false;
        if (query.audit_lock_at !== undefined &&
          organization.audit_lock_at !== query.audit_lock_at) return false;
        return true;
      };
      if (atomicClaim) {
        // Simula una operación compare-and-set indivisible en almacenamiento.
        if (!matches()) return { updated: 0 };
      } else {
        // Simula un backend que comprueba y luego escribe sin atomicidad.
        const matchedBeforeDelay = matches();
        await wait(5);
        if (!matchedBeforeDelay) return { updated: 0 };
      }
      Object.assign(organization, change.$set ?? {});
      for (const field of Object.keys(change.$unset ?? {})) delete organization[field];
      return { updated: 1 };
    },
  };
  return {
    records,
    base44: {
      asServiceRole: {
        entities: {
          AuditEvent: auditEntity,
          ...(withOrganization ? { Organization: organizationEntity } : {}),
        },
      },
    },
  };
}

const input = () => ({
  eventType: 'CONCURRENT_TEST',
  principalClass: 'SYSTEM_AUTOMATION',
  organizationId: 'org-1',
  resourceType: 'Test',
  resourceId: 'r1',
  commandPolicyId: 'CP-AUD-CONCURRENCY',
  correlationId: 'trace-1',
  auditOperationId: 'same-operation',
  operationKey: 'same-operation',
  operationSemantics: { action: 'TEST' },
});

test('P0-AUD-01: cooperative writers serialize when organization CAS is atomic (model)', async () => {
  const fixture = store();
  const results = await Promise.all([
    appendAuditEvent(fixture.base44, input()),
    appendAuditEvent(fixture.base44, input()),
  ]);
  assert.equal(fixture.records.length, 1);
  assert.equal(results.filter(result => result.duplicate).length, 1);
  assert.equal(results[0].event.id, results[1].event.id);
});

test('P0-AUD-01: without a truly atomic CAS, both writers can still create rows (model)', async () => {
  const fixture = store({ atomicClaim: false });
  await Promise.all([
    appendAuditEvent(fixture.base44, input()),
    appendAuditEvent(fixture.base44, input()),
  ]);
  assert.equal(fixture.records.length, 2, 'non-atomic claim must expose the concurrency race');
});

test('P0-AUD-01: missing organization lock fails closed before audit writes', async () => {
  const fixture = store({ withOrganization: false });
  await assert.rejects(
    appendAuditEvent(fixture.base44, input()),
    error => error?.code === 'AUDIT_LOCK_UNAVAILABLE',
  );
  assert.equal(fixture.records.length, 0);
});
