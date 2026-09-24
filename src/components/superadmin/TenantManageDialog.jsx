import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { listIdentityAccounts, adminUpdateIdentityOrganization } from '@/api/identity';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Building2, Users, MapPin, Save, Plus, Power, RotateCcw, UserCog } from 'lucide-react';

const ROLES = [
  { value: 'ORG_ADMIN', label: 'Administrador' },
  { value: 'BRANCH_ADMIN', label: 'Admin de sucursal' },
  { value: 'TECHNICIAN', label: 'Técnico' },
  { value: 'SALES', label: 'Ventas' },
  { value: 'INVENTORY', label: 'Inventario' },
  { value: 'CUSTOMER_SERVICE', label: 'Servicio al cliente' },
];

export default function TenantManageDialog({ organization, onClose }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState('detalles');
  const [details, setDetails] = useState({
    name: organization?.name || '',
    legal_name: organization?.legal_name || '',
    telefono_negocio: organization?.telefono_negocio || '',
    email: organization?.email || '',
    direccion_comercial: organization?.direccion_comercial || '',
  });

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['identity', 'accounts', organization?.id],
    queryFn: () => listIdentityAccounts(organization.id).then(r => r.accounts),
    enabled: !!organization?.id,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['tenant-branches', organization?.id],
    queryFn: () => base44.entities.Branch.filter({ organization_id: organization.id }),
    enabled: !!organization?.id,
  });

  const updateDetailsMutation = useMutation({
    mutationFn: (changes) => adminUpdateIdentityOrganization(organization.id, changes, 'Edición de detalles del tenant desde consola'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['identity', 'admin-overview'] });
      queryClient.invalidateQueries({ queryKey: ['identity', 'organization', organization.id] });
      toast({ title: 'Detalles actualizados' });
    },
    onError: (e) => toast({ variant: 'destructive', title: 'No se pudo actualizar', description: e?.message }),
  });

  const inviteMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke('manageOrgUser', { action: 'invite', organizationId: organization.id, data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['identity', 'accounts', organization.id] });
      toast({ title: 'Invitación enviada' });
    },
    onError: (e) => toast({ variant: 'destructive', title: 'No se pudo invitar', description: e?.data?.error || e?.message }),
  });

  const updateAccountMutation = useMutation({
    mutationFn: ({ targetAccountId, data }) => base44.functions.invoke('manageOrgUser', { action: 'updateAccount', organizationId: organization.id, targetAccountId, data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['identity', 'accounts', organization.id] });
      toast({ title: 'Cuenta actualizada' });
    },
    onError: (e) => toast({ variant: 'destructive', title: 'No se pudo actualizar', description: e?.data?.error || e?.message }),
  });

  const branchMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke('manageBranchLifecycle', data).then(r => r?.data ?? r),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-branches', organization.id] });
      queryClient.invalidateQueries({ queryKey: ['all-branches'] });
    },
    onError: (e) => toast({ variant: 'destructive', title: 'No se pudo gestionar la sucursal', description: e?.message }),
  });

  if (!organization) return null;

  const handleSaveDetails = () => {
    const changes = {};
    Object.keys(details).forEach(k => { if (details[k] !== (organization[k] || '')) changes[k] = details[k]; });
    if (Object.keys(changes).length === 0) { toast({ title: 'Sin cambios' }); return; }
    updateDetailsMutation.mutate(changes);
  };

  const orgBranches = branches.filter(b => b.organization_id === organization.id);

  return (
    <Dialog open={!!organization} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Building2 className="w-5 h-5 text-slate-600" />
            {organization.name}
            <Badge className={organization.status === 'active' ? 'bg-teal-50 text-teal-800 border border-teal-200' : 'bg-red-50 text-red-700 border border-red-200'}>
              {organization.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="detalles"><Building2 className="w-4 h-4 mr-2" />Detalles</TabsTrigger>
            <TabsTrigger value="usuarios"><Users className="w-4 h-4 mr-2" />Usuarios</TabsTrigger>
            <TabsTrigger value="sucursales"><MapPin className="w-4 h-4 mr-2" />Sucursales</TabsTrigger>
          </TabsList>

          {/* Detalles */}
          <TabsContent value="detalles">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Nombre comercial</Label><Input value={details.name} onChange={e => setDetails({ ...details, name: e.target.value })} /></div>
                <div><Label>Razón social</Label><Input value={details.legal_name} onChange={e => setDetails({ ...details, legal_name: e.target.value })} /></div>
                <div><Label>Teléfono</Label><Input value={details.telefono_negocio} onChange={e => setDetails({ ...details, telefono_negocio: e.target.value })} /></div>
                <div><Label>Email</Label><Input type="email" value={details.email} onChange={e => setDetails({ ...details, email: e.target.value })} /></div>
                <div className="col-span-2"><Label>Dirección comercial</Label><Input value={details.direccion_comercial} onChange={e => setDetails({ ...details, direccion_comercial: e.target.value })} /></div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveDetails} disabled={updateDetailsMutation.isPending} className="bg-teal-700 hover:bg-teal-800">
                  <Save className="w-4 h-4 mr-2" />{updateDetailsMutation.isPending ? 'Guardando...' : 'Guardar detalles'}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Usuarios */}
          <TabsContent value="usuarios">
            <UserTab accounts={accounts} loading={loadingAccounts} branches={orgBranches} onInvite={inviteMutation.mutate} onUpdate={updateAccountMutation.mutate} />
          </TabsContent>

          {/* Sucursales */}
          <TabsContent value="sucursales">
            <BranchTab branches={orgBranches} onCreate={branchMutation.mutate} onLifecycle={branchMutation.mutate} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function UserTab({ accounts, loading, branches, onInvite, onUpdate }) {
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('TECHNICIAN');
  const [branchId, setBranchId] = useState('');

  if (loading) return <p className="text-sm text-slate-500 p-4">Cargando usuarios...</p>;

  const handleInvite = (e) => {
    e.preventDefault();
    onInvite({ user_email: email, role, branch_id: branchId || null });
    setShowInvite(false); setEmail(''); setRole('TECHNICIAN'); setBranchId('');
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-600">{accounts.length} usuario(s)</p>
        <Button size="sm" variant="outline" onClick={() => setShowInvite(s => !s)}><Plus className="w-4 h-4 mr-1" />Invitar</Button>
      </div>
      {showInvite && (
        <form onSubmit={handleInvite} className="grid grid-cols-1 sm:grid-cols-4 gap-2 p-3 bg-slate-50 rounded-lg">
          <Input type="email" placeholder="email@empresa.com" value={email} onChange={e => setEmail(e.target.value)} required />
          <select value={role} onChange={e => setRole(e.target.value)} className="px-2 py-2 border border-slate-200 rounded-md text-sm">
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select value={branchId} onChange={e => setBranchId(e.target.value)} className="px-2 py-2 border border-slate-200 rounded-md text-sm">
            <option value="">Sin sucursal</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <Button type="submit" size="sm" className="bg-teal-700 hover:bg-teal-800">Enviar</Button>
        </form>
      )}
      <div className="space-y-2">
        {accounts.map(a => (
          <div key={a.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
            <div>
              <p className="text-sm font-medium text-slate-900">{a.user_email}</p>
              <p className="text-xs text-slate-500">{a.role} · {a.status}</p>
            </div>
            <div className="flex gap-2">
              <select
                value={a.role}
                onChange={e => onUpdate({ targetAccountId: a.id, data: { role: e.target.value, branch_id: a.branch_id || null, status: a.status === 'active' ? 'active' : 'invited' } })}
                className="px-2 py-1 border border-slate-200 rounded text-xs"
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {a.status === 'active' ? (
                <Button size="sm" variant="outline" className="text-xs border-red-300 text-red-600"
                  onClick={() => onUpdate({ targetAccountId: a.id, data: { role: a.role, branch_id: a.branch_id || null, status: 'suspended' } })}>
                  Suspender
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="text-xs border-green-300 text-green-600"
                  onClick={() => onUpdate({ targetAccountId: a.id, data: { role: a.role, branch_id: a.branch_id || null, status: 'active' } })}>
                  Activar
                </Button>
              )}
            </div>
          </div>
        ))}
        {accounts.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Sin usuarios invitados</p>}
      </div>
    </div>
  );
}

function BranchTab({ branches, onCreate, onLifecycle }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  const handleCreate = (e) => {
    e.preventDefault();
    onCreate({ action: 'CREATE', operation_key: `branch_create_${crypto.randomUUID()}`, name, address, phone });
    setShowCreate(false); setName(''); setAddress(''); setPhone('');
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-600">{branches.length} sucursal(es)</p>
        <Button size="sm" variant="outline" onClick={() => setShowCreate(s => !s)}><Plus className="w-4 h-4 mr-1" />Crear</Button>
      </div>
      {showCreate && (
        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg">
          <Input placeholder="Nombre *" value={name} onChange={e => setName(e.target.value)} required />
          <Input placeholder="Dirección" value={address} onChange={e => setAddress(e.target.value)} />
          <Input placeholder="Teléfono" value={phone} onChange={e => setPhone(e.target.value)} />
          <div className="sm:col-span-3"><Button type="submit" size="sm" className="bg-teal-700 hover:bg-teal-800">Crear sucursal</Button></div>
        </form>
      )}
      <div className="space-y-2">
        {branches.map(b => (
          <div key={b.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
            <div>
              <p className="text-sm font-medium text-slate-900">{b.name} {b.is_primary && <Badge className="ml-1 bg-teal-50 text-teal-800 border-0 text-xs">Principal</Badge>}</p>
              <p className="text-xs text-slate-500">{b.address || 'Sin dirección'} · {b.phone || 'Sin teléfono'}</p>
            </div>
            {b.active ? (
              <Button size="sm" variant="outline" className="text-xs border-red-300 text-red-600"
                onClick={() => onLifecycle({ action: 'DEACTIVATE', branch_id: b.id, operation_key: `branch_deact_${crypto.randomUUID()}` })}>
                <Power className="w-3 h-3 mr-1" />Desactivar
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="text-xs border-green-300 text-green-600"
                onClick={() => onLifecycle({ action: 'REACTIVATE', branch_id: b.id, operation_key: `branch_react_${crypto.randomUUID()}` })}>
                <RotateCcw className="w-3 h-3 mr-1" />Reactivar
              </Button>
            )}
          </div>
        ))}
        {branches.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Sin sucursales</p>}
      </div>
    </div>
  );
}