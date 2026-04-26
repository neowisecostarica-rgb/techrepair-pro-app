import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuthContext } from '../components/contexts/AuthContext';
import PageGuard from '../components/guards/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, TrendingUp, UserPlus, Phone, Mail, ArrowRight } from 'lucide-react';

export default function CRM() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'SALES']}>
      <CRMContent />
    </PageGuard>
  );
}

function CRMContent() {
  const { effectiveOrgId, effectiveRole, user, status } = useAuthContext();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', effectiveOrgId],
    queryFn: () => base44.entities.Lead.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  if (status !== 'ready') {
    return <div className="p-6 text-center">Cargando CRM...</div>;
  }

  const { data: salesUsers = [] } = useQuery({
    queryKey: ['salesUsers', effectiveOrgId],
    queryFn: () => base44.entities.UserAccount.filter({ 
      organization_id: effectiveOrgId,
      role: 'SALES'
    }),
    enabled: !!effectiveOrgId && effectiveRole === 'ORG_ADMIN',
  });

  const createLeadMutation = useMutation({
    mutationFn: (data) => base44.entities.Lead.create({
      ...data,
      organization_id: effectiveOrgId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setShowCreateModal(false);
    },
  });

  const updateLeadMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Lead.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setShowEditModal(false);
      setEditingLead(null);
    },
  });

  const convertToClienteMutation = useMutation({
    mutationFn: async (lead) => {
      // Check if already converted
      if (lead.converted_to_cliente_id) {
        throw new Error('Lead ya fue convertido');
      }

      // Create Cliente
      const cliente = await base44.entities.Cliente.create({
        organization_id: effectiveOrgId,
        nombre_completo: lead.name,
        email: lead.email || '',
        telefono: lead.phone,
        notas: `Convertido desde Lead. Notas: ${lead.notes || ''}`,
      });

      // Update Lead
      await base44.entities.Lead.update(lead.id, {
        status: 'won',
        converted_to_cliente_id: cliente.id,
        converted_at: new Date().toISOString(),
      });

      return cliente;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
  });

  const handleCreateLead = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    createLeadMutation.mutate({
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      source: formData.get('source'),
      notes: formData.get('notes'),
      status: 'new',
    });
  };

  const handleUpdateLead = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    updateLeadMutation.mutate({
      id: editingLead.id,
      data: {
        status: formData.get('status'),
        assigned_to: formData.get('assigned_to') || null,
        notes: formData.get('notes'),
        lost_reason: formData.get('lost_reason') || null,
      },
    });
  };

  const handleConvertToCliente = (lead) => {
    if (confirm(`¿Convertir "${lead.name}" a cliente?\n\nSe creará un registro en Clientes y el lead se marcará como ganado.`)) {
      convertToClienteMutation.mutate(lead);
    }
  };

  const handleQuickStatusChange = (lead, newStatus) => {
    updateLeadMutation.mutate({
      id: lead.id,
      data: { status: newStatus },
    });
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !searchTerm || 
      lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone?.includes(searchTerm);
    
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const statusConfig = {
    new: { label: 'Nuevo', color: 'bg-blue-100 text-blue-700' },
    contacted: { label: 'Contactado', color: 'bg-purple-100 text-purple-700' },
    qualified: { label: 'Calificado', color: 'bg-indigo-100 text-indigo-700' },
    proposal: { label: 'Propuesta', color: 'bg-yellow-100 text-yellow-700' },
    negotiation: { label: 'Negociación', color: 'bg-orange-100 text-orange-700' },
    won: { label: 'Ganado', color: 'bg-emerald-100 text-emerald-700' },
    lost: { label: 'Perdido', color: 'bg-slate-100 text-slate-700' },
  };

  const getLeadsByStatus = (status) => leads.filter(l => l.status === status).length;

  if (isLoading) {
    return <div className="max-w-7xl mx-auto p-6 text-center">Cargando leads...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">CRM - Gestión de Leads</h1>
          <p className="text-slate-500">Pipeline de ventas y conversión de clientes</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-5 h-5 mr-2" />
          Nuevo Lead
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {Object.entries(statusConfig).map(([status, config]) => (
          <Card key={status} className="border-0 shadow">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{getLeadsByStatus(status)}</p>
              <p className="text-xs text-slate-600">{config.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Buscar por nombre, email o teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(statusConfig).map(([status, config]) => (
              <SelectItem key={status} value={status}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Leads List */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="space-y-4">
            {filteredLeads.length === 0 ? (
              <div className="text-center py-12">
                <UserPlus className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No hay leads que mostrar</p>
              </div>
            ) : (
              filteredLeads.map(lead => (
                <div key={lead.id} className="p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-slate-900">{lead.name}</h3>
                        <Badge className={`${statusConfig[lead.status]?.color} border-0 text-xs`}>
                          {statusConfig[lead.status]?.label}
                        </Badge>
                        {lead.converted_to_cliente_id && (
                          <Badge className="bg-green-100 text-green-700 border-0 text-xs">
                            Cliente
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-600">
                        {lead.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-4 h-4" />
                            {lead.phone}
                          </div>
                        )}
                        {lead.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {lead.email}
                          </div>
                        )}
                      </div>
                      {lead.notes && (
                        <p className="text-sm text-slate-500 mt-2">{lead.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!lead.converted_to_cliente_id && lead.status !== 'won' && (
                        <>
                          <Select
                            value={lead.status}
                            onValueChange={(newStatus) => handleQuickStatusChange(lead, newStatus)}
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(statusConfig).map(([status, config]) => (
                                <SelectItem key={status} value={status}>{config.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={() => handleConvertToCliente(lead)}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            <ArrowRight className="w-4 h-4 mr-1" />
                            Convertir
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingLead(lead);
                          setShowEditModal(true);
                        }}
                      >
                        Editar
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create Lead Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Lead</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateLead} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre Completo *</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono *</Label>
                <Input id="phone" name="phone" type="tel" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Fuente</Label>
              <Select name="source" defaultValue="other">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="website">Sitio Web</SelectItem>
                  <SelectItem value="referral">Referido</SelectItem>
                  <SelectItem value="social_media">Redes Sociales</SelectItem>
                  <SelectItem value="phone">Teléfono</SelectItem>
                  <SelectItem value="walk_in">Visita Directa</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" name="notes" rows={3} />
            </div>
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancelar
              </Button>
              <Button type="submit">Crear Lead</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Lead Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Lead</DialogTitle>
          </DialogHeader>
          {editingLead && (
            <form onSubmit={handleUpdateLead} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={editingLead.name} disabled className="bg-slate-50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Estado *</Label>
                <Select name="status" defaultValue={editingLead.status} required>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusConfig).map(([status, config]) => (
                      <SelectItem key={status} value={status}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {effectiveRole === 'ORG_ADMIN' && (
                <div className="space-y-2">
                  <Label htmlFor="assigned_to">Asignar a (SALES)</Label>
                  <Select name="assigned_to" defaultValue={editingLead.assigned_to || ''}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>Sin asignar</SelectItem>
                      {salesUsers.map(u => (
                        <SelectItem key={u.id} value={u.user_id}>{u.user_email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea id="notes" name="notes" rows={3} defaultValue={editingLead.notes || ''} />
              </div>
              {editingLead.status === 'lost' && (
                <div className="space-y-2">
                  <Label htmlFor="lost_reason">Razón de pérdida</Label>
                  <Textarea id="lost_reason" name="lost_reason" rows={2} defaultValue={editingLead.lost_reason || ''} />
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Guardar Cambios</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}