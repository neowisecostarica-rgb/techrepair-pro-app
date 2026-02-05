import React, { useState, useEffect, useRef } from 'react';
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
import { useAuthContext } from '../components/contexts/AuthContext';

export default function Saas() {
  return (
    <PageGuard allowedRoles={['SUPER_ADMIN']}>
      <SaasContent />
    </PageGuard>
  );
}

function SaasContent() {
  const [user, setUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showChangePlanModal, setShowChangePlanModal] = useState(false);
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [newPlan, setNewPlan] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedOrg, setImpersonatedOrg] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [justCreatedOrgId, setJustCreatedOrgId] = useState(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  // P0: Guard de idempotencia inmutable
  const isCreatingRef = useRef(false);

  const { user: authUser, isImpersonating: authIsImpersonating, effectiveOrgId } = useAuthContext();

  useEffect(() => {
    if (authUser) {
      setUser(authUser);
      setIsImpersonating(authIsImpersonating);
      
      if (authIsImpersonating && effectiveOrgId) {
        base44.entities.Organization.filter({ id: effectiveOrgId }).then(orgs => {
          if (orgs.length > 0) setImpersonatedOrg(orgs[0]);
        });
      }
    }
  }, [authUser, authIsImpersonating, effectiveOrgId]);

  const { data: organizations = [] } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => base44.entities.Organization.list('-created_date'),
  });

  const { data: allUserAccounts = [] } = useQuery({
    queryKey: ['all-user-accounts'],
    queryFn: () => base44.entities.UserAccount.list(),
    enabled: !authIsImpersonating,
  });

  const { data: allBranches = [] } = useQuery({
    queryKey: ['all-branches'],
    queryFn: () => base44.entities.Branch.list(),
    enabled: !authIsImpersonating,
  });

  const { data: allOrders = [] } = useQuery({
    queryKey: ['all-orders'],
    queryFn: () => base44.entities.OrdenTrabajo.list(),
    enabled: !authIsImpersonating,
  });

  const { data: allGarantias = [] } = useQuery({
    queryKey: ['all-garantias'],
    queryFn: () => base44.entities.Garantia.list(),
    enabled: !authIsImpersonating,
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => base44.entities.SuperAdminAudit.list('-created_date', 10),
    enabled: !authIsImpersonating,
  });

  const { data: partners = [] } = useQuery({
    queryKey: ['partners'],
    queryFn: () => base44.entities.Partner.list(),
  });

  // Auditoría de acciones
  const auditMutation = useMutation({
    mutationFn: (auditData) => base44.entities.SuperAdminAudit.create(auditData),
  });

  const recordAudit = (action, orgId = null, orgName = null, context = null) => {
    if (!user) return;
    
    // Fire-and-forget: no await, no bloqueo
    auditMutation.mutate({
      super_admin_id: user.id,
      super_admin_email: user.email,
      action,
      target_organization_id: orgId,
      target_organization_name: orgName,
      context
    });
    
    // Best-effort: si falla, no afecta la operación principal
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

    try {
      // Actualizar user con impersonation
      await base44.auth.updateMe({
        impersonating_org_id: organization.id,
        impersonating_started_at: new Date().toISOString()
      });

      // Registrar auditoría (non-blocking)
      recordAudit(
        'impersonate_start',
        organization.id,
        organization.name,
        `Impersonación iniciada`
      );

      setIsImpersonating(true);
      setImpersonatedOrg(organization);
      setShowImpersonateModal(false);

      // Redirigir al Dashboard de la organización
      window.location.href = createPageUrl('Dashboard');
    } catch (error) {
      console.error('Error impersonando:', error);
      alert('Error al iniciar impersonación');
    }
  };

  const handleEndImpersonation = async () => {
    if (!user || !impersonatedOrg) return;

    // Registrar fin de impersonación (non-blocking)
    recordAudit(
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

  const handleSuspendOrg = async () => {
    if (!selectedOrg || !suspendReason.trim()) {
      alert('Debes proporcionar un motivo de suspensión');
      return;
    }

    try {
      await toggleOrgStatusMutation.mutateAsync({ 
        orgId: selectedOrg.id, 
        newStatus: 'suspended' 
      });
      
      // Auditoría non-blocking
      recordAudit(
        'suspend_org',
        selectedOrg.id,
        selectedOrg.name,
        `Suspendida. Motivo: ${suspendReason}`
      );

      setShowSuspendModal(false);
      setSuspendReason('');
      setSelectedOrg(null);
    } catch (error) {
      console.error('Error suspendiendo org:', error);
      alert('Error al suspender organización');
    }
  };

  const handleReactivateOrg = async (organization) => {
    if (!confirm(`¿Reactivar organización "${organization.name}"?`)) return;

    try {
      await toggleOrgStatusMutation.mutateAsync({ 
        orgId: organization.id, 
        newStatus: 'active' 
      });
      
      // Auditoría non-blocking
      recordAudit(
        'reactivate_org',
        organization.id,
        organization.name,
        'Organización reactivada'
      );
    } catch (error) {
      console.error('Error reactivando org:', error);
      alert('Error al reactivar organización');
    }
  };

  const handleChangePlan = async () => {
    if (!selectedOrg || !newPlan) {
      alert('Debes seleccionar un plan');
      return;
    }

    if (!confirm(`¿Cambiar plan de "${selectedOrg.name}" a ${newPlan.toUpperCase()}?`)) {
      return;
    }

    try {
      await base44.entities.Organization.update(selectedOrg.id, { plan: newPlan });
      
      // Auditoría non-blocking
      recordAudit(
        'change_plan',
        selectedOrg.id,
        selectedOrg.name,
        `Plan cambiado de ${selectedOrg.plan} a ${newPlan}`
      );

      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setShowChangePlanModal(false);
      setNewPlan('');
      setSelectedOrg(null);
    } catch (error) {
      console.error('Error cambiando plan:', error);
      alert('Error al cambiar plan');
    }
  };

  const getOrgStats = (orgId) => {
    const users = allUserAccounts.filter(u => u.organization_id === orgId && u.active).length;
    const branches = allBranches.filter(b => b.organization_id === orgId).length;

    return { users, branches };
  };

  // Health Checks (integridad de datos)
  const healthChecks = {
    orgsWithoutBranches: organizations.filter(org => 
      org.status === 'active' && !allBranches.some(b => b.organization_id === org.id)
    ).length,
    usersWithoutOrg: allUserAccounts.filter(u => !u.organization_id).length,
    otsWithoutCliente: allOrders.filter(ot => !ot.cliente_id).length,
    expiredActiveWarranties: allGarantias.filter(g => 
      g.estado === 'ACTIVA' && new Date(g.fecha_fin) < new Date()
    ).length,
  };

  const totalHealthIssues = Object.values(healthChecks).reduce((a, b) => a + b, 0);

  const createOrgMutation = useMutation({
    mutationFn: async (data) => {
      // P0: PRE-FLIGHT — Asegurar User existe y obtener user_id ANTES de crear Organization
      let targetUserId = null;
      
      try {
        // Invitar usuario (crea si no existe, no falla si ya existe)
        await base44.users.inviteUser(data.admin_email, 'user');
      } catch (inviteError) {
        console.warn('Invite warning (puede ya existir):', inviteError.message);
      }
      
      // Buscar user_id con reintentos (delay de creación)
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        const allUsers = await base44.entities.User.filter({});
        const targetUser = allUsers.find(u => u.email === data.admin_email);
        if (targetUser) {
          targetUserId = targetUser.id;
          break;
        }
      }
      
      if (!targetUserId) {
        console.warn(`⚠️ user_id no resuelto para ${data.admin_email}, creando UserAccount pendiente`);
      }

      // P0: CREACIÓN ATÓMICA CON ROLLBACK POR COMPENSACIÓN
      let org = null;
      let branch = null;
      let userAccount = null;
      
      try {
        // 1. Organization
        const orgPayload = {
          ...data.organization,
          created_by: user.id,
        };
        org = await base44.entities.Organization.create(orgPayload);
        
        // 2. Branch (obligatorio)
        branch = await base44.entities.Branch.create({
          organization_id: org.id,
          name: 'Sucursal Principal',
          active: true,
        });
        
        const userAccountPayload = {
  user_email: data.admin_email,
  organization_id: org.id,
  branch_id: branch.id,
  role: 'ORG_ADMIN',
  active: Boolean(targetUserId),
};

// ⚠️ SOLO agregar user_id si existe
if (targetUserId) {
  userAccountPayload.user_id = targetUserId;
}

userAccount = await base44.entities.UserAccount.create(userAccountPayload);


        // 4. Auditar (non-blocking)
        recordAudit('create_org', org.id, data.organization.name, 'Organización creada');
        
        return org;
      } catch (error) {
        // ROLLBACK POR COMPENSACIÓN
        console.error('Error en creación de tenant, ejecutando rollback:', error);
        
        if (userAccount) {
          try {
            await base44.entities.UserAccount.delete(userAccount.id);
          } catch (e) {
            console.error('Rollback UserAccount falló:', e);
          }
        }
        
        if (branch) {
          try {
            await base44.entities.Branch.delete(branch.id);
          } catch (e) {
            console.error('Rollback Branch falló:', e);
          }
        }
        
        if (org) {
          try {
            await base44.entities.Organization.delete(org.id);
          } catch (e) {
            console.error('Rollback Organization falló:', e);
          }
        }
        
        throw new Error(`Creación de tenant fallida: ${error.message}. Se ejecutó rollback.`);
      }
    },
    onSuccess: (newOrg) => {
      // P0: Resetear guard de idempotencia
      isCreatingRef.current = false;
      
      // P0: Auto-refresh de la lista de tenants
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['all-user-accounts'] });
      
      // P0: Highlight del tenant recién creado
      setJustCreatedOrgId(newOrg.id);
      setTimeout(() => setJustCreatedOrgId(null), 5000);
      
      // P0: Feedback visual
      alert(`✅ Tenant "${newOrg.name}" creado exitosamente`);
      
      setShowModal(false);
      setCreating(false);
    },
    onError: (error) => {
      // P0: Resetear guard de idempotencia
      isCreatingRef.current = false;
      
      console.error('Error creando tenant:', error);
      alert(`❌ Error al crear tenant: ${error.message || 'Error desconocido'}`);
      setCreating(false);
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // P0: Guard de idempotencia INMUTABLE - protección REAL contra duplicados
    if (isCreatingRef.current) {
      console.warn('⛔ Guard activo: creación ya en progreso, bloqueando ejecución duplicada');
      return;
    }
    
    // Activar guard ANTES de cualquier otra lógica
    isCreatingRef.current = true;
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

  const filteredOrgs = organizations.filter(org => {
    const matchesSearch = org.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || org.status === statusFilter;
    const matchesPlan = planFilter === 'all' || org.plan === planFilter;
    return matchesSearch && matchesStatus && matchesPlan;
  });

  // Métricas por plan
  const planDistribution = {
    basic: organizations.filter(o => o.plan === 'basic').length,
    pro: organizations.filter(o => o.plan === 'pro').length,
    premium: organizations.filter(o => o.plan === 'premium').length,
  };

  const totalActiveUsers = allUserAccounts.filter(u => {
    const org = organizations.find(o => o.id === u.organization_id);
    return u.active && org?.status === 'active';
  }).length;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-slate-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user.is_super_admin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-red-50 to-orange-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Acceso Denegado</h1>
          <p className="text-slate-600 mb-6">Solo Super Admins pueden acceder a este panel.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {isImpersonating && impersonatedOrg && (
        <ImpersonationBanner 
          organizationName={impersonatedOrg.name}
          onEndImpersonation={handleEndImpersonation}
        />
      )}
      
      <div className={`min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-gray-100 p-8 ${isImpersonating ? 'pt-24' : ''}`}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Platform Administration</h1>
            <p className="text-slate-600">Multi-tenant SaaS Management & System Health</p>
            {user && (
              <div className="flex items-center gap-2 mt-3">
                <Badge className="bg-slate-800 text-white border-0">
                  🔒 SUPER_ADMIN
                </Badge>
                <span className="text-sm text-slate-600 font-mono">{user.email}</span>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => base44.auth.logout()}
              variant="outline"
              className="border-slate-300"
            >
              Cerrar Sesión
            </Button>
            <Button
              onClick={() => setShowModal(true)}
              className="bg-slate-800 hover:bg-slate-900"
              disabled={isImpersonating}
            >
              <Plus className="w-5 h-5 mr-2" />
              Create Organization
            </Button>
          </div>
        </div>

      {/* Platform Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-50 to-blue-100">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <p className="text-xs font-semibold text-slate-600">Active Orgs</p>
            </div>
            <p className="text-3xl font-bold text-slate-900">
              {organizations.filter(o => o.status === 'active').length}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-red-50 to-red-100">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-xs font-semibold text-slate-600">Suspended</p>
            </div>
            <p className="text-3xl font-bold text-slate-900">
              {organizations.filter(o => o.status === 'suspended').length}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-50 to-purple-100">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-5 h-5 text-purple-600" />
              <p className="text-xs font-semibold text-slate-600">Plan Distribution</p>
            </div>
            <div className="text-xs space-y-1 mt-2">
              <p className="text-slate-700">Basic: <span className="font-bold">{planDistribution.basic}</span></p>
              <p className="text-slate-700">Pro: <span className="font-bold">{planDistribution.pro}</span></p>
              <p className="text-slate-700">Premium: <span className="font-bold">{planDistribution.premium}</span></p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-green-50 to-green-100">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-5 h-5 text-green-600" />
              <p className="text-xs font-semibold text-slate-600">Total Users</p>
            </div>
            <p className="text-3xl font-bold text-slate-900">{totalActiveUsers}</p>
            <p className="text-xs text-slate-600 mt-1">In active orgs</p>
          </CardContent>
        </Card>

        <Card className={`border-0 shadow-xl ${totalHealthIssues > 0 ? 'bg-gradient-to-br from-amber-50 to-amber-100' : 'bg-gradient-to-br from-slate-50 to-slate-100'}`}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className={`w-5 h-5 ${totalHealthIssues > 0 ? 'text-amber-600' : 'text-slate-600'}`} />
              <p className="text-xs font-semibold text-slate-600">Health Issues</p>
            </div>
            <p className={`text-3xl font-bold ${totalHealthIssues > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {totalHealthIssues}
            </p>
            <p className="text-xs text-slate-600 mt-1">Data integrity</p>
          </CardContent>
        </Card>
      </div>

      {/* System Health */}
      {totalHealthIssues > 0 && (
        <Card className="border-0 shadow-xl border-l-4 border-l-amber-500">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              System Health — Data Integrity Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {healthChecks.orgsWithoutBranches > 0 && (
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                  <span className="text-sm text-slate-700">Organizations without branches</span>
                  <Badge className="bg-amber-200 text-amber-800 border-0">{healthChecks.orgsWithoutBranches}</Badge>
                </div>
              )}
              {healthChecks.usersWithoutOrg > 0 && (
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                  <span className="text-sm text-slate-700">UserAccounts without organization_id</span>
                  <Badge className="bg-amber-200 text-amber-800 border-0">{healthChecks.usersWithoutOrg}</Badge>
                </div>
              )}
              {healthChecks.otsWithoutCliente > 0 && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm text-slate-700">Work Orders without cliente_id</span>
                  <Badge className="bg-slate-200 text-slate-800 border-0">{healthChecks.otsWithoutCliente}</Badge>
                </div>
              )}
              {healthChecks.expiredActiveWarranties > 0 && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm text-slate-700">Expired warranties still active</span>
                  <Badge className="bg-slate-200 text-slate-800 border-0">{healthChecks.expiredActiveWarranties}</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit Log */}
      {auditLogs.length > 0 && (
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg">Platform Audit Log (Last 10 Actions)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Date/Time</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Admin</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Action</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Target Org</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="border-t hover:bg-slate-50">
                      <td className="p-3 text-xs text-slate-600">
                        {new Date(log.created_date).toLocaleString('es-ES', { 
                          dateStyle: 'short', 
                          timeStyle: 'short' 
                        })}
                      </td>
                      <td className="p-3 text-xs font-mono text-slate-700">{log.super_admin_email}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs">{log.action}</Badge>
                      </td>
                      <td className="p-3 text-xs text-slate-700">{log.target_organization_name || 'N/A'}</td>
                      <td className="p-3 text-xs text-slate-600">{log.context || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters & Search */}
      <Card className="border-0 shadow-xl">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <Input
                placeholder="Search organization..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-md"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-md"
            >
              <option value="all">All Plans</option>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
              <option value="premium">Premium</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Tenant Management Table */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg">Tenant Management ({filteredOrgs.length} organizations)</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredOrgs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Name</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Plan</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Status</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Created</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Users</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Branches</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrgs.map((org) => {
                    const stats = getOrgStats(org.id);
                    const isNewlyCreated = justCreatedOrgId === org.id;
                    return (
                      <tr 
                        key={org.id} 
                        className={`border-t hover:bg-slate-50 transition-all duration-500 ${
                          isNewlyCreated ? 'bg-green-100 animate-pulse' : ''
                        }`}
                      >
                        <td className="p-3">
                          <p className="font-semibold text-slate-900">{org.name}</p>
                          {org.legal_name && <p className="text-xs text-slate-500">{org.legal_name}</p>}
                        </td>
                        <td className="p-3">
                          <Badge className="bg-indigo-100 text-indigo-700 border-0 uppercase text-xs">
                            {org.plan}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge className={org.status === 'active' 
                            ? 'bg-green-100 text-green-700 border-0' 
                            : 'bg-red-100 text-red-700 border-0'}>
                            {org.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-xs text-slate-600">
                          {new Date(org.created_date).toLocaleDateString('es-ES')}
                        </td>
                        <td className="p-3 text-sm text-slate-700">{stats.users}</td>
                        <td className="p-3 text-sm text-slate-700">{stats.branches}</td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedOrg(org);
                                setNewPlan(org.plan);
                                setShowChangePlanModal(true);
                              }}
                              disabled={isImpersonating}
                              className="text-xs"
                            >
                              Change Plan
                            </Button>
                            {org.status === 'active' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedOrg(org);
                                  setShowSuspendModal(true);
                                }}
                                disabled={isImpersonating}
                                className="text-xs border-red-300 text-red-600 hover:bg-red-50"
                              >
                                Suspend
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReactivateOrg(org)}
                                disabled={isImpersonating}
                                className="text-xs border-green-300 text-green-600 hover:bg-green-50"
                              >
                                Reactivate
                              </Button>
                            )}
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-xs"
                              onClick={() => {
                                setSelectedOrg(org);
                                setShowImpersonateModal(true);
                              }}
                              disabled={isImpersonating}
                            >
                              Impersonate
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No organizations found</p>
            </div>
          )}
        </CardContent>
      </Card>



      {/* Modal Suspend Organization */}
      <Dialog open={showSuspendModal} onOpenChange={setShowSuspendModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-red-600">Suspend Organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">
                <strong>Warning:</strong> Suspending this organization will immediately block access for all users.
              </p>
            </div>
            {selectedOrg && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600">Organization:</p>
                <p className="font-semibold text-slate-900">{selectedOrg.name}</p>
              </div>
            )}
            <div>
              <Label htmlFor="suspend-reason">Suspension Reason (required)</Label>
              <Input
                id="suspend-reason"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="e.g., Payment overdue, Terms violation..."
                className="mt-1"
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowSuspendModal(false);
                  setSuspendReason('');
                  setSelectedOrg(null);
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSuspendOrg}
                className="bg-red-600 hover:bg-red-700"
                disabled={!suspendReason.trim()}
              >
                Confirm Suspension
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Change Plan */}
      <Dialog open={showChangePlanModal} onOpenChange={setShowChangePlanModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Change Organization Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {selectedOrg && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600">Organization:</p>
                <p className="font-semibold text-slate-900">{selectedOrg.name}</p>
                <p className="text-xs text-slate-600 mt-1">Current Plan: <span className="font-semibold">{selectedOrg.plan.toUpperCase()}</span></p>
              </div>
            )}
            <div>
              <Label htmlFor="new-plan">New Plan</Label>
              <select
                id="new-plan"
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-md"
              >
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="premium">Premium</option>
              </select>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowChangePlanModal(false);
                  setNewPlan('');
                  setSelectedOrg(null);
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleChangePlan}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                Change Plan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Impersonate */}
      <Dialog open={showImpersonateModal} onOpenChange={setShowImpersonateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-blue-600">Impersonate Tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Important:</strong> You are about to access this tenant as ORG_ADMIN. All your actions will be audited and logged.
              </p>
            </div>
            {selectedOrg && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600">Target Organization:</p>
                <p className="font-semibold text-slate-900">{selectedOrg.name}</p>
              </div>
            )}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800">
                • Impersonation will expire automatically after 2 hours<br/>
                • A red banner will be visible at all times<br/>
                • Audit log will record start and end of impersonation
              </p>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowImpersonateModal(false);
                  setSelectedOrg(null);
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => handleImpersonate(selectedOrg)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Start Impersonation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Create Organization */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Create New Organization</DialogTitle>
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
                <select
                  id="plan"
                  name="plan"
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                >
                  <option value="">Seleccionar plan</option>
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="premium">Premium</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="partner_id">Partner (Opcional)</Label>
                <select
                  id="partner_id"
                  name="partner_id"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                >
                  <option value="">Sin partner</option>
                  {partners.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="admin_email">Administrator Email *</Label>
                <Input id="admin_email" name="admin_email" type="email" required />
                <p className="text-xs text-slate-500">This user will be invited and assigned as ORG_ADMIN</p>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" className="bg-slate-800 hover:bg-slate-900" disabled={creating}>
                {creating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Creando tenant...
                  </>
                ) : (
                  'Create Organization'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      </div>
      </div>
    </>
  );
}