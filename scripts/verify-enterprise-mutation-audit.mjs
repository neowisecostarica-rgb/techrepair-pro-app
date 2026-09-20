import fs from 'node:fs';
const r=p=>fs.readFileSync(p,'utf8');
const on=r('base44/functions/manageEnterpriseOnboarding/entry.ts');
const off=r('base44/functions/manageEnterpriseOffboarding/entry.ts');
const onUi=r('src/pages/EnterpriseOnboarding.jsx');
const offUi=r('src/pages/EnterpriseOffboarding.jsx');
const checks=[
 ['onboarding confirm has correlation and operation key',/ONBOARDING_ACCESS_CONFIRMED[\s\S]*correlationId:key,operationKey:key/.test(on)],
 ['offboarding confirm has correlation and operation key',/OFFBOARDING_ACCESS_CONFIRMED[\s\S]*correlationId:key,operationKey:key/.test(off)],
 ['onboarding close has correlation and operation key',/ENTERPRISE_ONBOARDING_CLOSED[\s\S]*correlationId:key,operationKey:key/.test(on)],
 ['offboarding close has correlation and operation key',/ENTERPRISE_OFFBOARDING_CLOSED[\s\S]*correlationId:key,operationKey:key/.test(off)],
 ['confirm replay is state-idempotent',/item.status===status/.test(on)&&/item.status===status/.test(off)],
 ['close replay is state-idempotent',/rec.status==='CLOSED'/.test(on)&&/rec.status==='CLOSED'/.test(off)],
 ['frontend supplies operation keys',(onUi.match(/operation_key:crypto.randomUUID\(\)/g)||[]).length>=3&&(offUi.match(/operation_key:crypto.randomUUID\(\)/g)||[]).length>=3],
];
let failures=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failures++;}
if(failures)process.exit(1);
console.log(`\n${checks.length}/${checks.length} Enterprise mutation audit/idempotency checks PASS`);
