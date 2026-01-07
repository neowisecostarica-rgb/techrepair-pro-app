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
import { Building2, Plus, Search, ShieldAlert, AlertCircle } from 'lucide-react';
import OrganizationCard from '../components/superadmin/OrganizationCard';
import ImpersonationBanner from '../components/superadmin/ImpersonationBanner';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import PageGuard from '../components/guards/PageGuard';

export default function Saas() {
  return (
    <PageGuard allowedRoles={['SUPER_ADMIN']}>
      <SaasContent />
    </PageGuard>
  );
}

function SaasContent() {
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();

  const { data: organizations = [] } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => base44.entities.Organization.list('-created_date'),
  });

  const { data: partners = [] } = useQuery({
    queryKey: ['partners'],
    queryFn: () => base44.entities.Partner.list(),
  });

  // Auditoría de acciones
  const auditMutation = useMutation({
    mutationFn: (auditData) => base44.entities.SuperAdminAudit.create(auditData),
  });

  const recordAudit = async (action, orgId = null, orgName = null, context = null) => {
    if (!user) return;
    await auditMutation.mutateAsync({
      super_admin_id: user.id,
      super_admin_email: user.email,
      action,
      target_organization_id: orgId,
      target_organization_name: orgName,
      context
    });
  };

  const toggleOrgStatusMutation = useMutation({
    mutationFn: async ({ orgId, newStatus }) => {
      return await base44.entities.Organization.update(orgId, { status: newStatus });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      const org = organizations.find(o => o.id === variables.orgId);
      recordAudit(
        variables.newStatus === 'active' ? 'activate_org' : 'deactivate_org',
        variables.orgId,
        org?.name,
        `Cambio de estado a ${variables.newStatus}`
      );
    },
  });

  const handleImpersonate = async (organization) => {
    if (!user) return;

    // Actualizar user con impersonation
    await base44.auth.updateMe({
      impersonating_org_id: organization.id,
      impersonating_started_at: new Date().toISOString()
    });

    // Registrar auditoría
    await recordAudit(
      'impersonate_start',
      organization.id,
      organization.name,
      `Impersonando como Admin`
    );

    setIsImpersonating(true);
    setImpersonatedOrg(organization);

    // Redirigir al Dashboard de la organización
    window.location.reload(); // Recargar para actualizar contexto
  };

  const handleEndImpersonation = async () => {
    if (!user || !impersonatedOrg) return;

    // Registrar fin de impersonación
    await recordAudit(
      'impersonate_end',
      impersonatedOrg.id,
      impersonatedOrg.name,
      `Fin de impersonación`
    );

    // Limpiar impersonation
    await base44.auth.updateMe({
      impersonating_org_id: null,
      impersonating_started_at: null
    });

    setIsImpersonating(false);
    setImpersonatedOrg(null);

    // Volver a SaaS panel
    window.location.reload();
  };

  const handleToggleStatus = async (organization) => {
    const newStatus = organization.status === 'active' ? 'suspended' : 'active';
    const confirmMsg = newStatus === 'suspended'
      ? `¿Suspender organización "${organization.name}"?\n\nLos usuarios no podrán acceder.`
      : `¿Reactivar organización "${organization.name}"?`;

    if (confirm(confirmMsg)) {
      toggleOrgStatusMutation.mutate({ orgId: organization.id, newStatus });
    }
  };

  const getOrgStats = (orgId) => {
    const users = allUserAccounts.filter(u => u.organization_id === orgId && u.active).length;
    const activeOrders = allOrders.filter(o => 
      o.organization_id === orgId && 
      !['ENTREGADA', 'CANCELADA'].includes(o.estado)
    ).length;

    return { users, activeOrders };
  };

  const createOrgMutation = useMutation({
    mutationFn: async (data) => {
      const org = await base44.entities.Organization.create(data.organization);
      
      // Invitar ORG_ADMIN
      await base44.users.inviteUser(data.admin_email, 'user');
      
      // Crear UserAccount para ORG_ADMIN
      await base44.entities.UserAccount.create({
        user_email: data.admin_email,
        organization_id: org.id,
        role: 'ORG_ADMIN',
        active: true,
      });
      
      return org;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setShowModal(false);
      setCreating(false);
    },
    onError: () => {
      setCreating(false);
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCreating(true);
    const formData = new FormData(e.target);
    
    createOrgMutation.mutate({
      organization: {
        name: formData.get('name'),
        legal_name: formData.get('legal_name'),
        country: formData.get('country'),
        currency: formData.get('currency'),
        plan: formData.get('plan'),
        status: 'active',
        partner_id: formData.get('partner_id') || undefined,
      },
      admin_email: formData.get('admin_email'),
    });
  };

  const filteredOrgs = organizations.filter(org => 
    org.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Panel SaaS</h1>
          <p className="text-slate-500">Gestión de organizaciones y configuración</p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5 mr-2" />
          Crear Empresa
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Total Empresas</p>
                <h3 className="text-3xl font-bold text-slate-900">{organizations.length}</h3>
              </div>
              <Building2 className="w-10 h-10 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Activas</p>
                <h3 className="text-3xl font-bold text-emerald-600">
                  {organizations.filter(o => o.status === 'active').length}
                </h3>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Suspendidas</p>
                <h3 className="text-3xl font-bold text-red-600">
                  {organizations.filter(o => o.status === 'suspended').length}
                </h3>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              placeholder="Buscar empresa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Organizations List */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg font-semibold">Empresas Registradas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Empresa</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">País</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Plan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrgs.map(org => (
                  <tr key={org.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-slate-900">{org.name}</p>
                        {org.legal_name && <p className="text-sm text-slate-500">{org.legal_name}</p>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{org.country}</td>
                    <td className="px-6 py-4">
                      <Badge className="bg-blue-100 text-blue-700 border-0">
                        {org.plan}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={org.status === 'active' 
                        ? 'bg-emerald-100 text-emerald-700 border-0' 
                        : 'bg-red-100 text-red-700 border-0'}>
                        {org.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal Crear Empresa */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Crear Nueva Empresa</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="name">Nombre Comercial *</Label>
                <Input id="name" name="name" required />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="legal_name">Razón Social</Label>
                <Input id="legal_name" name="legal_name" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">País *</Label>
                <Input id="country" name="country" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Moneda *</Label>
                <Input id="currency" name="currency" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="plan">Plan *</Label>
                <Select name="plan" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="partner_id">Partner (Opcional)</Label>
                <Select name="partner_id">
                  <SelectTrigger>
                    <SelectValue placeholder="Sin partner" />
                  </SelectTrigger>
                  <SelectContent>
                    {partners.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="admin_email">Email del Administrador *</Label>
                <Input id="admin_email" name="admin_email" type="email" required />
                <p className="text-xs text-slate-500">Se invitará a este usuario como ORG_ADMIN</p>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={creating}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-emerald-500 to-blue-500" disabled={creating}>
                {creating ? 'Creando...' : 'Crear Empresa'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}