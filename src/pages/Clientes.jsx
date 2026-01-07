import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, User, Mail, Phone, Building2, History } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUserAccount, withOrgId } from '@/components/hooks/useOrgData';
import PageGuard from '../components/guards/PageGuard';

export default function Clientes() {
  return (
    <PageGuard allowedRoles={['SALES', 'ORG_ADMIN', 'BRANCH_ADMIN']}>
      <ClientesContent />
    </PageGuard>
  );
}

function ClientesContent() {
  const [showModal, setShowModal] = useState(false);
  const [editingCliente, setEditingCliente] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCliente, setSelectedCliente] = useState(null);
  const queryClient = useQueryClient();
  const { userAccount } = useUserAccount();

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', userAccount?.organization_id],
    queryFn: () => base44.entities.Cliente.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: ordenesCliente = [] } = useQuery({
    queryKey: ['ordenes-cliente', selectedCliente?.id],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ cliente_id: selectedCliente.id }),
    enabled: !!selectedCliente,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Cliente.create(withOrgId(data, userAccount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setShowModal(false);
      setEditingCliente(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Cliente.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setShowModal(false);
      setEditingCliente(null);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      nombre_completo: formData.get('nombre_completo'),
      email: formData.get('email'),
      telefono: formData.get('telefono'),
      identificacion: formData.get('identificacion'),
      tipo: formData.get('tipo'),
      direccion: formData.get('direccion'),
      notas: formData.get('notas'),
    };

    if (editingCliente) {
      updateMutation.mutate({ id: editingCliente.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const clientesFiltrados = clientes.filter(c =>
    !searchTerm ||
    c.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.telefono?.includes(searchTerm)
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Clientes (CRM)</h1>
          <p className="text-slate-500">Gestión de clientes y su historial</p>
        </div>
        <Button
          onClick={() => { setEditingCliente(null); setShowModal(true); }}
          className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nuevo Cliente
        </Button>
      </div>

      {/* Búsqueda */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="Buscar por nombre, email o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Grid de Clientes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clientesFiltrados.map((cliente) => (
          <Card 
            key={cliente.id} 
            className="border-0 shadow-md hover:shadow-xl transition-all cursor-pointer group"
            onClick={() => setSelectedCliente(cliente)}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-2xl flex items-center justify-center text-white font-bold text-xl">
                  {cliente.nombre_completo?.charAt(0) || 'C'}
                </div>
                <Badge className={`${
                  cliente.tipo === 'empresa' ? 'bg-blue-100 text-blue-700' :
                  cliente.tipo === 'institucional' ? 'bg-purple-100 text-purple-700' :
                  'bg-slate-100 text-slate-700'
                } border-0`}>
                  {cliente.tipo}
                </Badge>
              </div>

              <h3 className="font-bold text-slate-900 text-lg mb-3 group-hover:text-emerald-600 transition-colors">
                {cliente.nombre_completo}
              </h3>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Mail className="w-4 h-4 text-slate-400" />
                  {cliente.email || 'Sin email'}
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Phone className="w-4 h-4 text-slate-400" />
                  {cliente.telefono}
                </div>
              </div>

              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingCliente(cliente);
                  setShowModal(true);
                }}
                variant="outline"
                className="w-full mt-4"
              >
                Editar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal Crear/Editar Cliente */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {editingCliente ? 'Editar Cliente' : 'Nuevo Cliente'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="nombre_completo">Nombre Completo *</Label>
                <Input
                  id="nombre_completo"
                  name="nombre_completo"
                  defaultValue={editingCliente?.nombre_completo}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  type="email"
                  id="email"
                  name="email"
                  defaultValue={editingCliente?.email}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono *</Label>
                <Input
                  id="telefono"
                  name="telefono"
                  defaultValue={editingCliente?.telefono}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="identificacion">Identificación</Label>
                <Input
                  id="identificacion"
                  name="identificacion"
                  defaultValue={editingCliente?.identificacion}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Cliente</Label>
                <Select name="tipo" defaultValue={editingCliente?.tipo || 'individual'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="empresa">Empresa</SelectItem>
                    <SelectItem value="institucional">Institucional</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="direccion">Dirección</Label>
                <Input
                  id="direccion"
                  name="direccion"
                  defaultValue={editingCliente?.direccion}
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="notas">Notas</Label>
                <Input
                  id="notas"
                  name="notas"
                  defaultValue={editingCliente?.notas}
                  placeholder="Notas adicionales..."
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-emerald-500 to-blue-500">
                {editingCliente ? 'Actualizar' : 'Crear'} Cliente
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Historial Cliente */}
      <Dialog open={!!selectedCliente && !showModal} onOpenChange={() => setSelectedCliente(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center text-white font-bold">
                {selectedCliente?.nombre_completo?.charAt(0)}
              </div>
              {selectedCliente?.nombre_completo}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl">
              <div>
                <p className="text-xs text-slate-500">Email</p>
                <p className="font-medium">{selectedCliente?.email || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Teléfono</p>
                <p className="font-medium">{selectedCliente?.telefono}</p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <History className="w-5 h-5 text-emerald-600" />
                Historial de Órdenes
              </h3>
              <div className="space-y-2">
                {ordenesCliente?.map(orden => (
                  <div key={orden.id} className="p-3 border border-slate-200 rounded-lg flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{orden.numero_ot}</p>
                      <p className="text-xs text-slate-500">{orden.falla_reportada}</p>
                    </div>
                    <Badge className={`${estadoConfig[orden.estado]?.color} border-0`}>
                      {estadoConfig[orden.estado]?.label}
                    </Badge>
                  </div>
                ))}
                {ordenesCliente?.length === 0 && (
                  <p className="text-center text-slate-400 py-4">Sin órdenes registradas</p>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}