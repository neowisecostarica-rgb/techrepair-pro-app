import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, User, Mail, Phone, Building2, History, MessageSquare, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { sotFetch } from '@/lib/sotClient';
import PageGuard from '../components/guards/PageGuard';
import FormularioCliente from '@/components/clientes/FormularioCliente';
import GestionCotizaciones from '../components/ventas/GestionCotizaciones';
import ComunicacionCliente from '../components/ventas/ComunicacionCliente';
import SeguimientoCliente from '../components/ventas/SeguimientoCliente';
import MensajesMotivacionVentas from '../components/ventas/MensajesMotivacionVentas';

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
  const [showDetalleModal, setShowDetalleModal] = useState(false);
  const [mensajeMotivacion, setMensajeMotivacion] = useState(null);
  const queryClient = useQueryClient();
  const { user, effectiveOrgId } = useAuthContext();

  const mostrarMensajeReconocimiento = (contexto) => {
    setMensajeMotivacion({ tipo: 'reconocimiento', contexto });
    setTimeout(() => setMensajeMotivacion(null), 8000);
  };

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      return sotFetch('/v1/clients', effectiveOrgId) || [];
    },
    enabled: !!effectiveOrgId,
  });



  const clientesFiltrados = clientes.filter(c =>
    !searchTerm ||
    c.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.telefono?.includes(searchTerm)
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Mensaje de Motivación Diario (solo para SALES) */}
      <MensajesMotivacionVentas tipo="diaria" />

      {/* Mensajes contextuales */}
      {mensajeMotivacion && (
        <MensajesMotivacionVentas tipo={mensajeMotivacion.tipo} contexto={mensajeMotivacion.contexto} />
      )}

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

              <div className="flex gap-2 mt-4">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingCliente(cliente);
                    setShowModal(true);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Editar
                </Button>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCliente(cliente);
                    setShowDetalleModal(true);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  <History className="w-4 h-4 mr-2" />
                  Historial
                </Button>
              </div>
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

          <FormularioCliente
            cliente={editingCliente}
            efectiveOrgId={effectiveOrgId}
            onGuardar={() => {
              setShowModal(false);
              setEditingCliente(null);
            }}
            onCancelar={() => {
              setShowModal(false);
              setEditingCliente(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Modal Historial Cliente (OLD - KEEPING FOR NOW) */}
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              OLD FORM
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={() => {}} className="space-y-4 mt-4">
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
      <Dialog open={showDetalleModal} onOpenChange={setShowDetalleModal}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Perfil del Cliente</DialogTitle>
          </DialogHeader>
          {selectedCliente && user && (
            <Tabs defaultValue="seguimiento" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="seguimiento">
                  <History className="w-4 h-4 mr-2" />
                  Seguimiento
                </TabsTrigger>
                <TabsTrigger value="cotizaciones">
                  <FileText className="w-4 h-4 mr-2" />
                  Cotizaciones
                </TabsTrigger>
                <TabsTrigger value="comunicacion">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Comunicación
                </TabsTrigger>
              </TabsList>

              <TabsContent value="seguimiento" className="space-y-4">
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-slate-900 mb-2">{selectedCliente.nombre_completo}</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500">Email</p>
                        <p className="text-slate-900">{selectedCliente.email || '-'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Teléfono</p>
                        <p className="text-slate-900">{selectedCliente.telefono}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Tipo</p>
                        <Badge className="capitalize">{selectedCliente.tipo}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <SeguimientoCliente clienteId={selectedCliente.id} />
              </TabsContent>

              <TabsContent value="cotizaciones">
                <GestionCotizaciones
                  clienteId={selectedCliente.id}
                  ordenTrabajoId={null}
                  user={user}
                />
              </TabsContent>

              <TabsContent value="comunicacion">
                <ComunicacionCliente
                  clienteId={selectedCliente.id}
                  ordenTrabajoId={null}
                  user={user}
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}