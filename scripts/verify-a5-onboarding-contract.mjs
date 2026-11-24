import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page=read('src/pages/Onboarding.jsx'),wizard=read('src/components/onboarding/GuidedOnboardingWizard.jsx'),invite=read('src/components/onboarding/StepInviteTeam.jsx'),first=read('src/components/onboarding/StepFirstRecepcion.jsx'),orders=read('src/pages/OrdenesTrabajo.jsx'),backend=read('base44/functions/identityGateway/entry.ts'),team=read('base44/functions/manageOrgUser/entry.ts');
const checks=[
 ['identity error recoverable, not deactivation',page.includes("setMode('check_error')")&&page.includes('onClick={checkUserStatus}')],
 ['no arbitrary invitation when multiple pending',page.includes('pendingInvitations?.length === 1')&&page.includes("setMode('multiple_invitations')")],
 ['bootstrap requires authoritative readiness',page.includes('!result?.readiness?.ready')&&page.includes("result.account?.role !== 'ORG_ADMIN'")],
 ['branch belongs to created tenant and is active',page.includes('result.branch.organization_id !== result.organization.id')&&page.includes('result.branch.active !== true')],
 ['primary branch propagated to team invitation',page.includes('setPrimaryBranchId(result.branch.id)')&&wizard.includes('primaryBranchId={primaryBranchId}')&&invite.includes('branch_id: primaryBranchId')],
 ['backend requires active branch for branch scoped role',team.includes('USER_BRANCH_REQUIRED')&&team.includes('assertActiveBranch')],
 ['invitation has synchronous duplicate guard',invite.includes('if (inviteInFlight.current) return')&&invite.includes('inviteInFlight.current = true')],
 ['solo technician can skip team step',invite.includes('onClick={onSkip}')&&invite.includes('Si trabajas solo')],
 ['no automatic claim of email delivered',invite.includes('Invitación registrada')&&!invite.includes('recibirá un correo')],
 ['first intake activation route preserved',first.includes('activation=first_work_order')&&orders.includes("params.get('activation') !== 'first_work_order'")],
 ['server still owns initial package',/plan:\s*"basic"/.test(backend)&&!page.includes("plan: 'community'")],
 ['bootstrap ambiguity requires identity recheck',page.includes('PROVISIONING_UNCONFIRMED')&&page.includes('Verifica el estado de tu cuenta antes de volver a crear el taller')]
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log('PASS '+name)}
console.log(checks.length+'/'+checks.length+' A5 source contracts PASS');
