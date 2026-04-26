import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Calendar, User, Wrench, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { WORK_ORDER_STATUSES } from '@/config/workOrderStatus';

export default function ModalDetalleOT({ ot, cliente, tecnico, onClose }) {
  if (!ot) return null;

  const config = WORK_ORDER_STATUSES[ot.estado] || { color: 'bg-slate-100 text-slate-700', label: ot.estado };

  return (
    <Dialog open={!!ot} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-indigo-600" />
            Detalle de Orden de Trabajo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Alerta Read-Only */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-800 font-medium">Vista informativa — sin acciones operativas</p>
              <p className="text-xs text-blue-600 mt-1">Este modal es solo para inspección. Para gestionar la OT, dirígete al módulo correspondiente.</p>
            </div>
          </div>

          {/* Información Principal */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="text-xs text-slate-500">Código OT</p>
              <p className="font-semibold text-slate-900">{ot.codigo_ot}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Estado</p>
              <Badge className={`${config.color} border-0`}>
                {config.label}
              </Badge>
            </div>
            {cliente && (
              <>
                <div>
                  <p className="text-xs text-slate-500">Cliente</p>
                  <p className="text-slate-900">{cliente.nombre_completo}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Teléfono</p>
                  <p className="text-slate-900">{cliente.telefono || 'N/A'}</p>
                </div>
              </>
            )}
            <div>
              <p className="text-xs text-slate-500">Técnico Asignado</p>
              <p className="text-slate-900">{tecnico ? tecnico.user_email : 'Sin asignar'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Prioridad</p>
              <Badge variant="outline" className="capitalize">
                {ot.prioridad || 'normal'}
              </Badge>
            </div>
          </div>

          {/* Fechas */}
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Fechas Clave
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">Fecha Ingreso</p>
                <p className="text-slate-900">
                  {format(new Date(ot.created_date), "dd MMM yyyy HH:mm", { locale: es })}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Última Actividad</p>
                <p className="text-slate-900">
                  {format(new Date(ot.updated_date), "dd MMM yyyy HH:mm", { locale: es })}
                </p>
              </div>
              {ot.fecha_entrega_estimada && (
                <div>
                  <p className="text-xs text-slate-500">Entrega Estimada</p>
                  <p className="text-slate-900">
                    {format(new Date(ot.fecha_entrega_estimada), "dd MMM yyyy", { locale: es })}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Motivo y Observaciones */}
          {ot.motivo_ingreso && (
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">Motivo de Ingreso</h4>
              <p className="text-sm text-slate-600 p-3 bg-slate-50 rounded-lg">
                {ot.motivo_ingreso}
              </p>
            </div>
          )}

          {ot.observaciones_ingreso && (
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">Observaciones</h4>
              <p className="text-sm text-slate-600 p-3 bg-slate-50 rounded-lg">
                {ot.observaciones_ingreso}
              </p>
            </div>
          )}

          {ot.diagnostico_resumido && (
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">Diagnóstico</h4>
              <p className="text-sm text-slate-600 p-3 bg-slate-50 rounded-lg">
                {ot.diagnostico_resumido}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}