import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, User, Wrench, AlertCircle, Smartphone, ClipboardList, PackageOpen, Phone } from 'lucide-react';
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

        <div className="space-y-4 mt-4">

          {/* Alerta Read-Only */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">Vista informativa — sin acciones operativas. Para gestionar la OT, dirígete al módulo correspondiente.</p>
          </div>

          {/* Card 1 — Estado y Asignación */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-3 pt-4 px-4 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-indigo-500" />
                Estado y Asignación
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Código OT</p>
                  <p className="font-semibold text-slate-900 text-sm">{ot.codigo_ot}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Estado</p>
                  <Badge className={`${config.color} border-0 text-xs`}>
                    {config.label}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Prioridad</p>
                  <Badge variant="outline" className="capitalize text-xs">
                    {ot.prioridad || 'normal'}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Técnico Asignado</p>
                  <p className="text-sm text-slate-900">{tecnico ? tecnico.user_email : <span className="text-slate-400 italic">Sin asignar</span>}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 mb-1">Fecha de Ingreso</p>
                  <p className="text-sm text-slate-900 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {format(new Date(ot.created_date), "dd MMM yyyy HH:mm", { locale: es })}
                  </p>
                </div>
                {ot.fecha_entrega_estimada && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 mb-1">Entrega Estimada</p>
                    <p className="text-sm text-slate-900 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {format(new Date(ot.fecha_entrega_estimada), "dd MMM yyyy", { locale: es })}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 2 — Cliente y Equipo */}
          {cliente && (
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-3 pt-4 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-500" />
                  Cliente y Equipo
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Cliente</p>
                    <p className="text-sm font-medium text-slate-900">{cliente.nombre_completo}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Teléfono</p>
                    <p className="text-sm text-slate-900 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {cliente.telefono || <span className="text-slate-400 italic">N/A</span>}
                    </p>
                  </div>
                  {ot.serie_ingreso && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Serie / IMEI</p>
                      <p className="text-sm font-mono text-slate-900">{ot.serie_ingreso}</p>
                    </div>
                  )}
                  {ot.contrasena_ingreso && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">PIN / Contraseña</p>
                      <p className="text-sm font-mono text-slate-900">{ot.contrasena_ingreso}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Card 3 — Motivo y Observaciones */}
          {(ot.motivo_ingreso || ot.observaciones_ingreso || ot.diagnostico_resumido) && (
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-3 pt-4 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-amber-500" />
                  Motivo e Historial
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {ot.motivo_ingreso && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Motivo de Ingreso</p>
                    <p className="text-sm text-slate-700 p-2.5 bg-slate-50 rounded-md border border-slate-100">
                      {ot.motivo_ingreso}
                    </p>
                  </div>
                )}
                {ot.observaciones_ingreso && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Observaciones</p>
                    <p className="text-sm text-slate-700 p-2.5 bg-slate-50 rounded-md border border-slate-100">
                      {ot.observaciones_ingreso}
                    </p>
                  </div>
                )}
                {ot.diagnostico_resumido && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Diagnóstico</p>
                    <p className="text-sm text-slate-700 p-2.5 bg-emerald-50 rounded-md border border-emerald-100">
                      {ot.diagnostico_resumido}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Card 4 — Información de Recepción */}
          {(ot.tipo_ingreso || ot.estado_fisico_ingreso || ot.accesorios_ingreso) && (
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-3 pt-4 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <PackageOpen className="w-4 h-4 text-purple-500" />
                  Información de Recepción
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  {ot.tipo_ingreso && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Tipo de Ingreso</p>
                      <Badge variant="outline" className="capitalize text-xs">{ot.tipo_ingreso}</Badge>
                    </div>
                  )}
                  {ot.estado_fisico_ingreso && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Estado Físico</p>
                      <Badge variant="outline" className="capitalize text-xs">{ot.estado_fisico_ingreso}</Badge>
                    </div>
                  )}
                  {ot.accesorios_ingreso && (
                    <div className="col-span-2">
                      <p className="text-xs text-slate-500 mb-1">Accesorios Entregados</p>
                      <p className="text-sm text-slate-700 p-2.5 bg-slate-50 rounded-md border border-slate-100">
                        {ot.accesorios_ingreso}
                      </p>
                    </div>
                  )}
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 mb-1">Última Actividad</p>
                    <p className="text-sm text-slate-900">
                      {format(new Date(ot.updated_date), "dd MMM yyyy HH:mm", { locale: es })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}