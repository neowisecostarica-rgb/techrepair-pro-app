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
import { Building2, MapPin, Users, Plus, Trash2, Leaf, Edit2, RotateCcw } from 'lucide-react';
import PageGuard from '../components/guards/PageGuard';
import UserManagementPanel from '../components/settings/UserManagementPanel';
import SenalesNegocio from '../components/admin/SenalesNegocio';
import AprobacionesPanel from '../components/admin/AprobacionesPanel';
import ConfiguracionPanel from '../components/admin/ConfiguracionPanel';
import { useAuthContext } from '../components/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';

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

  const { data: organization } = useQuery({
    queryKey: ['organization', effectiveOrgId],
    queryFn: () => base44.entities.Organization.filter({ id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
    select: (data) => data[0],
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
        <TabsList className="bg-white border border-slate-200 p-1 grid grid-cols-7">
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
          <TabsTrigger value="ecofactors" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
            <Leaf className="w-4 h-4 mr-2" />
            Ecológico
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
            organizationId={effectiveOrgId}
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

        {/* Tab Factores Ecológicos */}
        <TabsContent value="ecofactors">
          <EcoFactorsPanel organizationId={effectiveOrgId} />
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

// =====================================================
// COMPONENTE: Panel de Factores Ecológicos
// =====================================================
function EcoFactorsPanel({ organizationId }) {
  const queryClient = useQueryClient();
  const [editingFactor, setEditingFactor] = useState(null);

  const { data: ecoFactors = [] } = useQuery({
    queryKey: ['eco-factors', organizationId],
    queryFn: () => base44.entities.EcoFactor.filter({ organization_id: organizationId }),
    enabled: !!organizationId,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.EcoFactor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eco-factors'] });
      setEditingFactor(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EcoFactor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eco-factors'] });
      setEditingFactor(null);
    },
  });

  const tiposResiduos = [
    { value: 'electronico', label: 'Electrónico', defaultCO2: 2.5, defaultValor: 5000 },
    { value: 'plastico', label: 'Plástico', defaultCO2: 1.8, defaultValor: 800 },
    { value: 'metal', label: 'Metal', defaultCO2: 3.0, defaultValor: 1500 },
    { value: 'papel', label: 'Papel', defaultCO2: 0.9, defaultValor: 400 },
    { value: 'bateria', label: 'Batería', defaultCO2: 4.5, defaultValor: 3000 },
    { value: 'otro', label: 'Otro', defaultCO2: 1.0, defaultValor: 500 },
  ];

  const handleSave = (tipoResiduo) => {
    const factor = ecoFactors.find(f => f.tipo_residuo === tipoResiduo);
    const formData = editingFactor[tipoResiduo];

    if (factor) {
      updateMutation.mutate({
        id: factor.id,
        data: {
          factor_co2_por_kg: parseFloat(formData.co2) || 0,
          valor_por_kg: parseFloat(formData.valor) || 0,
          activo: formData.activo
        }
      });
    } else {
      createMutation.mutate({
        organization_id: organizationId,
        tipo_residuo: tipoResiduo,
        factor_co2_por_kg: parseFloat(formData.co2) || 0,
        valor_por_kg: parseFloat(formData.valor) || 0,
        activo: formData.activo
      });
    }
  };

  const handleRestoreDefaults = () => {
    if (!confirm('¿Restaurar todos los factores a valores predeterminados?')) return;

    tiposResiduos.forEach(tipo => {
      const factor = ecoFactors.find(f => f.tipo_residuo === tipo.value);
      
      if (factor) {
        updateMutation.mutate({
          id: factor.id,
          data: {
            factor_co2_por_kg: tipo.defaultCO2,
            valor_por_kg: tipo.defaultValor,
            activo: true
          }
        });
      } else {
        createMutation.mutate({
          organization_id: organizationId,
          tipo_residuo: tipo.value,
          factor_co2_por_kg: tipo.defaultCO2,
          valor_por_kg: tipo.defaultValor,
          activo: true
        });
      }
    });
  };

  const getFactor = (tipoResiduo) => {
    return ecoFactors.find(f => f.tipo_residuo === tipoResiduo);
  };

  const isEditing = (tipoResiduo) => {
    return editingFactor && editingFactor[tipoResiduo];
  };

  const startEdit = (tipoResiduo) => {
    const factor = getFactor(tipoResiduo);
    setEditingFactor({
      ...editingFactor,
      [tipoResiduo]: {
        co2: factor?.factor_co2_por_kg || 0,
        valor: factor?.valor_por_kg || 0,
        activo: factor?.activo ?? true
      }
    });
  };

  const updateEdit = (tipoResiduo, field, value) => {
    setEditingFactor({
      ...editingFactor,
      [tipoResiduo]: {
        ...editingFactor[tipoResiduo],
        [field]: value
      }
    });
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Leaf className="w-5 h-5 text-green-600" />
            Factores Ecológicos de Reciclaje
          </CardTitle>
          <p className="text-sm text-slate-500 mt-1">
            Configura los factores de cálculo automático para CO₂ evitado y valor recuperado
          </p>
        </div>
        <Button onClick={handleRestoreDefaults} variant="outline" size="sm">
          <RotateCcw className="w-4 h-4 mr-2" />
          Restaurar Valores
        </Button>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-3">
          {tiposResiduos.map(tipo => {
            const factor = getFactor(tipo.value);
            const editing = isEditing(tipo.value);

            return (
              <div 
                key={tipo.value} 
                className="p-4 border border-slate-200 rounded-lg hover:border-emerald-300 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 grid grid-cols-4 gap-4 items-center">
                    <div>
                      <p className="font-semibold text-slate-900">{tipo.label}</p>
                      <Badge className="mt-1 text-xs" variant={factor?.activo ?? true ? 'default' : 'outline'}>
                        {factor?.activo ?? true ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>

                    <div>
                      <Label className="text-xs text-slate-500">CO₂ por kg</Label>
                      {editing ? (
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={editingFactor[tipo.value].co2}
                          onChange={(e) => updateEdit(tipo.value, 'co2', e.target.value)}
                          className="mt-1"
                        />
                      ) : (
                        <p className="font-medium text-slate-900">{factor?.factor_co2_por_kg || 0} kg</p>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs text-slate-500">Valor por kg (₡)</Label>
                      {editing ? (
                        <Input
                          type="number"
                          step="100"
                          min="0"
                          value={editingFactor[tipo.value].valor}
                          onChange={(e) => updateEdit(tipo.value, 'valor', e.target.value)}
                          className="mt-1"
                        />
                      ) : (
                        <p className="font-medium text-slate-900">₡{(factor?.valor_por_kg || 0).toLocaleString()}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {editing && (
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-slate-500">Activo</Label>
                          <Switch
                            checked={editingFactor[tipo.value].activo}
                            onCheckedChange={(checked) => updateEdit(tipo.value, 'activo', checked)}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4">
                    {editing ? (
                      <>
                        <Button
                          onClick={() => handleSave(tipo.value)}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Guardar
                        </Button>
                        <Button
                          onClick={() => setEditingFactor(null)}
                          variant="outline"
                          size="sm"
                        >
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button
                        onClick={() => startEdit(tipo.value)}
                        variant="ghost"
                        size="sm"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {!factor && !editing && (
                  <p className="text-xs text-amber-600 mt-2">
                    ⚠️ No configurado - Los cálculos darán 0 hasta que configures este factor
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900 font-medium mb-2">ℹ️ Información</p>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• Los factores se usan para calcular automáticamente CO₂ evitado y valor recuperado en registros de reciclaje</li>
            <li>• Si un factor está inactivo, los cálculos para ese tipo darán 0</li>
            <li>• Los registros existentes mantienen sus valores históricos aunque cambies los factores</li>
            <li>• Valores sugeridos basados en estándares internacionales de reciclaje</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}