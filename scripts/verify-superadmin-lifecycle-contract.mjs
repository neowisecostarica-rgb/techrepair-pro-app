import fs from 'node:fs';
const saas=fs.readFileSync('src/pages/Saas.jsx','utf8');
const api=fs.readFileSync('src/api/identity.js','utf8');
const gateway=fs.readFileSync('base44/functions/identityGateway/entry.ts','utf8');
const checks=[
 ['suspension UI requires a reason', /!selectedOrg \|\| !suspendReason\.trim\(\)/.test(saas)],
 ['suspension passes reason as audit context', /auditContext: `Suspensión administrativa: \$\{suspendReason\.trim\(\)\}`/.test(saas)],
 ['identity API transports audit context separately from org fields', /audit_context: auditContext/.test(api)],
 ['backend sanitizes audit context', /context: clean\(body\.audit_context, 2000\)/.test(gateway)],
 ['admin audit records changed fields', /metadata: \{ changed_fields: Object\.keys\(updates\) \}/.test(gateway)],
];
let failed=0; for(const [name,ok] of checks){ console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed++; }
if(failed){ console.error(`\\n${failed}/${checks.length} lifecycle checks failed`); process.exit(1); }
console.log(`\\n${checks.length}/${checks.length} Super Admin lifecycle contract checks PASS`);
