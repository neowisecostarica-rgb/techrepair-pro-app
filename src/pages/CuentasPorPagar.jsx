import { useI18n } from '@/i18n';
import React, { useState, useRef } from 'react';
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
import { useToast } from '@/components/ui/use-toast';

export default function CuentasPorPagar() {
  const { toast } = useToast();
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN']}>
      <CuentasPorPagarContent />
    </PageGuard>
  );
}

function CuentasPorPagarContent() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { effectiveOrgId, userAccount, effectiveRole, user } = useAuthContext();
  const [showModalFactura, setShowModalFactura] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('all');
  const queryClient = useQueryClient();
  const invoiceLock = useRef(false);

  const isBranchRestricted = effectiveRole === 'BRANCH_ADMIN';
  const branchIdFijo = isBranchRestricted ? userAccount?.branch_id : null;

  const canRead = !!effectiveOrgId && (!isBranchRestricted || !!branchIdFijo);

  // Queries
  const { data: proveedores = [] } = useQuery({
    queryKey: ['proveedores', effectiveOrgId],
    queryFn: () => base44.entities.Supplier.filter({ organization_id: effectiveOrgId, active: true }, '-created_date', 200),
    enabled: canRead,
    staleTime: 300000
  });

  const { data: facturas = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['purchase-invoices', effectiveOrgId, effectiveRole, branchIdFijo, user?.id],
    queryFn: async () => {
      let query = { organization_id: effectiveOrgId };
      if (branchIdFijo) query.branch_id = branchIdFijo;

      const response = await base44.functions.invoke('operationalGateway', { operation: 'read', entity: 'PurchaseInvoice', method: 'filter', filter: query, sort: '-created_date', limit: 500 });
      const result = response?.data ?? response;
      if (result?.error || result?.complete === false || !Array.isArray(result?.records) || result.records.length >= 500) throw new Error(result?.error || 'Listado incompleto o no confirmado');
      const allInvoices = result.records;
      return aplicarStatusInvoices(allInvoices).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    },
    enabled: canRead,
    staleTime: 60000
  });

  // Mutaciones
  const createInvoiceMutation = useMutation({
    mutationFn: async (/** @type {Record<string, any>} */ data) => { const result = await base44.entities.PurchaseInvoice.create(withOrgId(data, userAccount)); if (!result?.id || result?.error) throw new Error(result?.error || "Factura no confirmada"); return result; },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      setShowModalFactura(false);
    }
  });

  // No registrar pagos mediante dos escrituras independientes.
  // El cierre de este bloqueo requiere el writer financiero autoritativo.
  const reconciliation = useQuery({
    queryKey: ['supplier-payment-reconciliation', effectiveOrgId, effectiveRole, branchIdFijo, user?.id],
    enabled: canRead,
    retry: false,
    queryFn: async () => {
      const filter = { organization_id: effectiveOrgId, ...(branchIdFijo ? { branch_id: branchIdFijo } : {}) };
      const response = await base44.functions.invoke('operationalGateway', { operation: 'read', entity: 'SupplierPayment', method: 'filter', filter, sort: '-created_date', limit: 500 });
      const result = response?.data ?? response;
      if (result?.error || result?.complete === false || !Array.isArray(result?.records) || result.records.length >= 500) throw new Error(result?.error || 'No se confirmó el historial completo de pagos');
      return result.records;
    },
  });
  const paymentTotals = new Map();
  for (const payment of reconciliation.data || []) {
    const previous = paymentTotals.get(payment.purchase_invoice_id) ?? 0;
    const amount = payment.amount;
    paymentTotals.set(payment.purchase_invoice_id, Number.isFinite(amount) && amount > 0 ? previous + Math.round(amount * 100) : NaN);
  }
  const mismatches = reconciliation.isSuccess && !reconciliation.isError
    ? facturas.filter(invoice => !Number.isFinite(invoice.paid_amount ?? 0) || (paymentTotals.get(invoice.id) ?? 0) !== Math.round((invoice.paid_amount ?? 0) * 100))
    : [];
  const mismatchIds = new Set(mismatches.map(invoice => invoice.id));

  const handleSubmitFactura = async (e) => {
    e.preventDefault();
    if (invoiceLock.current || !canRead || !user?.id || isError || isLoading) return;
    const formData = new FormData(e.target);
    
    const supplier_id = formData.get('supplier_id');
    const invoice_number = String(formData.get('invoice_number') || '').trim();
    
    // Validar duplicados
    const existente = facturas.find(f => 
      f.supplier_id === supplier_id && 
      f.invoice_number === invoice_number
    );
    
    if (existente) {
      toast({ variant: 'destructive', title: 'Factura duplicada', description: 'Ya existe una factura con este número para el proveedor seleccionado.' });
      return;
    }
    
    const data = {
      supplier_id,
      invoice_number,
      date: formData.get('date'),
      due_date: formData.get('due_date'),
      total_amount: parseFloat(String(formData.get('total_amount') ?? '')),
      paid_amount: 0,
      notes: formData.get('notes') || null,
      created_by: user.id
    };

    if (branchIdFijo) data.branch_id = branchIdFijo;

    // Validar due_date >= date
    if (new Date(String(data.due_date)) < new Date(String(data.date))) {
      toast({ variant: 'destructive', title: 'Fecha de vencimiento inválida', description: 'La fecha de vencimiento debe ser igual o posterior a la fecha de factura.' });
      return;
    }

    if (!invoice_number || !proveedores.some(p => p.id === supplier_id) || !Number.isFinite(data.total_amount) || data.total_amount <= 0) {
      toast({ variant: "destructive", title: "Datos de factura inválidos" }); return;
    }
    invoiceLock.current = true;
    createInvoiceMutation.mutate(data, { onSettled: () => { invoiceLock.current = false; } });
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
      const diasHastaVenc = (new Date(f.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
      return f.status !== 'paid' && diasHastaVenc <= 7 && diasHastaVenc >= 0;
    })
    .reduce((sum, f) => sum + f.saldo, 0);

  const vencidas = facturas.filter(f => f.status === 'overdue');
  const totalVencido = vencidas.reduce((sum, f) => sum + f.saldo, 0);

  if (!canRead || isError) return <Alert><AlertDescription>No se pudo confirmar la consulta de facturas. <Button variant="link" onClick={() => refetch()}>Reintentar</Button></AlertDescription></Alert>;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">{t('finance.loadingPayables','Cargando cuentas por pagar...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('finance.payables','Cuentas por Pagar')}</h1>
          <p className="text-slate-600">{t('finance.payablesHelp','Control de facturas y pagos a proveedores')}</p>
        </div>
        <Button
          onClick={() => setShowModalFactura(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Registrar Factura
        </Button>
      </div>

      <Alert className="border-amber-300 bg-amber-50">
        <AlertDescription>
          Registro de abonos temporalmente protegido: requiere un proceso financiero que confirme el pago y el saldo de forma consistente. No se modificaron los importes históricos.
          <div>{reconciliation.isLoading ? 'Consultando historial de pagos…' : reconciliation.isError ? 'Conciliación no disponible; los saldos mostrados son los registrados, no certificados.' : reconciliation.isSuccess ? `Facturas con diferencias entre saldo registrado e historial: ${mismatches.length}.` : 'Conciliación pendiente.'}</div>
          <Button variant="link" onClick={() => { refetch(); reconciliation.refetch(); }}>Actualizar conciliación</Button>
        </AlertDescription>
      </Alert>
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-0 shadow-xl bg-gradient-to-br from-orange-50 to-orange-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">{t('finance.pendingTotal','Total Pendiente')}</p>
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
                <p className="text-xs text-slate-600 mb-1">{t('finance.dueWeek','Vence Esta Semana')}</p>
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
                <p className="text-xs text-slate-600 mb-1">{t('finance.overdue','Vencidas')}</p>
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
            <Label className="font-semibold">{t('finance.filterStatus','Filtrar por Estado:')}</Label>
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
                          {mismatchIds.has(factura.id) && <Badge variant="outline">Revisar conciliación</Badge>}
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
                    {factura.status !== 'paid' && <Button disabled variant="outline">Pago protegido</Button>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Factura */}
      <Dialog open={showModalFactura} onOpenChange={value => { if (!invoiceLock.current) setShowModalFactura(value); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('finance.registerInvoice','Registrar Factura de Compra')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitFactura} className="space-y-4">
            {createInvoiceMutation.isError && <p role="alert" className="text-red-700">{createInvoiceMutation.error?.message}</p>}
            <div>
              <Label>{t('tail.supplierRequired','Proveedor *')}</Label>
              <Select name="supplier_id" required>
                <SelectTrigger>
                  <SelectValue placeholder={t('tail.selectSupplier','Selecciona proveedor...')} />
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
              <Label>{t('finance.invoiceNumber','Número de Factura *')}</Label>
              <Input
                name="invoice_number"
                placeholder="Ej: FAC-12345"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('finance.invoiceDate','Fecha Factura *')}</Label>
                <Input
                  name="date"
                  type="date"
                  defaultValue={format(new Date(), 'yyyy-MM-dd')}
                  required
                />
              </div>
              <div>
                <Label>{t('finance.dueDate','Fecha Vencimiento *')}</Label>
                <Input
                  name="due_date"
                  type="date"
                  defaultValue={format(addDays(new Date(), 30), 'yyyy-MM-dd')}
                  required
                />
              </div>
            </div>
            <div>
              <Label>{t('finance.totalAmount','Monto Total *')}</Label>
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
              <Label>{t('finance.notes','Notas')}</Label>
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

    </div>
  );
}