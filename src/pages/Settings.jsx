import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, MapPin, Users, Plus, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import PageGuard from '../components/guards/PageGuard';

export default function Settings() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN']}>
      <SettingsContent />
    </PageGuard>
  );
}

function SettingsContent() {
  const [user, setUser] = useState(null);
  const [userAccount, setUserAccount] = useState(null);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [inviting, setInviting] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(async (u) => {
      setUser(u);
      const accounts = await base44.entities.UserAccount.filter({ user_id: u.id });
      if (accounts.length > 0) setUserAccount(accounts[0]);
    });
  }, []);

  const { data: organization } = useQuery({
    queryKey: ['organization', userAccount?.organization_id],
    queryFn: () => base44.entities.Organization.filter({ id: userAccount.organization_id }),
    enabled: !!userAccount?.organization_id,
    select: (data) => data[0],
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', userAccount?.organization_id],
    queryFn: () => base44.entities.Branch.filter({ organization_id: userAccount.organization_id }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['userAccounts', userAccount?.organization_id],
    queryFn: () => base44.entities.UserAccount.filter({ organization_id: userAccount.organization_id }),
    enabled: !!userAccount?.organization_id,
  });

  const createBranchMutation = useMutation({
    mutationFn: (data) => base44.entities.Branch.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setShowBranchModal(false);
    },
  });

  const deleteBranchMutation = useMutation({
    mutationFn: (id) => base44.entities.Branch.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  const inviteUserMutation = useMutation({
    mutationFn: async (data) => {
      // Pre-crear UserAccount
      await base44.entities.UserAccount.create({
        user_email: data.user_email,
        organization_id: userAccount.organization_id,
        branch_id: data.branch_id || undefined,
        role: data.role,
        active: false, // Se activará en onboarding
      });

      // Invitar usuario
      await base44.users.inviteUser(data.user_email, 'user');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userAccounts'] });
      setShowUserModal(false);
      setInviting(false);
    },
    onError: () => {
      setInviting(false);
    },
  });

  const handleCreateBranch = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    createBranchMutation.mutate({
      organization_id: userAccount.organization_id,
      name: formData.get('name'),
      address: formData.get('address'),
      phone: formData.get('phone'),
      active: true,
    });
  };

  const handleInviteUser = (e) => {
    e.preventDefault();
    setInviting(true);
    const formData = new FormData(e.target);
    inviteUserMutation.mutate({
      user_email: formData.get('user_email'),
      branch_id: formData.get('branch_id'),
      role: formData.get('role'),
    });
  };

  if (!userAccount || !organization) {
    return <div className="p-8 text-center">Cargando...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Configuración</h1>
        <p className="text-slate-500">Gestión de empresa, sucursales y usuarios</p>
      </div>

      <Tabs defaultValue="empresa" className="space-y-6">
        <TabsList className="bg-white border border-slate-200 p-1">
          <TabsTrigger value="empresa" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
            <Building2 className="w-4 h-4 mr-2" />
            Empresa
          </TabsTrigger>
          <TabsTrigger value="sucursales" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
            <MapPin className="w-4 h-4 mr-2" />
            Sucursales
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
            <Users className="w-4 h-4 mr-2" />
            Usuarios
          </TabsTrigger>
        </TabsList>

        {/* Tab Empresa */}
        <TabsContent value="empresa">
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b border-slate-100">
              <CardTitle>Datos de la Empresa</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label className="text-slate-500">Nombre</Label>
                  <p className="font-semibold text-slate-900">{organization.name}</p>
                </div>
                {organization.legal_name && (
                  <div>
                    <Label className="text-slate-500">Razón Social</Label>
                    <p className="font-semibold text-slate-900">{organization.legal_name}</p>
                  </div>
                )}
                <div>
                  <Label className="text-slate-500">País</Label>
                  <p className="font-semibold text-slate-900">{organization.country}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Moneda</Label>
                  <p className="font-semibold text-slate-900">{organization.currency}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Plan</Label>
                  <Badge className="bg-blue-100 text-blue-700 border-0">{organization.plan}</Badge>
                </div>
                <div>
                  <Label className="text-slate-500">Estado</Label>
                  <Badge className={organization.status === 'active' 
                    ? 'bg-emerald-100 text-emerald-700 border-0' 
                    : 'bg-red-100 text-red-700 border-0'}>
                    {organization.status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Sucursales */}
        <TabsContent value="sucursales">
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle>Sucursales</CardTitle>
              <Button onClick={() => setShowBranchModal(true)} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Nueva Sucursal
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3">
                {branches.map(branch => (
                  <div key={branch.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                    <div>
                      <p className="font-semibold text-slate-900">{branch.name}</p>
                      {branch.address && <p className="text-sm text-slate-500">{branch.address}</p>}
                      {branch.phone && <p className="text-sm text-slate-500">{branch.phone}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={branch.active 
                        ? 'bg-emerald-100 text-emerald-700 border-0' 
                        : 'bg-slate-100 text-slate-700 border-0'}>
                        {branch.active ? 'Activa' : 'Inactiva'}
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteBranchMutation.mutate(branch.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
                {branches.length === 0 && (
                  <p className="text-center text-slate-400 py-8">No hay sucursales registradas</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Usuarios */}
        <TabsContent value="usuarios">
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle>Usuarios del Sistema</CardTitle>
              <Button onClick={() => setShowUserModal(true)} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Invitar Usuario
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Rol</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map(u => (
                      <tr key={u.id}>
                        <td className="px-6 py-4 text-slate-900">{u.user_email}</td>
                        <td className="px-6 py-4">
                          <Badge className="bg-purple-100 text-purple-700 border-0">{u.role}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Badge className={u.active 
                            ? 'bg-emerald-100 text-emerald-700 border-0' 
                            : 'bg-yellow-100 text-yellow-700 border-0'}>
                            {u.active ? 'Activo' : 'Pendiente'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Nueva Sucursal */}
      <Dialog open={showBranchModal} onOpenChange={setShowBranchModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Sucursal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateBranch} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" name="address" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" name="phone" />
            </div>
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowBranchModal(false)}>
                Cancelar
              </Button>
              <Button type="submit">Crear Sucursal</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Invitar Usuario */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar Usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInviteUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user_email">Email *</Label>
              <Input id="user_email" name="user_email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rol *</Label>
              <Select name="role" required>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRANCH_ADMIN">Administrador Sucursal</SelectItem>
                  <SelectItem value="TECHNICIAN">Técnico</SelectItem>
                  <SelectItem value="SALES">Ventas</SelectItem>
                  <SelectItem value="AUDITOR">Auditor</SelectItem>
                  <SelectItem value="CFO">CFO</SelectItem>
                  <SelectItem value="CEO">CEO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch_id">Sucursal (Opcional)</Label>
              <Select name="branch_id">
                <SelectTrigger>
                  <SelectValue placeholder="Sin sucursal" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowUserModal(false)} disabled={inviting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={inviting}>
                {inviting ? 'Invitando...' : 'Invitar Usuario'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}