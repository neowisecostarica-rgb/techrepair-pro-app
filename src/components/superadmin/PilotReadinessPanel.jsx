import React from 'react';
import { CheckCircle2, CircleAlert, ClipboardCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function requirement(label, ready) {
  return (
    <li className={`flex items-center gap-2 text-sm ${ready ? 'text-emerald-700' : 'text-amber-800'}`}>
      {ready ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <CircleAlert className="w-4 h-4 shrink-0" />}
      {label}
    </li>
  );
}

export default function PilotReadinessPanel({ organizations = [], accounts = [], branches = [] }) {
  const candidates = organizations.map((organization) => {
    const orgAccounts = accounts.filter(account => account.organization_id === organization.id);
    const activeBranches = branches.filter(branch => branch.organization_id === organization.id && branch.active === true);
    const activeAdmins = orgAccounts.filter(account => account.status === 'active' && account.role === 'ORG_ADMIN');
    const checks = [
      ['Organización activa', organization.status === 'active'],
      ['Plan asignado', Boolean(organization.plan)],
      ['Sucursal activa', activeBranches.length > 0],
      ['Administrador activo', activeAdmins.length > 0],
      ['Provisionamiento listo', organization.provisioning_status === 'READY'],
    ];
    return { organization, checks, ready: checks.every(([, passed]) => passed) };
  });

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardCheck className="w-5 h-5 text-blue-600" />
          Preparación para piloto
        </CardTitle>
        <p className="text-sm text-slate-500">Lectura operativa: no crea datos ni modifica permisos.</p>
      </CardHeader>
      <CardContent>
        {candidates.length === 0 ? (
          <p className="text-sm text-slate-500">Crea la organización por el flujo canónico antes de iniciar un piloto.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {candidates.map(({ organization, checks, ready }) => (
              <div key={organization.id} className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{organization.name}</p>
                    <p className="text-xs text-slate-500">{organization.plan?.toUpperCase() || 'SIN PLAN'} · {organization.currency || 'sin moneda'}</p>
                  </div>
                  <Badge className={ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                    {ready ? 'LISTO PARA SESIÓN' : 'PENDIENTE'}
                  </Badge>
                </div>
                <ul className="space-y-1.5">{checks.map(([label, passed]) => <React.Fragment key={label}>{requirement(label, passed)}</React.Fragment>)}</ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
