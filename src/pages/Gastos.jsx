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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, DollarSign, TrendingDown, Calendar, Trash2, Edit2, AlertCircle } from 'lucide-react';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { withOrgId } from '@/components/hooks/useOrgData';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Gastos() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN', 'CFO']}>
      <GastosContent />
    </PageGuard>
  );
}

function GastosContent() {
  const { effectiveOrgId, userAccount, effectiveRole, user } = useAuthContext();
  const [showModal, setShowModal] = useState(false);
  const [gastoEditar, setGastoEditar] = useState(null);
  const [mesActual, setMesActual] = useState(new Date());
  const queryClient = useQueryClient();

  const isBranchRestricted = effectiveRole === 'BRANCH_ADMIN';
  const branchIdFijo = isBranchRestricted ? userAccount?.branch_id : null;

  const inicioMes = startOfMonth(mesActual);
  const finMes = endOfMonth(mesActual);

  // Query gastos del mes
  const { data: gastos = [], isLoading } = useQuery({
    queryKey: ['gastos', effectiveOrgId, mesActual.toISOString(), branchIdFijo],
    queryFn: async () => {
      let query = { organization_id: effectiveOrgId };
      if (branchIdFijo) query.branch_id = branchIdFijo;

      const allGastos = await base44.entities.Expense.filter(query);
      
      return allGastos.filter(g => {
        const fecha = new Date(g.date);
        return fecha >= inicioMes && fecha <= finMes;
      }).sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    enabled: !!effectiveOrgId,
    staleTime: 300000 // 5 min
  });

  // Mutaciones
  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Expense.create(withOrgId(data, userAccount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      setShowModal(false);
      setGastoEditar(null);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Expense.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
      setShowModal(false);
      setGastoEditar(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Expense.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos'] });
    }
  });

  // Cálculos
  const totalGastos = gastos.reduce((sum, g) => sum + g.amount, 0);
  const gastosFijos = gastos.filter(g => g.is_fixed || g.frequency === 'monthly')
    .reduce((sum, g) => sum + g.amount, 0);
  const gastosVariables = totalGastos - gastosFijos;

  const gastosPorCategoria = gastos.reduce((acc, g) => {
    acc[g.category] = (acc[g.category] || 0) + g.amount;
    return acc;
  }, {});

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const data = {
      date: formData.get('date'),
      amount: parseFloat(formData.get('amount')),
      category: formData.get('category'),
      frequency: formData.get('frequency'),
      is_fixed: formData.get('is_fixed') === 'on',
      description: formData.get('description'),
      payment_method: formData.get('payment_method') || null,
      created_by: user.id
    };

    if (branchIdFijo) data.branch_id = branchIdFijo;

    if (gastoEditar) {
      updateMutation.mutate({ id: gastoEditar.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const categoriasConfig = {
    alquiler: { label: 'Alquiler', icon: '🏢', color: 'bg-indigo-100 text-indigo-700' },
    servicios: { label: 'Servicios', icon: '⚡', color: 'bg-blue-100 text-blue-700' },
    salarios: { label: 'Salarios', icon: '👥', color: 'bg-purple-100 text-purple-700' },
    marketing: { label: 'Marketing', icon: '📢', color: 'bg-pink-100 text-pink-700' },
    transporte: { label: 'Transporte', icon: '🚚', color: 'bg-amber-100 text-amber-700' },
    otros: { label: 'Otros', icon: '📦', color: 'bg-slate-100 text-slate-700' }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando gastos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gastos Operativos</h1>
          <p className="text-slate-600">Control de gastos mensuales y estimados</p>
        </div>
        <Button
          onClick={() => {
            setGastoEditar(null);
            setShowModal(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Registrar Gasto
        </Button>
      </div>

      {/* Filtro mes */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Calendar className="w-5 h-5 text-slate-500" />
            <div className="flex-1">
              <Label className="text-sm font-medium">Período</Label>
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1))}
                >
                  ← Mes Anterior
                </Button>
                <div className="flex-1 text-center">
                  <p className="text-lg font-semibold text-slate-900">
                    {format(mesActual, 'MMMM yyyy', { locale: es })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1))}
                  disabled={mesActual.getMonth() === new Date().getMonth()}
                >
                  Mes Siguiente →
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-0 shadow-xl bg-gradient-to-br from-red-50 to-red-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Total Gastos</p>
                <p className="text-2xl font-bold text-slate-900">₡{totalGastos.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-orange-50 to-orange-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Gastos Fijos</p>
                <p className="text-2xl font-bold text-slate-900">₡{gastosFijos.toLocaleString()}</p>
                <Badge className="bg-orange-200 text-orange-800 border-0 text-xs mt-1">
                  Estimado mensual
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-amber-50 to-amber-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-amber-600 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Gastos Variables</p>
                <p className="text-2xl font-bold text-slate-900">₡{gastosVariables.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de gastos */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📋 Gastos Registrados ({gastos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gastos.length === 0 ? (
            <div className="text-center py-12">
              <TrendingDown className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-700 mb-2">No hay gastos registrados</h3>
              <p className="text-slate-500">Registra tu primer gasto usando el botón superior</p>
            </div>
          ) : (
            <div className="space-y-3">
              {gastos.map((gasto) => {
                const config = categoriasConfig[gasto.category];
                return (
                  <div
                    key={gasto.id}
                    className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="text-2xl">{config?.icon}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-slate-900">{gasto.description || config?.label}</p>
                          <Badge className={config?.color}>
                            {config?.label}
                          </Badge>
                          {gasto.frequency === 'monthly' && (
                            <Badge className="bg-blue-100 text-blue-700 border-0">
                              📅 Mensual
                            </Badge>
                          )}
                          {gasto.is_fixed && (
                            <Badge className="bg-purple-100 text-purple-700 border-0">
                              📌 Fijo
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-500">
                          {format(new Date(gasto.date), 'dd MMM yyyy', { locale: es })}
                          {gasto.payment_method && ` · ${gasto.payment_method}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-red-600">
                          ₡{gasto.amount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setGastoEditar(gasto);
                          setShowModal(true);
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm('¿Eliminar este gasto?')) {
                            deleteMutation.mutate(gasto.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal crear/editar */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{gastoEditar ? 'Editar Gasto' : 'Registrar Gasto'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Fecha *</Label>
              <Input
                name="date"
                type="date"
                defaultValue={gastoEditar?.date || format(new Date(), 'yyyy-MM-dd')}
                required
              />
            </div>
            <div>
              <Label>Monto *</Label>
              <Input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={gastoEditar?.amount}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <Label>Categoría *</Label>
              <Select name="category" defaultValue={gastoEditar?.category || 'otros'}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(categoriasConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.icon} {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Frecuencia *</Label>
              <Select name="frequency" defaultValue={gastoEditar?.frequency || 'once'}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Una vez</SelectItem>
                  <SelectItem value="monthly">Mensual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Método de Pago</Label>
              <Select name="payment_method" defaultValue={gastoEditar?.payment_method || ''}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="is_fixed"
                id="is_fixed"
                defaultChecked={gastoEditar?.is_fixed}
                className="w-4 h-4"
              />
              <Label htmlFor="is_fixed" className="cursor-pointer">Es un gasto fijo</Label>
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                name="description"
                defaultValue={gastoEditar?.description}
                placeholder="Detalles adicionales..."
                rows={2}
              />
            </div>

            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <AlertDescription className="text-blue-800 text-sm">
                💡 Los gastos mensuales se calcularán automáticamente en los reportes
              </AlertDescription>
            </Alert>

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