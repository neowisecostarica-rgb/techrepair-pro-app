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
import { Plus, DollarSign, AlertCircle, Calendar, Building2 } from 'lucide-react';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { withOrgId } from '@/components/hooks/useOrgData';
import { aplicarStatusInvoices, statusInvoiceConfig } from '@/components/finanzas/calcularStatusInvoice';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

export default function CuentasPorPagar() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN']}>
      <CuentasPorPagarContent />
    </PageGuard>
  );
}

function CuentasPorPagarContent() {
  const { effectiveOrgId, userAccount, effectiveRole, user } = useAuthContext();
  const [showModalFactura, setShowModalFactura] = useState(false);
  const [showModalPago, setShowModalPago] = useState(false);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('all');
  const queryClient = useQueryClient();

  const isBranchRestricted = effectiveRole === 'BRANCH_ADMIN';
  const branchIdFijo = isBranchRestricted ? userAccount?.branch_id : null;

  // Queries
  const { data: proveedores = [] } = useQuery({
    queryKey: ['proveedores', effectiveOrgId],
    queryFn: () => base44.entities.Supplier.filter({ organization_id: effectiveOrgId, active: true }),
    enabled: !!effectiveOrgId,
    staleTime: 300000
  });

  const { data: facturas = [], isLoading } = useQuery({
    queryKey: ['purchase-invoices', effectiveOrgId, branchIdFijo],
    queryFn: async () => {
      let query = { organization_id: effectiveOrgId };
      if (branchIdFijo) query.branch_id = branchIdFijo;

      const allInvoices = await base44.entities.PurchaseInvoice.filter(query);
      return aplicarStatusInvoices(allInvoices).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    },
    enabled: !!effectiveOrgId,
    staleTime: 60000
  });

  // Mutaciones
  const createInvoiceMutation = useMutation({
    mutationFn: (data) => base44.entities.PurchaseInvoice.create(withOrgId(data, userAccount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      setShowModalFactura(false);
    }
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (data) => {
      const payment = await base44.entities.SupplierPayment.create(withOrgId(data, userAccount));
      
      // Actualizar paid_amount en la factura
      const invoice = facturas.find(f => f.id === data.purchase_invoice_id);
      await base44.entities.PurchaseInvoice.update(invoice.id, {
        paid_amount: (invoice.paid_amount || 0) + data.amount
      });
      
      return payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      setShowModalPago(false);
      setFacturaSeleccionada(null);
    }
  });

  const handleSubmitFactura = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const supplier_id = formData.get('supplier_id');
    const invoice_number = formData.get('invoice_number');
    
    // Validar duplicados
    const existente = facturas.find(f => 
      f.supplier_id === supplier_id && 
      f.invoice_number === invoice_number
    );
    
    if (existente) {
      alert('Ya existe una factura con este número para este proveedor');
      return;
    }
    
    const data = {
      supplier_id,
      invoice_number,
      date: formData.get('date'),
      due_date: formData.get('due_date'),
      total_amount: parseFloat(formData.get('total_amount')),
      paid_amount: 0,
      notes: formData.get('notes') || null,
      created_by: user.id
    };

    if (branchIdFijo) data.branch_id = branchIdFijo;

    // Validar due_date >= date
    if (new Date(data.due_date) < new Date(data.date)) {
      alert('La fecha de vencimiento no puede ser anterior a la fecha de factura');
      return;
    }

    createInvoiceMutation.mutate(data);
  };

  const handleSubmitPago = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const amount = parseFloat(formData.get('amount'));
    const saldo = facturaSeleccionada.saldo;
    
    if (amount > saldo) {
      alert(`El monto excede el saldo pendiente (₡${saldo.toLocaleString()})`);
      return;
    }
    
    const data = {
      purchase_invoice_id: facturaSeleccionada.id,
      amount,
      date: formData.get('date'),
      method: formData.get('method'),
      reference: formData.get('reference') || null,
      notes: formData.get('notes') || null,
      created_by: user.id
    };

    createPaymentMutation.mutate(data);
  };

  // Cálculos
  const facturasFiltradas = filtroStatus === 'all' 
    ? facturas 
    : facturas.filter(f => f.status === filtroStatus);

  const totalPendiente = facturas
    .filter(f => f.status !== 'paid')
    .reduce((sum, f) => sum + f.saldo, 0);

  const venceProximo = facturas
    .filter(f => {
      const diasHastaVenc = (new Date(f.due_date) - new Date()) / (1000 * 60 * 60 * 24);
      return f.status !== 'paid' && diasHastaVenc <= 7 && diasHastaVenc >= 0;
    })
    .reduce((sum, f) => sum + f.saldo, 0);

  const vencidas = facturas.filter(f => f.status === 'overdue');
  const totalVencido = vencidas.reduce((sum, f) => sum + f.saldo, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando cuentas por pagar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Cuentas por Pagar</h1>
          <p className="text-slate-600">Control de facturas y pagos a proveedores</p>
        </div>
        <Button
          onClick={() => setShowModalFactura(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Registrar Factura
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-0 shadow-xl bg-gradient-to-br from-orange-50 to-orange-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Total Pendiente</p>
                <p className="text-2xl font-bold text-slate-900">₡{totalPendiente.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-amber-50 to-amber-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-amber-600 rounded-xl flex items-center justify-center">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Vence Esta Semana</p>
                <p className="text-2xl font-bold text-slate-900">₡{venceProximo.toLocaleString()}</p>
                {venceProximo > 0 && (
                  <Badge className="bg-amber-200 text-amber-800 border-0 text-xs mt-1">
                    ⚠️ Atención
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-red-50 to-red-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Vencidas</p>
                <p className="text-2xl font-bold text-slate-900">₡{totalVencido.toLocaleString()}</p>
                <Badge className="bg-red-200 text-red-800 border-0 text-xs mt-1">
                  🔴 {vencidas.length} facturas
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Label className="font-semibold">Filtrar por Estado:</Label>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant={filtroStatus === 'all' ? 'default' : 'outline'}
                onClick={() => setFiltroStatus('all')}
                className={filtroStatus === 'all' ? 'bg-emerald-600' : ''}
              >
                Todas
              </Button>
              {Object.entries(statusInvoiceConfig).map(([key, config]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={filtroStatus === key ? 'default' : 'outline'}
                  onClick={() => setFiltroStatus(key)}
                  className={filtroStatus === key ? 'bg-emerald-600' : ''}
                >
                  {config.icon} {config.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de facturas */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle>📋 Facturas ({facturasFiltradas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {facturasFiltradas.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-700 mb-2">
                {filtroStatus === 'all' ? 'No hay facturas registradas' : 'No hay facturas con este estado'}
              </h3>
              <p className="text-slate-500">
                {filtroStatus === 'all' ? 'Registra tu primera factura usando el botón superior' : 'Cambia el filtro para ver otras facturas'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {facturasFiltradas.map((factura) => {
                const proveedor = proveedores.find(p => p.id === factura.supplier_id);
                const config = statusInvoiceConfig[factura.status];
                
                return (
                  <div
                    key={factura.id}
                    className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-slate-900">{proveedor?.name || 'Proveedor'}</p>
                          <Badge className={config?.className}>
                            {config?.icon} {config?.label}
                          </Badge>
                          <span className="text-sm text-slate-500">#{factura.invoice_number}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600">
                          <span>📅 Vence: {format(new Date(factura.due_date), 'dd MMM yyyy', { locale: es })}</span>
                          <span>💰 Total: ₡{factura.total_amount.toLocaleString()}</span>
                          {factura.paid_amount > 0 && (
                            <span className="text-emerald-600">✅ Pagado: ₡{factura.paid_amount.toLocaleString()}</span>
                          )}
                          {factura.saldo > 0 && (
                            <span className="font-medium text-orange-600">Saldo: ₡{factura.saldo.toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {factura.status !== 'paid' && (
                      <Button
                        onClick={() => {
                          setFacturaSeleccionada(factura);
                          setShowModalPago(true);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        Registrar Pago
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Factura */}
      <Dialog open={showModalFactura} onOpenChange={setShowModalFactura}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Factura de Compra</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitFactura} className="space-y-4">
            <div>
              <Label>Proveedor *</Label>
              <Select name="supplier_id" required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona proveedor..." />
                </SelectTrigger>
                <SelectContent>
                  {proveedores.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Número de Factura *</Label>
              <Input
                name="invoice_number"
                placeholder="Ej: FAC-12345"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha Factura *</Label>
                <Input
                  name="date"
                  type="date"
                  defaultValue={format(new Date(), 'yyyy-MM-dd')}
                  required
                />
              </div>
              <div>
                <Label>Fecha Vencimiento *</Label>
                <Input
                  name="due_date"
                  type="date"
                  defaultValue={format(addDays(new Date(), 30), 'yyyy-MM-dd')}
                  required
                />
              </div>
            </div>
            <div>
              <Label>Monto Total *</Label>
              <Input
                name="total_amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea
                name="notes"
                placeholder="Detalles adicionales..."
                rows={2}
              />
            </div>

            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <AlertDescription className="text-blue-800 text-sm">
                💡 El estado se calculará automáticamente según pagos y vencimientos
              </AlertDescription>
            </Alert>

            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowModalFactura(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createInvoiceMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {createInvoiceMutation.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Pago */}
      <Dialog open={showModalPago} onOpenChange={setShowModalPago}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
          </DialogHeader>
          {facturaSeleccionada && (
            <form onSubmit={handleSubmitPago} className="space-y-4">
              <Alert className="bg-slate-50 border-slate-200">
                <AlertDescription>
                  <p className="font-semibold text-slate-900 mb-1">
                    Factura #{facturaSeleccionada.invoice_number}
                  </p>
                  <p className="text-sm text-slate-600">
                    Proveedor: {proveedores.find(p => p.id === facturaSeleccionada.supplier_id)?.name}
                  </p>
                  <p className="text-sm text-slate-600">
                    Saldo pendiente: <span className="font-bold text-orange-600">₡{facturaSeleccionada.saldo.toLocaleString()}</span>
                  </p>
                </AlertDescription>
              </Alert>

              <div>
                <Label>Monto a Pagar *</Label>
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={facturaSeleccionada.saldo}
                  placeholder={`Máx: ₡${facturaSeleccionada.saldo.toLocaleString()}`}
                  required
                />
              </div>
              <div>
                <Label>Fecha de Pago *</Label>
                <Input
                  name="date"
                  type="date"
                  defaultValue={format(new Date(), 'yyyy-MM-dd')}
                  required
                />
              </div>
              <div>
                <Label>Método de Pago *</Label>
                <Select name="method" defaultValue="transferencia">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Referencia / Nro. Transacción</Label>
                <Input
                  name="reference"
                  placeholder="Ej: SINPE-12345"
                />
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea
                  name="notes"
                  placeholder="Notas adicionales..."
                  rows={2}
                />
              </div>

              <div className="flex gap-3 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowModalPago(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createPaymentMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {createPaymentMutation.isPending ? 'Registrando...' : 'Registrar Pago'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
