// Offline proposal only. No SDK, I/O, persistence, customer data or live migration.
import { requireCurrency } from './monetaryContract.mjs';
const TYPES = new Set(['Venta','Cotizacion']);
const VALID_EVIDENCE = new Set(['ISSUED_DOCUMENT','HISTORICAL_LEDGER','VERIFIED_CONTEMPORARY_RECORD']);
const key = (type,id) => JSON.stringify([type,id]);
function validCurrency(value) {
  try { return requireCurrency(value); } catch { return null; }
}
export function reviewHistoricalCurrency({tenantId,documents,evidence}) {
  if (!tenantId || !Array.isArray(documents) || !Array.isArray(evidence)) throw new Error('INVALID_REVIEW_INPUT');
  const seen = new Set();
  const decisions = [];
  for (const doc of documents) {
    if (!TYPES.has(doc?.type) || typeof doc.id !== 'string' || !doc.id || doc.organization_id !== tenantId) throw new Error('INVALID_DOCUMENT_SCOPE');
    const k=key(doc.type,doc.id);
    if(seen.has(k)) throw new Error('DUPLICATE_DOCUMENT');
    seen.add(k);
    const matches=evidence.filter(e=>e?.organization_id===tenantId && e.document_type===doc.type && e.document_id===doc.id && VALID_EVIDENCE.has(e.source_type) && e.reviewed===true && typeof e.reference==='string' && e.reference.trim());
    const currencies=new Set(matches.map(e=>validCurrency(e.currency)));
    const current=validCurrency(doc.currency);
    let status='REVIEW_REQUIRED', reason='NO_VERIFIED_EVIDENCE', proposedCurrency=null;
    if(typeof doc.total!=='number'||!Number.isFinite(doc.total)) reason='INVALID_TOTAL';
    else if(doc.currency!=null && !current) reason='UNSUPPORTED_EXISTING_CURRENCY';
    else if(currencies.has(null)||currencies.size>1||(current&&currencies.size===1&&!currencies.has(current))) reason='CONFLICTING_EVIDENCE';
    else if(current){status='KEEP_EXISTING';reason='EXPLICIT_SNAPSHOT';}
    else if(currencies.size===1){status='PROPOSE_BACKFILL';reason='REVIEWED_HISTORICAL_EVIDENCE';proposedCurrency=[...currencies][0];}
    decisions.push({type:doc.type,id:doc.id,organization_id:tenantId,status,reason,proposedCurrency});
  }
  return {mode:'DRY_RUN_ONLY',tenantId,decisions};
}
