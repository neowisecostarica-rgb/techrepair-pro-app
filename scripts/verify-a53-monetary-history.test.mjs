import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewHistoricalCurrency} from './candidates/monetaryHistoryReview.mjs';
const doc={type:'Venta',id:'sale-a',organization_id:'a',total:123.45};
const proof={document_type:'Venta',document_id:'sale-a',organization_id:'a',source_type:'ISSUED_DOCUMENT',reviewed:true,reference:'synthetic-fixture-1',currency:'USD'};
const review=(documents=[doc],evidence=[proof])=>reviewHistoricalCurrency({tenantId:'a',documents,evidence});
test('known historical currency proposes metadata only, no amount mutation',()=>{
 const d=structuredClone(doc),e=structuredClone(proof);
 const result=review([d],[e]);
 assert.equal(result.mode,'DRY_RUN_ONLY');
 assert.deepEqual(result.decisions[0],{type:'Venta',id:'sale-a',organization_id:'a',status:'PROPOSE_BACKFILL',reason:'REVIEWED_HISTORICAL_EVIDENCE',proposedCurrency:'USD'});
 assert.deepEqual(d,doc);assert.deepEqual(e,proof);
 assert.equal(Object.hasOwn(result.decisions[0],'total'),false);
});
test('same reviewed evidence gives deterministic proposal',()=>assert.deepEqual(review(),review()));
test('existing currency never overwritten',()=>assert.equal(review([{...doc,currency:'USD'}]).decisions[0].status,'KEEP_EXISTING'));
test('existing snapshot disagreement requires review',()=>assert.equal(review([{...doc,currency:'CRC'}]).decisions[0].reason,'CONFLICTING_EVIDENCE'));
test('conflicting evidence blocked',()=>assert.equal(review([doc],[proof,{...proof,currency:'CRC'}]).decisions[0].reason,'CONFLICTING_EVIDENCE'));
for(const [name,evidence] of [
 ['no evidence',[]],['unreviewed',[{...proof,reviewed:false}]],['other tenant',[{...proof,organization_id:'b'}]],['other document',[{...proof,document_id:'sale-b'}]],['other type',[{...proof,document_type:'Cotizacion'}]],['current organization currency',[{...proof,source_type:'CURRENT_ORGANIZATION'}]],['symbol only',[{...proof,source_type:'UI_SYMBOL'}]],['empty reference',[{...proof,reference:''}]]
])test(name+' cannot assign historical currency',()=>assert.equal(review([doc],evidence).decisions[0].status,'REVIEW_REQUIRED'));
test('unverified currency blocks proposal',()=>assert.equal(review([doc],[{...proof,currency:'ZZZ'}]).decisions[0].status,'REVIEW_REQUIRED'));
test('unsupported existing currency not replaced',()=>assert.equal(review([{...doc,currency:'JPY'}]).decisions[0].reason,'UNSUPPORTED_EXISTING_CURRENCY'));
test('invalid total requires review, no coercion',()=>assert.equal(review([{...doc,total:'123.45'}]).decisions[0].reason,'INVALID_TOTAL'));
test('cross tenant document rejected',()=>assert.throws(()=>review([{...doc,organization_id:'b'}]),/INVALID_DOCUMENT_SCOPE/));
test('duplicate input rejected',()=>assert.throws(()=>review([doc,doc]),/DUPLICATE_DOCUMENT/));
test('quote and sale IDs distinguished',()=>{
 const quote={...doc,type:'Cotizacion'};
 const result=review([doc,quote]);
 assert.equal(result.decisions[0].status,'PROPOSE_BACKFILL');assert.equal(result.decisions[1].status,'REVIEW_REQUIRED');
});
