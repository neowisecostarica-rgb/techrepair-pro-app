import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, Plus, Search, ShieldAlert, AlertCircle } from 'lucide-react';
import PlatformActivityMetrics from '@/components/superadmin/PlatformActivityMetrics';
import { useNavigate } from 'react-router-dom';
import PageGuard from '../components/guards/PageGuard';
import { useAuthContext } from '../components/contexts/AuthContext';
import {
  adminCreateIdentityOrganization,
  adminUpdateIdentityOrganization,
  adminSetIdentityEntitlement,
  getIdentityAdminOverview,
} from '@/api/identity';

// Legacy plan catalog: compatibility/provisioning only. Not TRP commercial pricing authority.
const LEGACY_PLAN_CATALOG = [
  {
    code: 'basic',
    name: 'Basic',
    description: 'Para negocios pequeños (1 sucursal, funcionalidades básicas)',
    color: 'blue',
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'Para negocios en crecimiento (multi-sucursal, reportes avanzados)',
    color: 'purple',
    recommended: true,
  },
  {
    code: 'premium',
    name: 'Premium',
    description: 'Para empresas establecidas (usuarios ilimitados, soporte prioritario)',
    color: 'emerald',
  },
];

// P1: COUNTRY-CURRENCY MAP (ISO codes normalizados)
const COUNTRY_CURRENCY_MAP = [
  { code: 'CR', name: 'Costa Rica', currency: 'CRC', flag: '🇨🇷' },
  { code: 'US', name: 'Estados Unidos', currency: 'USD', flag: '🇺🇸' },
  { code: 'PA', name: 'Panamá', currency: 'USD', flag: '🇵🇦' },
  { code: 'MX', name: 'México', currency: 'MXN', flag: '🇲🇽' },
  { code: 'GT', name: 'Guatemala', currency: 'GTQ', flag: '🇬🇹' },
  { code: 'SV', name: 'El Salvador', currency: 'USD', flag: '🇸🇻' },
  { code: 'HN', name: 'Honduras', currency: 'HNL', flag: '🇭🇳' },
  { code: 'NI', name: 'Nicaragua', currency: 'NIO', flag: '🇳🇮' },
];

// P1: CURRENCY LABELS (para display)
const CURRENCY_LABELS = {
  CRC: 'Colones (₡)',
  USD: 'Dólares ($)',
  MXN: 'Pesos (MX$)',
  GTQ: 'Quetzales (Q)',
  HNL: 'Lempiras (L)',
  NIO: 'Córdobas (C$)',
};

// P1: NORMALIZADORES DEFENSIVOS (soportar legacy sin romper)
const normalizeCountry = (input) => {
  if (!input) return input;
  // Si ya es ISO code
  if (COUNTRY_CURRENCY_MAP.some(c => c.code === input)) return input;
  // Mapeo legacy texto libre
  const legacyMap = {
    'Costa Rica': 'CR',
    'Estados Unidos': 'US',
    'Panamá': 'PA',
    'Panama': 'PA',
    'México': 'MX',
    'Mexico': 'MX',
    'Guatemala': 'GT',
    'El Salvador': 'SV',
    'Honduras': 'HN',
    'Nicaragua': 'NI',
  };
  return legacyMap[input] || input;
};

const normalizeCurrency = (input) => {
  if (!input) return input;
  // Si ya es ISO code
  if (['CRC', 'USD', 'MXN', 'GTQ', 'HNL', 'NIO'].includes(input)) return input;
  // Mapeo legacy texto libre
  const legacyMap = {
    'Colones': 'CRC',
    'colones': 'CRC',
    'Dólares': 'USD',
    'Dolares': 'USD',
    'dólares': 'USD',
    'dolares': 'USD',
    'Pesos': 'MXN',
    'pesos': 'MXN',
    'Quetzales': 'GTQ',
    'quetzales': 'GTQ',
    'Lempiras': 'HNL',
    'lempiras': 'HNL',
    'Córdobas': 'NIO',
    'córdobas': 'NIO',
  };
  return legacyMap[input] || input;
};

