import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageGuard from '@/components/guards/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Building2, Phone, Mail, Edit2, Trash2, Search } from 'lucide-react';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { withOrgId } from '@/components/hooks/useOrgData';

export default function Proveedores() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN']}>
      <ProveedoresContent />
    </PageGuard>
  );
}

function ProveedoresContent() {
  const { effectiveOrgId, userAccount, user } = useAuthContext();
  const [showModal, setShowModal] = useState(false);
  const [proveedorEditar, setProveedorEditar] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const queryClient = useQueryClient();

  const { data: proveedores = [], isLoading } = useQuery({
    queryKey: ['proveedores', effectiveOrgId],
    queryFn: () => base44.entities.Supplier.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
    staleTime: 300000
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Supplier.create(withOrgId(data, userAccount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      setShowModal(false);
      setProveedorEditar(null);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Supplier.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      setShowModal(false);
      setProveedorEditar(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Supplier.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const data = {
      name: formData.get('name'),
      contact_name: formData.get('contact_name') || null,
      phone: formData.get('phone'),
      email: formData.get('email') || null,
      address: formData.get('address') || null,
      tax_id: formData.get('tax_id') || null,
      payment_terms_days: parseInt(formData.get('payment_terms_days')) || 30,
      active: true
    };

    if (proveedorEditar) {
      updateMutation.mutate({ id: proveedorEditar.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const proveedoresFiltrados = proveedores.filter(p => {
    const searchLower = busqueda.toLowerCase();
    return p.name?.toLowerCase().includes(searchLower) ||
           p.phone?.includes(busqueda) ||
           p.email?.toLowerCase().includes(searchLower) ||
           p.tax_id?.includes(busqueda);
  });

  const proveedoresActivos = proveedoresFiltrados.filter(p => p.active);
  const proveedoresInactivos = proveedoresFiltrados.filter(p => !p.active);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando proveedores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Proveedores</h1>
          <p className="text-slate-600">Gestión de proveedores y condiciones de pago</p>
        </div>
        <Button
          onClick={() => {
            setProveedorEditar(null);
            setShowModal(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Proveedor
        </Button>
      </div>

      {/* Búsqueda */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, teléfono, email o cédula..."
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-0 shadow-xl bg-gradient-to-br from-emerald-50 to-emerald-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Proveedores Activos</p>
                <p className="text-2xl font-bold text-slate-900">{proveedoresActivos.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-slate-50 to-slate-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-600 rounded-xl flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Proveedores Inactivos</p>
                <p className="text-2xl font-bold text-slate-900">{proveedoresInactivos.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de proveedores */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle>📋 Proveedores Registrados ({proveedoresFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {proveedoresFiltrados.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-700 mb-2">
                {busqueda ? 'No se encontraron proveedores' : 'No hay proveedores registrados'}
              </h3>
              <p className="text-slate-500">
                {busqueda ? 'Intenta con otra búsqueda' : 'Registra tu primer proveedor usando el botón superior'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {proveedoresFiltrados.map((proveedor) => (
                <div
                  key={proveedor.id}
                  className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-slate-900">{proveedor.name}</p>
                        {proveedor.active ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0">Activo</Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-700 border-0">Inactivo</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                        {proveedor.contact_name && (
                          <span>👤 {proveedor.contact_name}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {proveedor.phone}
                        </span>
                        {proveedor.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {proveedor.email}
                          </span>
                        )}
                        {proveedor.payment_terms_days && (
                          <Badge variant="outline" className="text-xs">
                            📅 Crédito {proveedor.payment_terms_days} días
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setProveedorEditar(proveedor);
                        setShowModal(true);
                      }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm('¿Eliminar este proveedor?')) {
                          deleteMutation.mutate(proveedor.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{proveedorEditar ? 'Editar Proveedor' : 'Nuevo Proveedor'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nombre del Proveedor *</Label>
              <Input
                name="name"
                defaultValue={proveedorEditar?.name}
                placeholder="Ej: Distribuidora ABC"
                required
              />
            </div>
            <div>
              <Label>Teléfono *</Label>
              <Input
                name="phone"
                defaultValue={proveedorEditar?.phone}
                placeholder="Ej: 2222-3333"
                required
              />
            </div>
            <div>
              <Label>Nombre de Contacto</Label>
              <Input
                name="contact_name"
                defaultValue={proveedorEditar?.contact_name}
                placeholder="Ej: Juan Pérez"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                name="email"
                type="email"
                defaultValue={proveedorEditar?.email}
                placeholder="contacto@proveedor.com"
              />
            </div>
            <div>
              <Label>Cédula Jurídica / Identificación</Label>
              <Input
                name="tax_id"
                defaultValue={proveedorEditar?.tax_id}
                placeholder="3-101-123456"
              />
            </div>
            <div>
              <Label>Dirección</Label>
              <Input
                name="address"
                defaultValue={proveedorEditar?.address}
                placeholder="Dirección física"
              />
            </div>
            <div>
              <Label>Días de Crédito</Label>
              <Input
                name="payment_terms_days"
                type="number"
                min="0"
                defaultValue={proveedorEditar?.payment_terms_days || 30}
                placeholder="30"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
