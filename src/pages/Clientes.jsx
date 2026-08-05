import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, Mail, Phone, History, MessageSquare, FileText, Pencil, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthContext } from '@/components/contexts/AuthContext';
import PageGuard from '../components/guards/PageGuard';
import { base44 } from '@/api/base44Client';
import FormularioCliente from '@/components/clientes/FormularioCliente';
import ClientePerfilHeader from '@/components/clientes/ClientePerfilHeader';
import ResumenEjecutivo from '@/components/clientes/ResumenEjecutivo';
import EquiposCliente from '@/components/clientes/EquiposCliente';
import GestionCotizaciones from '../components/ventas/GestionCotizaciones';
import ComunicacionCliente from '../components/ventas/ComunicacionCliente';
import SeguimientoCliente from '../components/ventas/SeguimientoCliente';
import AtencionRequerida from '@/components/clientes/AtencionRequerida';

export default function Clientes() {
  return (
    <PageGuard allowedRoles={['SALES', 'ORG_ADMIN', 'BRANCH_ADMIN', 'SUPPORT']}>
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
  const queryClient = useQueryClient();
  const { user, userAccount, effectiveOrgId } = useAuthContext();

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      return base44.entities.Cliente.filter({ organization_id: effectiveOrgId });
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Clientes</h1>
          <p className="text-slate-500">Expedientes de clientes y contexto operativo</p>
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
            onClick={() => {
              setSelectedCliente(cliente);
              setShowDetalleModal(true);
            }}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-2xl flex items-center justify-center text-white font-bold text-xl shrink-0">
                  {cliente.nombre_completo?.charAt(0) || 'C'}
                </div>
                <div className="flex items-center gap-2">
                  {cliente.tipo_cliente === 'empresa' && (
                    <Badge className="bg-blue-100 text-blue-700 border-0">Empresa</Badge>
                  )}
                  {cliente.tipo_cliente === 'institucional' && (
                    <Badge className="bg-purple-100 text-purple-700 border-0">Institucional</Badge>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCliente(cliente);
                      setShowModal(true);
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                    title="Editar cliente"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h3 className="font-bold text-slate-900 text-lg mb-3 group-hover:text-emerald-600 transition-colors">
                {cliente.nombre_completo}
              </h3>

              <div className="space-y-1.5">
                {cliente.email && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{cliente.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {cliente.telefono}
                </div>
              </div>

              <div className="flex items-center justify-end mt-4 pt-4 border-t border-slate-100">
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 group-hover:gap-2 transition-all">
                  Ver expediente
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
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
            onGuardar={() => {
              setShowModal(false);
              setEditingCliente(null);
              queryClient.invalidateQueries({ queryKey: ['clientes'] });
            }}
            onCancelar={() => {
              setShowModal(false);
              setEditingCliente(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Modal Expediente Cliente */}
      <Dialog open={showDetalleModal} onOpenChange={setShowDetalleModal}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Perfil del Cliente</DialogTitle>
          </DialogHeader>
          {selectedCliente && user && (
            <Tabs defaultValue="seguimiento" className="w-full">
              {/* ── Customer 360 Header ── */}
              <ClientePerfilHeader
                cliente={selectedCliente}
                onEditarCliente={() => {
                  setShowDetalleModal(false);
                  setEditingCliente(selectedCliente);
                  setShowModal(true);
                }}
              />

              <AtencionRequerida clienteId={selectedCliente.id} />

              <ResumenEjecutivo clienteId={selectedCliente.id} />

              <EquiposCliente clienteId={selectedCliente.id} />

              <TabsList className="grid w-full grid-cols-3 mt-4">
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
                <SeguimientoCliente clienteId={selectedCliente.id} />
              </TabsContent>

              <TabsContent value="cotizaciones">
                <GestionCotizaciones
                  clienteId={selectedCliente.id}
                  ordenTrabajoId={null}
                  user={user}
                  userAccount={userAccount}
                />
              </TabsContent>

              <TabsContent value="comunicacion">
                <ComunicacionCliente
                  clienteId={selectedCliente.id}
                  ordenTrabajoId={null}
                  user={user}
                  userAccount={userAccount}
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
