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
import PageGuard from '../components/guards/PageGuard';
import UserManagementPanel from '../components/settings/UserManagementPanel';
import SenalesNegocio from '../components/admin/SenalesNegocio';
import AprobacionesPanel from '../components/admin/AprobacionesPanel';
import ConfiguracionPanel from '../components/admin/ConfiguracionPanel';

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
        <TabsList className="bg-white border border-slate-200 p-1 grid grid-cols-6">
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
          <TabsTrigger value="senales" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
            🔔 Señales
          </TabsTrigger>
          <TabsTrigger value="aprobaciones" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
            ✅ Aprobaciones
          </TabsTrigger>
          <TabsTrigger value="config" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
            ⚙️ Config
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
          <UserManagementPanel
            organizationId={userAccount?.organization_id}
            currentUserId={user?.id}
            branches={branches}
          />
        </TabsContent>

        {/* Tab Señales */}
        <TabsContent value="senales">
          <SenalesNegocio userAccount={userAccount} />
        </TabsContent>

        {/* Tab Aprobaciones */}
        <TabsContent value="aprobaciones">
          <AprobacionesPanel userAccount={userAccount} user={user} />
        </TabsContent>

        {/* Tab Configuración */}
        <TabsContent value="config">
          <ConfiguracionPanel />
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


    </div>
  );
}