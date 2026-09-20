import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const fn=read('base44/functions/manageEnterpriseOffboarding/entry.ts');
const auth=read('base44/functions/operationalGateway/_shared/operationalAuthorization.ts');
const entity=read('base44/entities/EnterpriseOffboarding.jsonc');
const access=read('base44/entities/OffboardingAccessItem.jsonc');
const page=read('src/pages/EnterpriseOffboarding.jsx');
const checks=[
 ['records backend-owned', /"create":false/.test(entity)&&/"update":false/.test(access)],
 ['open is idempotent', /operation_key/.test(fn)&&/idempotent:true/.test(fn)],
 ['duplicate open case blocked', /OFFBOARDING_ALREADY_OPEN/.test(fn)],
 ['close checks active custody', /AssetAssignment\.filter/.test(fn)&&/OFFBOARDING_NOT_READY/.test(fn)],
 ['close checks access confirmations', /pending_access/.test(fn)],
 ['does not claim external revocation', !/revoke|revocar|desactivar.*extern/i.test(fn)],
 ['branch admin scope enforced', /fuera de la sucursal/.test(fn)],
 ['open access and close audited', /ENTERPRISE_OFFBOARDING_OPENED/.test(fn)&&/OFFBOARDING_ACCESS_CONFIRMED/.test(fn)&&/ENTERPRISE_OFFBOARDING_CLOSED/.test(fn)],
 ['generic mutations denied', /EnterpriseOffboarding: \{ read:.*create: \[\], update: \[\], delete: \[\]/.test(auth)],
 ['operator UI exposes zero time assets access and guarded closure', /Minuto Cero/.test(page)&&/Activos por recuperar/.test(page)&&/Accesos y coordinación/.test(page)&&/Cerrar offboarding/.test(page)],
 ['UI avoids external revocation overclaim', /no afirma revocarlos automáticamente/.test(page)]
];
let failures=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failures++;}if(failures)process.exit(1);console.log(`\n${checks.length}/${checks.length} Enterprise Offboarding contract checks PASS`);