export default function Saas() {
  return (
    <PageGuard allowedRoles={['SUPER_ADMIN']}>
      <SaasContent />
    </PageGuard>
  );
}

function SaasContent() {
  const [consoleSection, setConsoleSection] = useState(() => typeof window !== 'undefined' ? (window.location.hash.replace('#', '') || 'overview') : 'overview');
  const [user, setUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showChangePlanModal, setShowChangePlanModal] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [newPlan, setNewPlan] = useState('');
  const [newPackage, setNewPackage] = useState('core');
  const [newBillingInterval, setNewBillingInterval] = useState('monthly');
  const [searchTerm, setSearchTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [justCreatedOrgId, setJustCreatedOrgId] = useState(null);

  // P1: Estado para selects del modal
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('');

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // P0: Guard de idempotencia inmutable
  const isCreatingRef = useRef(false);

  const { user: authUser, isImpersonating: authIsImpersonating } = useAuthContext();

  useEffect(() => {
    if (authUser) {
      setUser(authUser);
    }
  }, [authUser]);

  useEffect(() => {
    const syncSection = () => setConsoleSection(window.location.hash.replace('#', '') || 'overview');
    window.addEventListener('hashchange', syncSection);
    return () => window.removeEventListener('hashchange', syncSection);
  }, []);

  const showSection = (section) => consoleSection === section || consoleSection === 'overview';

  const { data: adminOverview = {} } = useQuery({
    queryKey: ['identity', 'admin-overview'],
    queryFn: getIdentityAdminOverview,
    enabled: !authIsImpersonating,
  });
  const organizations = adminOverview.organizations || [];
  const allUserAccounts = adminOverview.accounts || [];
  const auditLogs = adminOverview.auditLogs || [];
  const entitlementsByOrg = adminOverview.entitlements || {};

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

  const { data: partners = [] } = useQuery({
    queryKey: ['partners'],
    queryFn: () => base44.entities.Partner.list(),
  });

  const toggleOrgStatusMutation = useMutation({
    mutationFn: async ({ orgId, newStatus }) => {
      return await adminUpdateIdentityOrganization(orgId, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['identity', 'admin-overview'] });
    },
  });

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

    } catch (error) {
      console.error('Error reactivando org:', error);
      alert('Error al reactivar organización');
    }
  };

  const handleChangePlan = async () => {
    if (!selectedOrg || !newPackage) {
      alert('Debes seleccionar un paquete comercial');
      return;
    }
    if (!confirm(`¿Aplicar paquete ${newPackage.toUpperCase()} a "${selectedOrg.name}"? El plan legacy no se modificará.`)) return;
    try {
      await adminSetIdentityEntitlement(selectedOrg.id, {
        package_id: newPackage,
        billing_status: 'active',
        billing_interval: newBillingInterval,
        source: 'admin',
      });
      queryClient.invalidateQueries({ queryKey: ['identity', 'admin-overview'] });
      setShowChangePlanModal(false);
      setNewPackage('core');
      setNewBillingInterval('monthly');
      setSelectedOrg(null);
    } catch (error) {
      console.error('Error cambiando entitlement:', error);
      alert('Error al cambiar paquete comercial');
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
    mutationFn: (data) => adminCreateIdentityOrganization(data.organization, data.admin_email),
    onSuccess: (result) => {
      const newOrg = result.organization;
      // P0: Resetear guard de idempotencia
      isCreatingRef.current = false;

      // P0: Auto-refresh de la lista de tenants
      queryClient.invalidateQueries({ queryKey: ['identity', 'admin-overview'] });

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
        country: selectedCountry, // P1: ISO code
        currency: selectedCurrency, // P1: ISO code
        plan: selectedPlan, // P1: código de plan
        status: 'active',
        partner_id: formData.get('partner_id') || undefined,
      },
      admin_email: formData.get('admin_email'),
    });
  };

  // P1: Handler de cambio de país (autoselección de moneda)
  const handleCountryChange = (countryCode) => {
    setSelectedCountry(countryCode);
    const country = COUNTRY_CURRENCY_MAP.find(c => c.code === countryCode);
    if (country) {
      setSelectedCurrency(country.currency);
    }
  };

  const filteredOrgs = organizations.filter(org => {
    const matchesSearch = org.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || org.status === statusFilter;
    const effectivePackage = entitlementsByOrg[org.id]?.package_id || 'core';
    const matchesPlan = planFilter === 'all' || effectivePackage === planFilter;
    return matchesSearch && matchesStatus && matchesPlan;
  });

  // Commercial package distribution. Legacy Organization.plan is compatibility only.
  const planDistribution = {
    core: organizations.filter(o => (entitlementsByOrg[o.id]?.package_id || 'core') === 'core').length,
    advanced: organizations.filter(o => entitlementsByOrg[o.id]?.package_id === 'advanced').length,
    enterprise: organizations.filter(o => entitlementsByOrg[o.id]?.package_id === 'enterprise').length,
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
      <div className="min-h-screen bg-[#f6f8fb] flex items-center justify-center p-6">
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
      <div id="overview" className="min-h-screen bg-[#f6f8fb] p-8 scroll-mt-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 mb-1">TRP Platform Console</h1>
            <p className="text-slate-600">Administración multi-tenant, comercial y salud de plataforma</p>
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
              disabled={authIsImpersonating}
            >
              <Plus className="w-5 h-5 mr-2" />
              Create Organization
            </Button>
          </div>
        </div>

      <div id="commercial" className="scroll-mt-6" />
      {consoleSection === 'overview' && <Card className="border border-slate-200 shadow-sm bg-white">
        <CardContent className="p-4 flex flex-wrap gap-2 items-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mr-2">Platform Console</span>
          {[
            ['organizations', 'Organizaciones'],
            ['commercial', 'Commercial & Plans'],
            ['health', 'Platform Health'],
            ['audit', 'Audit'],
            ['pilot', 'Pilot Control'],
          ].map(([target, label]) => (
            <Button key={target} variant="outline" size="sm" onClick={() => { window.location.hash = target; document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              {label}
            </Button>
          ))}
        </CardContent>
      </Card>}

      {/* Platform Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border border-slate-200 shadow-sm bg-white">
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

        <Card className="border border-slate-200 shadow-sm bg-white">
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

        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-5 h-5 text-purple-600" />
              <p className="text-xs font-semibold text-slate-600">Commercial Packages</p>
            </div>
            <div className="text-xs space-y-1 mt-2">
              <p className="text-slate-700">Core: <span className="font-bold">{planDistribution.core}</span></p>
              <p className="text-slate-700">Advanced: <span className="font-bold">{planDistribution.advanced}</span></p>
              <p className="text-slate-700">Enterprise: <span className="font-bold">{planDistribution.enterprise}</span></p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-5 h-5 text-green-600" />
              <p className="text-xs font-semibold text-slate-600">Total Users</p>
            </div>
            <p className="text-3xl font-bold text-slate-900">{totalActiveUsers}</p>
            <p className="text-xs text-slate-600 mt-1">In active orgs</p>
          </CardContent>
        </Card>

        <Card className={`border border-slate-200 shadow-sm ${totalHealthIssues > 0 ? 'bg-amber-50' : 'bg-white'}`}>
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

      {/* Global Sales Metrics (Super Admin) */}
      {!authIsImpersonating && consoleSection === 'overview' && (
        <PlatformActivityMetrics organizations={organizations} />
      )}

      <div id="health" className="scroll-mt-6" />
      {/* System Health */}
      {showSection('health') && totalHealthIssues > 0 && (
        <Card className="border border-slate-200 shadow-sm border-l-4 border-l-amber-500">
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

      <div id="pilot" className="scroll-mt-6" />
      <div id="audit" className="scroll-mt-6" />
      {/* Audit Log */}
      {showSection('audit') && auditLogs.length > 0 && (
        <Card className="border border-slate-200 shadow-sm">
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

      <div id="organizations" className="scroll-mt-6" />
      {showSection('organizations') && <>
      {/* Filters & Search */}
      <Card className="border border-slate-200 shadow-sm">
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
              <option value="all">All Packages</option>
              <option value="core">Core</option>
              <option value="advanced">Advanced</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Tenant Management Table */}
      <Card className="border border-slate-200 shadow-sm">
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
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Package</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Commercial</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Access</th>
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

                    // P1: Datos derivados para mejorar display
                    const normalizedCurrency = normalizeCurrency(org.currency);
                    const entitlement = entitlementsByOrg[org.id];
                    const packageName = entitlement?.package_id || 'core';
                    const entitlementSource = entitlement?.source || 'legacy_fallback';
                    const billingStatus = entitlement?.billing_status || 'active';
                    const billingInterval = entitlement?.billing_interval || 'monthly';
                    const partner = partners.find(p => p.id === org.partner_id);

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
                          {partner && (
                            <p className="text-xs text-purple-600 mt-1">🤝 Partner: {partner.name}</p>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge className="bg-teal-50 text-teal-800 border border-teal-200 uppercase text-xs">
                            {packageName}
                          </Badge>
                          <p className="text-xs text-slate-500 mt-1">{entitlementSource === 'legacy_fallback' ? `Legacy ${org.plan || 'basic'} → compatibility` : `Authority: ${entitlementSource}`}</p>
                        </td>
                        <td className="p-3">
                          <Badge className={billingStatus === 'active' ? 'bg-teal-50 text-teal-800 border border-teal-200' : billingStatus === 'trial' ? 'bg-slate-100 text-slate-700 border border-slate-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}>
                            {billingStatus}
                          </Badge>
                          <p className="text-xs text-slate-500 mt-1">{billingInterval}</p>
                        </td>
                        <td className="p-3">
                          <Badge className={org.status === 'active'
                            ? 'bg-teal-50 text-teal-800 border border-teal-200'
                            : 'bg-red-50 text-red-700 border border-red-200'}>
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
                                setNewPackage(entitlementsByOrg[org.id]?.package_id || 'core');
                                setNewBillingInterval(entitlementsByOrg[org.id]?.billing_interval || 'monthly');
                                setShowChangePlanModal(true);
                              }}
                              disabled={authIsImpersonating}
                              className="text-xs"
                            >
                              Commercial Package
                            </Button>
                            {org.status === 'active' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedOrg(org);
                                  setShowSuspendModal(true);
                                }}
                                disabled={authIsImpersonating}
                                className="text-xs border-red-300 text-red-600 hover:bg-red-50"
                              >
                                Suspend
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReactivateOrg(org)}
                                disabled={authIsImpersonating}
                                className="text-xs border-green-300 text-green-600 hover:bg-green-50"
                              >
                                Reactivate
                              </Button>
                            )}
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



      </>}

      {consoleSection === 'pilot' && (
        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardHeader><CardTitle className="text-lg">Pilot Control</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">Superficie reservada para control de pilotos. La activación y las mutaciones continúan gobernadas por las protecciones backend existentes; no se exponen controles ficticios.</p>
          </CardContent>
        </Card>
      )}

      {consoleSection === 'commercial' && (
        <div className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Commercial & Plans</h2>
            <p className="text-sm text-slate-600 mt-1">Packaging oficial de TRP. La autoridad contractual por tenant continúa en EntitlementPolicy.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { name: 'Core', monthly: '$79', annual: '$790', note: 'Workflow operativo esencial completo · sin caps de órdenes' },
              { name: 'Advanced', monthly: '$149', annual: '$1,490', note: 'Más profundidad, escala, analytics, calidad y automatización' },
              { name: 'Enterprise', monthly: 'Custom', annual: 'Contrato anual', note: 'Gobernanza, escala e integraciones contratadas y disponibles' },
            ].map(plan => (
              <Card key={plan.name} className="border border-slate-200 shadow-sm bg-white">
                <CardHeader><CardTitle className="text-lg">TRP {plan.name}</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2 mb-2"><span className="text-3xl font-semibold text-slate-950">{plan.monthly}</span>{plan.name !== 'Enterprise' && <span className="text-sm text-slate-500 mb-1">/mes</span>}</div>
                  <p className="text-sm font-medium text-teal-800 mb-3">{plan.annual}{plan.name !== 'Enterprise' && ' / año'}</p>
                  <p className="text-sm text-slate-600">{plan.note}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border border-slate-200 shadow-sm bg-white">
            <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="font-medium text-slate-900">Unidad comercial: organización / tenant</p>
                <p className="text-sm text-slate-600 mt-1">Usuarios no son el medidor primario. Escala por sucursales, activos y alcance Enterprise se resolverá mediante entitlements configurables.</p>
              </div>
              <Button variant="outline" onClick={() => { window.location.hash = 'organizations'; }}>Administrar paquetes</Button>
            </CardContent>
          </Card>
        </div>
      )}

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

      {/* Modal Commercial Package */}
      <Dialog open={showChangePlanModal} onOpenChange={setShowChangePlanModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Administrar paquete TRP</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {selectedOrg && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600">Organization:</p>
                <p className="font-semibold text-slate-900">{selectedOrg.name}</p>
                <p className="text-xs text-slate-600 mt-1">Legacy Plan: <span className="font-semibold">{selectedOrg.plan?.toUpperCase() || 'BASIC'}</span> · Effective package: <span className="font-semibold">{entitlementsByOrg[selectedOrg.id]?.package_id?.toUpperCase() || 'CORE'}</span></p>
              </div>
            )}
            <div>
              <Label htmlFor="new-plan">Paquete TRP</Label>
              <select
                id="new-plan"
                value={newPackage}
                onChange={(e) => { setNewPackage(e.target.value); if (e.target.value === 'enterprise') setNewBillingInterval('contract'); }}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-md"
              >
                <option value="core">Core</option>
                <option value="advanced">Advanced</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <Label htmlFor="billing-interval">Facturación</Label>
              <select id="billing-interval" value={newBillingInterval} onChange={(e) => setNewBillingInterval(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-md">
                <option value="monthly">Mensual</option>
                <option value="annual">Anual</option>
                <option value="contract">Contrato</option>
              </select>
            </div>
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900">
              Esta acción modifica la autoridad comercial de TRP. El plan legacy se conserva únicamente para compatibilidad y no se modifica aquí.
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowChangePlanModal(false);
                  setNewPackage('core');
                  setNewBillingInterval('monthly');
                  setSelectedOrg(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleChangePlan}
                className="bg-teal-700 hover:bg-teal-800"
              >
                Aplicar paquete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Create Organization */}
      <Dialog open={showModal} onOpenChange={(open) => {
        setShowModal(open);
        if (!open) {
          // Reset form state al cerrar
          setSelectedCountry('');
          setSelectedCurrency('');
          setSelectedPlan('');
        }
      }}>
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
                <select
                  id="country"
                  value={selectedCountry}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                >
                  <option value="">Seleccionar país</option>
                  {COUNTRY_CURRENCY_MAP.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Moneda *</Label>
                <select
                  id="currency"
                  value={selectedCurrency}
                  onChange={(e) => setSelectedCurrency(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                >
                  <option value="">Seleccionar moneda</option>
                  {Object.keys(CURRENCY_LABELS).map(code => (
                    <option key={code} value={code}>
                      {CURRENCY_LABELS[code]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="plan">Plan *</Label>
                <select
                  id="plan"
                  value={selectedPlan}
                  onChange={(e) => setSelectedPlan(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                >
                  <option value="">Seleccionar plan</option>
                  {LEGACY_PLAN_CATALOG.map(plan => (
                    <option key={plan.code} value={plan.code}>
                      {plan.name} (legacy provisioning)
                    </option>
                  ))}
                </select>

                <p className="text-xs text-slate-500 mt-2">Legacy provisioning code only. Commercial package is assigned from Entitlement Authority after tenant creation.</p>
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
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowModal(false);
                  setSelectedCountry('');
                  setSelectedCurrency('');
                  setSelectedPlan('');
                }}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-slate-800 hover:bg-slate-900"
                disabled={creating || !selectedCountry || !selectedCurrency || !selectedPlan}
              >
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