import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [
  app,
  portalClient,
  portalQuote,
  portalWarranty,
  portalReceipt,
  quoteManagement,
  quotePage,
  pos,
  delivery,
  transition,
  publicReader,
  authContext,
  canonicalAuthorization,
  qaEvidence,
] = await Promise.all([
  read('src/App.jsx'),
  read('src/pages/PortalCliente.jsx'),
  read('src/pages/PortalCotizacion.jsx'),
  read('src/pages/PortalGarantia.jsx'),
  read('src/pages/PortalComprobante.jsx'),
  read('src/components/ventas/GestionCotizaciones.jsx'),
  read('src/pages/VentasCotizaciones.jsx'),
  read('src/pages/PuntoVenta.jsx'),
  read('src/components/ot/EntregarOT.jsx'),
  read('base44/functions/transitionWorkOrderStatus/entry.ts'),
  read('base44/functions/getPublicCommercialDocument/entry.ts'),
  read('src/components/contexts/AuthContext.jsx'),
  read('base44/functions/_shared/userAuthorization.ts'),
  read('base44/functions/_shared/qaEvidence.ts'),
]);

const pass = (name, check) => {
  assert.ok(check, name);
  console.log(`PASS ${name}`);
};

pass('public commercial pages bypass the authenticated layout gate',
  app.includes("const PUBLIC_PAGE_NAMES = ['PortalCliente', 'PortalCotizacion', 'PortalComprobante', 'PortalGarantia']")
  && app.includes('if (publicPageName)'));

for (const [name, source] of [
  ['work-order portal', portalClient],
  ['quote portal', portalQuote],
  ['warranty portal', portalWarranty],
  ['receipt portal', portalReceipt],
]) {
  pass(`${name} reads through the token-validating backend`,
    source.includes("functions.invoke('getPublicCommercialDocument'")
    && !/entities\.(OrdenTrabajo|Cotizacion|Garantia|Venta)\.filter\(\{\s*public_access_token/.test(source));
}

pass('public reader uses service role only after validating document type and token shape',
  publicReader.includes("const PUBLIC_TYPES = ['work_order', 'quote', 'warranty', 'receipt']")
  && publicReader.includes("token.length < 16")
  && publicReader.includes('base44.asServiceRole.entities'));

pass('customer approval is handled by the lifecycle owner and creates canonical timeline evidence',
  transition.includes('handlePublicCustomerDecisionV2')
  && transition.includes("newStatus: targetStatus") === false
  && transition.includes("const eventType = targetStatus === 'APROBADA' ? 'TRANSITION_APROBADA' : 'CANCELADA'")
  && transition.includes("decision_status: 'COMMITTED'")
  && transition.includes('OrdenTrabajo.updateMany'));

pass('quote portal exposes approve and reject actions',
  portalQuote.includes("newStatus: 'APROBADA'")
  && portalQuote.includes("newStatus: 'CANCELADA'"));

pass('all generated quote links target the registered PortalCotizacion route',
  !quotePage.includes('/cotizacion?token=')
  && !quoteManagement.includes('/cotizacion?token=')
  && quotePage.includes('/PortalCotizacion?token=')
  && quoteManagement.includes('/PortalCotizacion?token='));

pass('sending an OT quote advances DIAGNOSTICADA to COTIZADA through the lifecycle helper',
  quotePage.includes("transicionarEstadoOT(ot.id, 'COTIZADA'")
  && quoteManagement.includes("transicionarEstadoOT(ordenTrabajoId, 'COTIZADA'"));

pass('POS no longer skips repair and QA states after payment',
  !pos.includes("transicionarEstadoOT(ventaData.referencia_ot_id, 'FINALIZADA'"));

pass('work orders cannot finalize without successful technical QA evidence',
  transition.includes("newStatus === 'FINALIZADA'")
  && transition.includes('entities.PruebaTecnica.filter')
  && transition.includes('evaluateCurrentQaEvidence')
  && qaEvidence.includes("record?.author_role === 'TECHNICIAN'")
  && qaEvidence.includes("record?.recorded_via_backend === true")
  && qaEvidence.includes('QA_LATER_INCOMPATIBLE_RESULT'));

pass('repair warranty issuance is deferred until delivery',
  pos.includes('if (esReparacion) return;'));

pass('delivery evidence and warranty are idempotent before the terminal transition',
  delivery.includes('logsExistentes.length === 0')
  && delivery.includes('garantiasExistentes.length === 0')
  && delivery.indexOf('logsExistentes.length === 0') < delivery.lastIndexOf("transicionarEstadoOT(ordenTrabajo.id, 'ENTREGADA'"));

pass('branch administrators can complete delivery as allowed by the backend state machine',
  delivery.includes("['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES']"));

pass('canonical UserAccount.status is the only authorization source',
  canonicalAuthorization.includes("account?.status === 'active'")
  && authContext.includes('getIdentityContext')
  && !authContext.includes('base44.entities.UserAccount')
  && !canonicalAuthorization.includes('account?.active'));

console.log('\n16 commercial-flow recovery contract checks passed.');
