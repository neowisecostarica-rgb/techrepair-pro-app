import test from 'node:test';
import assert from 'node:assert/strict';
import { VERIFIED_CANDIDATE_CURRENCIES, requireDocumentCurrency, assertSameCurrency, formatDocumentAmount, formatPdfAmount, deriveNewDocumentCurrency } from './candidates/monetaryContract.mjs';
for (const currency of VERIFIED_CANDIDATE_CURRENCIES) {
  test(currency + ' retains value and explicit code across locales', () => {
    for (const locale of ['es','en','pt','fr','no']) {
      const doc={currency};
      const value=formatDocumentAmount(doc,1234.5,locale);
      assert.ok(value.includes(currency));
      assert.ok(value.includes('50'));
      assert.equal(formatPdfAmount(doc,1234.5),currency+' 1234.50');
    }
  });
}
test('zero and negative adjustments retain sign and precision',()=>{
  assert.equal(formatPdfAmount({currency:'CRC'},0),'CRC 0.00');
  assert.equal(formatPdfAmount({currency:'USD'},-12.34),'USD -12.34');
});
test('historical document never inherits the current tenant currency',()=>{
  const org={id:'a',currency:'EUR'};
  assert.equal(formatPdfAmount({currency:'CRC',organization_id:org.id},200),'CRC 200.00');
  assert.throws(()=>requireDocumentCurrency({organization_id:org.id}),/CURRENCY_UNVERIFIED/);
});
for (const currency of [undefined,null,'','crc','ZZZ','JPY','BTC']) {
  test('unverified currency rejected: '+String(currency),()=>assert.throws(()=>formatDocumentAmount({currency},100),/CURRENCY_UNVERIFIED/));
}
for (const amount of [null,undefined,'100',NaN,Infinity]) {
  test('invalid amount rejected: '+String(amount),()=>assert.throws(()=>formatDocumentAmount({currency:'USD'},amount),/INVALID_AMOUNT/));
}
test('quote to sale retains currency for same tenant',()=>{
  assert.equal(deriveNewDocumentCurrency({id:'a',currency:'MXN'},'a',{organization_id:'a',currency:'MXN'}),'MXN');
});
test('new document uses canonical tenant currency',()=>{
  assert.equal(deriveNewDocumentCurrency({id:'a',currency:'EUR'},'a'),'EUR');
});
test('mixed-currency conversion and aggregation rejected',()=>{
  assert.throws(()=>assertSameCurrency({currency:'USD'},{currency:'CRC'}),/CURRENCY_MISMATCH/);
  assert.throws(()=>deriveNewDocumentCurrency({id:'a',currency:'USD'},'a',{organization_id:'a',currency:'CRC'}),/CURRENCY_MISMATCH/);
});
test('cross-tenant source or organization rejected',()=>{
  assert.throws(()=>deriveNewDocumentCurrency({id:'a',currency:'USD'},'b'),/CURRENCY_TENANT_MISMATCH/);
  assert.throws(()=>deriveNewDocumentCurrency({id:'a',currency:'USD'},'a',{organization_id:'b',currency:'USD'}),/CURRENCY_TENANT_MISMATCH/);
});
test('aggregation fails closed without verified monetary snapshots',()=>{
  assert.throws(()=>assertSameCurrency(),/CURRENCY_UNVERIFIED/);
  assert.throws(()=>assertSameCurrency({currency:'USD'},{}),/CURRENCY_UNVERIFIED/);
  assert.equal(assertSameCurrency({currency:'USD'},{currency:'USD'}),'USD');
});
