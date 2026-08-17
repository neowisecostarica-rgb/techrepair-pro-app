import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const contractSource = read('base44/functions/_shared/publicTokenContract.ts');
const contract = await import(`data:text/javascript;base64,${Buffer.from(contractSource).toString('base64')}`);
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${name}`); };

await check('server metadata fixes purpose/resource/version and maximum TTL', () => {
  const issued = contract.issuePublicTokenMetadata({ purpose: 'QUOTE_DECISION', resourceId: 'q1', version: '3', now: '2026-01-01T00:00:00.000Z', token: 'secret-token-value' });
  assert.equal(issued.public_access_expires_at, '2026-01-08T00:00:00.000Z');
  assert.deepEqual(contract.validatePublicTokenRecord(issued, { token: 'secret-token-value', purpose: 'QUOTE_DECISION', resourceId: 'q1', version: '3', now: Date.parse('2026-01-02') }), { ok: true });
});

await check('validation denies cross-purpose, cross-resource, stale and expired tokens', () => {
  const record = contract.issuePublicTokenMetadata({ purpose: 'QUOTE_DECISION', resourceId: 'q1', version: '1', now: '2026-01-01T00:00:00.000Z', token: 'secret-token-value' });
  assert.equal(contract.validatePublicTokenRecord(record, { token: 'secret-token-value', purpose: 'WARRANTY_READ', resourceId: 'q1', version: '1' }).code, 'PUBLIC_TOKEN_WRONG_PURPOSE');
  assert.equal(contract.validatePublicTokenRecord(record, { token: 'secret-token-value', purpose: 'QUOTE_DECISION', resourceId: 'q2', version: '1' }).code, 'PUBLIC_TOKEN_WRONG_RESOURCE');
  assert.equal(contract.validatePublicTokenRecord(record, { token: 'secret-token-value', purpose: 'QUOTE_DECISION', resourceId: 'q1', version: '2' }).code, 'PUBLIC_TOKEN_STALE_VERSION');
  assert.equal(contract.validatePublicTokenRecord(record, { token: 'secret-token-value', purpose: 'QUOTE_DECISION', resourceId: 'q1', version: '1', now: Date.parse('2026-01-09') }).code, 'PUBLIC_TOKEN_EXPIRED');
});

await check('revocation and one-use consumption fail closed', () => {
  const base = contract.issuePublicTokenMetadata({ purpose: 'QUOTE_DECISION', resourceId: 'q1', now: '2026-01-01T00:00:00.000Z', token: 'secret-token-value' });
  assert.equal(contract.validatePublicTokenRecord({ ...base, public_access_revoked_at: '2026-01-02' }, { token: 'secret-token-value', purpose: 'QUOTE_DECISION', resourceId: 'q1', version: 'v1' }).code, 'PUBLIC_TOKEN_REVOKED');
  const consumed = { ...base, public_access_consumed_at: '2026-01-02' };
  assert.equal(contract.validatePublicTokenRecord(consumed, { token: 'secret-token-value', purpose: 'QUOTE_DECISION', resourceId: 'q1', version: 'v1' }).code, 'PUBLIC_TOKEN_CONSUMED');
  assert.equal(contract.validatePublicTokenRecord(consumed, { token: 'secret-token-value', purpose: 'QUOTE_DECISION', resourceId: 'q1', version: 'v1', now: Date.parse('2026-01-03'), allowConsumed: true }).ok, true);
});

await check('issuer is authenticated, capability scoped and audited', () => {
  const source = read('base44/functions/issuePublicDocumentToken/entry.ts');
  for (const fragment of ['base44.auth.me()', 'resolveAuthorizedContext', 'authorization.capabilities.includes', 'authorizeRecordBranch', 'issuePublicTokenMetadata', 'appendAuditEvent', "'PUBLIC_TOKEN_REVOKED'", "'PUBLIC_TOKEN_ISSUED'"]) assert.ok(source.includes(fragment), fragment);
});

await check('public readers enforce exact token authority and project no bearer', () => {
  const source = read('base44/functions/getPublicCommercialDocument/entry.ts');
  for (const purpose of ['QUOTE_DECISION', 'WARRANTY_READ', 'RECEIPT_READ', 'WORK_ORDER_STATUS_READ']) assert.ok(source.includes(purpose), purpose);
  for (const projection of ['function publicQuote', 'function publicWarranty', 'function publicWorkOrder']) {
    const start = source.indexOf(projection);
    const end = source.indexOf('\n}', start) + 2;
    assert.ok(!source.slice(start, end).includes('public_access_token'), projection);
  }
});

await check('public quote decision consumes token and attributes CUSTOMER_TOKEN audit', () => {
  const source = read('base44/functions/transitionWorkOrderStatus/entry.ts');
  for (const fragment of ["purpose: 'QUOTE_DECISION'", 'public_access_consumed_at: now', "principalClass: 'CUSTOMER_TOKEN'", 'publicTokenReference(token)', "commandPolicyId: 'CP-QUOTE-002'"]) assert.ok(source.includes(fragment), fragment);
  assert.ok(!source.includes("created_by_user_id: 'portal_cliente'"));
});

await check('client flows request short-lived links instead of persisting bearers', () => {
  const files = ['src/pages/OrdenesTrabajo.jsx', 'src/pages/VentasCotizaciones.jsx', 'src/components/ventas/GestionCotizaciones.jsx', 'src/pages/VentasGarantias.jsx', 'src/components/ventas/AccionesPostVenta.jsx', 'src/components/ventas/EnviarWhatsApp.jsx'];
  for (const file of files) assert.ok(read(file).includes('issuePublicDocumentToken') || read(file).includes('issuePublicLink'), file);
  const productionSources = ['base44/functions/createWorkOrder/entry.ts', 'base44/functions/createSale/entry.ts', 'base44/functions/_shared/deliveryAtomicity.ts', 'base44/functions/operationalGateway/entry.ts'];
  for (const file of productionSources) assert.ok(!read(file).includes('public_access_token:'), file);
});

await check('all public-token entity contracts remain valid JSON', () => {
  for (const entity of ['OrdenTrabajo', 'Cotizacion', 'Garantia', 'Venta']) JSON.parse(read(`base44/entities/${entity}.jsonc`));
});

console.log(`\n${passed}/8 public token contract groups PASS`);
