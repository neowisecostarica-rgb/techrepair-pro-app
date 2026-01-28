import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageGuard from '@/components/guards/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/components/contexts/AuthContext';

export default function AdminReset() {
  return (
    <PageGuard allowedRoles={['SUPER_ADMIN']}>
      <AdminResetContent />
    </PageGuard>
  );
}

function AdminResetContent() {
  const { user } = useAuthContext();
  const [logs, setLogs] = useState([]);
  const [isResetting, setIsResetting] = useState(false);
  const queryClient = useQueryClient();

  const addLog = (message, type = 'info') => {
    setLogs(prev => [...prev, { message, type, timestamp: new Date() }]);
  };

  const resetEverything = async () => {
    if (!confirm('⚠️ PELIGRO: Esto eliminará TODOS los datos del sistema excepto tu usuario SUPER_ADMIN.\n\n¿Estás ABSOLUTAMENTE seguro?')) {
      return;
    }

    if (!confirm('Última confirmación: ¿Proceder con el RESET COMPLETO?')) {
      return;
    }

    setIsResetting(true);
    setLogs([]);
    addLog('🚀 Iniciando reset completo del sistema...', 'info');

    try {
      // 1. Eliminar datos operativos (de menor a mayor dependencia)
      addLog('🗑️ Paso 1/8: Eliminando logs y datos secundarios...', 'info');
      await Promise.all([
        base44.entities.EntregaLog.filter({}).then(items => 
          items.length > 0 ? base44.entities.EntregaLog.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.ComprobanteVentaLog.filter({}).then(items => 
          items.length > 0 ? base44.entities.ComprobanteVentaLog.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.SuperAdminAudit.filter({}).then(items => 
          items.length > 0 ? base44.entities.SuperAdminAudit.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.ActividadTecnica.filter({}).then(items => 
          items.length > 0 ? base44.entities.ActividadTecnica.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.InventarioHistorial.filter({}).then(items => 
          items.length > 0 ? base44.entities.InventarioHistorial.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
      ]);
      addLog('✅ Logs eliminados', 'success');

      addLog('🗑️ Paso 2/8: Eliminando notificaciones y mensajes...', 'info');
      await Promise.all([
        base44.entities.Notificacion.filter({}).then(items => 
          items.length > 0 ? base44.entities.Notificacion.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.MensajeCliente.filter({}).then(items => 
          items.length > 0 ? base44.entities.MensajeCliente.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.NotaInterna.filter({}).then(items => 
          items.length > 0 ? base44.entities.NotaInterna.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
      ]);
      addLog('✅ Notificaciones eliminadas', 'success');

      addLog('🗑️ Paso 3/8: Eliminando datos de taller...', 'info');
      await Promise.all([
        base44.entities.BloqueoTecnico.filter({}).then(items => 
          items.length > 0 ? base44.entities.BloqueoTecnico.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.PruebaTecnica.filter({}).then(items => 
          items.length > 0 ? base44.entities.PruebaTecnica.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.SolicitudTecnica.filter({}).then(items => 
          items.length > 0 ? base44.entities.SolicitudTecnica.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.RegistroTiempo.filter({}).then(items => 
          items.length > 0 ? base44.entities.RegistroTiempo.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
      ]);
      addLog('✅ Datos de taller eliminados', 'success');

      addLog('🗑️ Paso 4/8: Eliminando diagnósticos y evidencias...', 'info');
      await Promise.all([
        base44.entities.DiagnosticoEvidencia.filter({}).then(items => 
          items.length > 0 ? base44.entities.DiagnosticoEvidencia.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.DiagnosticoDocumento.filter({}).then(items => 
          items.length > 0 ? base44.entities.DiagnosticoDocumento.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.DiagnosticoResultado.filter({}).then(items => 
          items.length > 0 ? base44.entities.DiagnosticoResultado.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
      ]);
      await base44.entities.DiagnosticoTecnico.filter({}).then(items => 
        items.length > 0 ? base44.entities.DiagnosticoTecnico.delete({ id: { $in: items.map(i => i.id) } }) : null
      );
      await base44.entities.PreDiagnostico.filter({}).then(items => 
        items.length > 0 ? base44.entities.PreDiagnostico.delete({ id: { $in: items.map(i => i.id) } }) : null
      );
      addLog('✅ Diagnósticos eliminados', 'success');

      addLog('🗑️ Paso 5/8: Eliminando finanzas...', 'info');
      await Promise.all([
        base44.entities.SupplierPayment.filter({}).then(items => 
          items.length > 0 ? base44.entities.SupplierPayment.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.PurchaseInvoice.filter({}).then(items => 
          items.length > 0 ? base44.entities.PurchaseInvoice.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.Expense.filter({}).then(items => 
          items.length > 0 ? base44.entities.Expense.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.Supplier.filter({}).then(items => 
          items.length > 0 ? base44.entities.Supplier.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
      ]);
      addLog('✅ Finanzas eliminadas', 'success');

      addLog('🗑️ Paso 6/8: Eliminando ventas, garantías, cotizaciones...', 'info');
      await Promise.all([
        base44.entities.VentaItem.filter({}).then(items => 
          items.length > 0 ? base44.entities.VentaItem.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.Garantia.filter({}).then(items => 
          items.length > 0 ? base44.entities.Garantia.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.Cotizacion.filter({}).then(items => 
          items.length > 0 ? base44.entities.Cotizacion.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
      ]);
      await base44.entities.Venta.filter({}).then(items => 
        items.length > 0 ? base44.entities.Venta.delete({ id: { $in: items.map(i => i.id) } }) : null
      );
      addLog('✅ Ventas eliminadas', 'success');

      addLog('🗑️ Paso 7/8: Eliminando OTs, citas, inventario, clientes...', 'info');
      await Promise.all([
        base44.entities.Cita.filter({}).then(items => 
          items.length > 0 ? base44.entities.Cita.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.OrdenTrabajo.filter({}).then(items => 
          items.length > 0 ? base44.entities.OrdenTrabajo.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.Inventario.filter({}).then(items => 
          items.length > 0 ? base44.entities.Inventario.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.CategoriaInventario.filter({}).then(items => 
          items.length > 0 ? base44.entities.CategoriaInventario.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.Equipo.filter({}).then(items => 
          items.length > 0 ? base44.entities.Equipo.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.Lead.filter({}).then(items => 
          items.length > 0 ? base44.entities.Lead.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.Cliente.filter({}).then(items => 
          items.length > 0 ? base44.entities.Cliente.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.NoConformidad.filter({}).then(items => 
          items.length > 0 ? base44.entities.NoConformidad.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
        base44.entities.Reciclaje.filter({}).then(items => 
          items.length > 0 ? base44.entities.Reciclaje.delete({ id: { $in: items.map(i => i.id) } }) : null
        ),
      ]);
      addLog('✅ Datos operativos eliminados', 'success');

      addLog('🗑️ Paso 8/8: Eliminando organizations y usuarios...', 'info');
      const allUserAccounts = await base44.entities.UserAccount.filter({});
      const accountsToDelete = allUserAccounts.filter(acc => 
        acc.role !== 'SUPER_ADMIN' && acc.user_id !== user.id
      );
      if (accountsToDelete.length > 0) {
        await base44.entities.UserAccount.delete({ id: { $in: accountsToDelete.map(a => a.id) } });
      }
      addLog(`✅ ${accountsToDelete.length} UserAccounts eliminados`, 'success');

      await base44.entities.Branch.filter({}).then(items => 
        items.length > 0 ? base44.entities.Branch.delete({ id: { $in: items.map(i => i.id) } }) : null
      );

      const allOrgs = await base44.entities.Organization.filter({});
      if (allOrgs.length > 0) {
        await base44.entities.Organization.delete({ id: { $in: allOrgs.map(o => o.id) } });
      }
      addLog(`✅ ${allOrgs.length} Organizations eliminadas`, 'success');

      // Limpiar queries cacheadas
      queryClient.clear();

      addLog('✨ RESET COMPLETO EXITOSO', 'success');
      addLog('Sistema limpio y listo para QA', 'success');

    } catch (error) {
      addLog(`❌ ERROR: ${error.message}`, 'error');
      console.error('Reset error:', error);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-red-600">⚠️ Admin Reset (QA Only)</h1>
        <p className="text-slate-600">Limpieza completa del sistema de pruebas</p>
      </div>

      <Alert className="bg-red-50 border-red-300">
        <AlertTriangle className="w-5 h-5 text-red-600" />
        <AlertDescription className="text-red-800">
          <strong>ZONA DE PELIGRO</strong>
          <p className="text-sm mt-2">
            Esta acción eliminará TODOS los datos del sistema excepto tu usuario SUPER_ADMIN.
            <br />
            <strong>NO hay vuelta atrás.</strong> Solo usar en entorno QA/pruebas.
          </p>
        </AlertDescription>
      </Alert>

      <Card className="border-2 border-red-300">
        <CardHeader>
          <CardTitle className="text-red-700">Operación de Reset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-lg text-sm space-y-2">
            <p className="font-semibold text-slate-900">Se eliminarán:</p>
            <ul className="list-disc list-inside text-slate-700 space-y-1">
              <li>Todas las Organizations</li>
              <li>Todos los UserAccounts (excepto SUPER_ADMIN actual)</li>
              <li>Todas las Notificaciones</li>
              <li>Todas las OrdenesTrabajo y Diagnósticos</li>
              <li>Todas las Ventas, Cotizaciones y Garantías</li>
              <li>Todo el Inventario</li>
              <li>Todos los Gastos, Facturas y Pagos</li>
              <li>Todos los Clientes, Equipos y Leads</li>
              <li>Todos los datos operativos y logs</li>
            </ul>
            <p className="font-semibold text-emerald-700 mt-3">Se mantendrá:</p>
            <ul className="list-disc list-inside text-emerald-700">
              <li>Tu usuario SUPER_ADMIN: {user?.email}</li>
              <li>Schemas de entidades (estructura)</li>
            </ul>
          </div>

          <Button
            onClick={resetEverything}
            disabled={isResetting}
            className="w-full bg-red-600 hover:bg-red-700 text-white"
            size="lg"
          >
            {isResetting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Ejecutando Reset...
              </>
            ) : (
              <>
                <Trash2 className="w-5 h-5 mr-2" />
                EJECUTAR RESET COMPLETO
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Log de Operaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs max-h-96 overflow-y-auto space-y-1">
              {logs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  {log.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />}
                  {log.type === 'error' && <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
                  {log.type === 'info' && <span className="text-blue-400 flex-shrink-0">ℹ️</span>}
                  <span className={log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : ''}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}