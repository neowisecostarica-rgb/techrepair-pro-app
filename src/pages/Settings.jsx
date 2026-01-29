import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, MapPin, Users, Plus, Trash2, AlertCircle } from 'lucide-react';
import PageGuard from '../components/guards/PageGuard';
import UserManagementPanel from '../components/settings/UserManagementPanel';
import SenalesNegocio from '../components/admin/SenalesNegocio';
import ConfiguracionPanel from '../components/admin/ConfiguracionPanel';
import ConfiguracionNegocio from '../components/settings/ConfiguracionNegocio';
import { useAuthContext } from '../components/contexts/AuthContext';

export default function Settings() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN']}>
      <SettingsContent />
    </PageGuard>
  );
}

function SettingsContent() {
  const { user, userAccount, effectiveOrgId } = useAuthContext();
  const [showBranchModal, setShowBranchModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: organization, isLoading: isLoadingOrg } = useQuery({
    queryKey: ['organization', effectiveOrgId],
    queryFn: async () => {
      const orgs = await base44.entities.Organization.filter({ id: effectiveOrgId });
      return orgs[0];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', effectiveOrgId],
    queryFn: () => base44.entities.Branch.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
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
      organization_id: effectiveOrgId,
      name: formData.get('name'),
      address: formData.get('address'),
      phone: formData.get('phone'),
      active: true,
    });
  };

  // Fallback explícito para org no encontrada (NO loading infinito)
  if (!userAccount) {
    return <div className="p-8 text-center">Cargando información de usuario...</div>;
  }

  if (!effectiveOrgId) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <Card className="border-0 shadow-xl">
          <CardContent className="p-12 text-center">
            <Building2 className="w-16 h-16 mx-auto mb-6 text-slate-400" />
            <h2 className="text-2xl font-bold text-slate-900 mb-3">No se encontró tu empresa</h2>
            <p className="text-slate-600 mb-6">
              Parece que no tienes una organización configurada. Crea tu empresa para comenzar.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoadingOrg) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <Card className="border-0 shadow-xl">
          <CardContent className="p-12 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-6 text-red-400" />
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Error al cargar configuración</h2>
            <p className="text-slate-600 mb-6">
              No se pudo cargar la información de tu organización. Intenta recargar la página.
            </p>
            <Button
              onClick={() => window.location.reload()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Recargar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // NOTA: Suspensión ahora se maneja globalmente en Layout.js
  // Este bloque ya no es necesario pero se mantiene como fallback defensivo
  // En teoría, si Layout detecta suspensión, Settings nunca se monta

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Configuración</h1>
        <p className="text-slate-500">Gestión de empresa, sucursales y usuarios</p>
      </div>

      <Tabs defaultValue="negocio" className="space-y-6">
        <TabsList className="bg-white border border-slate-200 p-1 grid grid-cols-6">
          <TabsTrigger value="negocio" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
            <Building2 className="w-4 h-4 mr-2" />
            Negocio
          </TabsTrigger>
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
          <TabsTrigger value="config" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
            ⚙️ Config
          </TabsTrigger>
        </TabsList>

        {/* Tab Negocio */}
        <TabsContent value="negocio">
          <ConfiguracionNegocio />
        </TabsContent>

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
            organizationId={effectiveOrgId}
            currentUserId={user?.id}
            branches={branches}
          />
        </TabsContent>

        {/* Tab Señales */}
        <TabsContent value="senales">
          <SenalesNegocio userAccount={userAccount} />
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