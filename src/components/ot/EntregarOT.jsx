import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Package, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { transicionarEstadoOT } from './transicionarEstadoOT';
import { obtenerEstadoPagoOT } from './obtenerEstadoPagoOT';
import BadgeEstadoPago from './BadgeEstadoPago';

const TEXTO_LEGAL_CHECKBOX = "Confirmo que he recibido el equipo y el servicio descrito en esta orden de trabajo, y que el equipo ha sido entregado en las condiciones acordadas.";

export default function EntregarOT({ 
  ordenTrabajo, 
  effectiveOrgId, 
  userId, 
  userEmail,
  effectiveRole,
  onSuccess 
}) {
  const [showModal, setShowModal] = useState(false);
  const [checkboxAceptado, setCheckboxAceptado] = useState(false);
  const [notaEntrega, setNotaEntrega] = useState('');
  const [estadoPago, setEstadoPago] = useState(null);
  const queryClient = useQueryClient();

  // P0.1: Obtener estado de pago al abrir modal
  React.useEffect(() => {
    if (showModal && ordenTrabajo?.id && effectiveOrgId) {
      obtenerEstadoPagoOT(ordenTrabajo.id, effectiveOrgId).then(setEstadoPago);
    }
  }, [showModal, ordenTrabajo?.id, effectiveOrgId]);

  // Verificar si hay saldo pendiente
  const { data: ventas = [] } = useQuery({
    queryKey: ['ventas-ot', ordenTrabajo.id],
    queryFn: () => base44.entities.Venta.filter({
      organization_id: effectiveOrgId,
      referencia_ot_id: ordenTrabajo.id
    }),
    enabled: showModal && !!effectiveOrgId,
  });

  const ventaPagada = ventas.some(v => v.estado === 'pagada');
  const tieneSaldoPendiente = !ventaPagada;

  // Verificar configuración de garantía
  const { data: config } = useQuery({
    queryKey: ['config-garantia-entrega', effectiveOrgId],
    queryFn: async () => {
      const orgs = await base44.entities.Organization.list();
      const org = orgs.find(o => o.id === effectiveOrgId);
      return org?.garantia_config || null;
    },
    enabled: showModal && !!effectiveOrgId,
  });

  // Verificar si hubo intervención técnica (para garantía)
  const { data: diagnostico } = useQuery({
    queryKey: ['diagnostico-entrega', ordenTrabajo.id],
    queryFn: async () => {
      const diagnosticos = await base44.entities.DiagnosticoTecnico.filter({
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id,
        bloqueado: true
      });
      return diagnosticos.length > 0 ? diagnosticos[0] : null;
    },
    enabled: showModal && !!effectiveOrgId,
  });

  const entregarMutation = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();

      // 1. Transición a ENTREGADA vía helper centralizado
      await transicionarEstadoOT(ordenTrabajo.id, 'ENTREGADA', {
        userId,
        userEmail,
        organizationId: effectiveOrgId,
        motivo: 'Entrega al cliente'
      });

      // 2. Crear log de entrega (inmutable)
      await base44.entities.EntregaLog.create({
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id,
        delivered_by_user_id: userId,
        delivered_by_role: effectiveRole,
        delivered_at: now,
        ip_address: null, // No disponible en frontend
        checkbox_texto_legal: TEXTO_LEGAL_CHECKBOX,
        nota_entrega: notaEntrega || null,
        entrega_con_saldo_pendiente: tieneSaldoPendiente
      });

      // 3. Emitir garantía SOLO SI hubo intervención técnica
      const huboIntervencion = !!diagnostico;
      
      if (huboIntervencion && config?.texto_reparaciones) {
        const token = `GRTR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const fechaEmision = new Date();
        const fechaInicio = new Date();
        const fechaFin = new Date();
        fechaFin.setMonth(fechaFin.getMonth() + (config.meses_vigencia_reparaciones || 3));

        await base44.entities.Garantia.create({
          organization_id: effectiveOrgId,
          cliente_id: ordenTrabajo.cliente_id,
          origen_tipo: 'OT',
          origen_id: ordenTrabajo.id,
          public_access_token: token,
          fecha_emision: fechaEmision.toISOString().split('T')[0],
          fecha_inicio: fechaInicio.toISOString().split('T')[0],
          fecha_fin: fechaFin.toISOString().split('T')[0],
          estado: 'ACTIVA',
          texto_snapshot: config.texto_reparaciones,
          creado_por: userId
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      setShowModal(false);
      setCheckboxAceptado(false);
      setNotaEntrega('');
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      alert('Error al entregar: ' + error.message);
    }
  });

  const handleEntregar = () => {
    if (!checkboxAceptado) {
      alert('Debe aceptar la confirmación de entrega');
      return;
    }

    // Validación de config de garantía
    if (diagnostico && !config?.texto_reparaciones) {
      alert('No se puede entregar: falta configurar el texto de garantía de reparaciones en Configuración');
      return;
    }

    entregarMutation.mutate();
  };

  // P0.1: Solo mostrar si está FINALIZADA, roles permitidos Y PAGADO
  if (ordenTrabajo.estado !== 'FINALIZADA') {
    return null;
  }

  if (!['ORG_ADMIN', 'SALES'].includes(effectiveRole)) {
    return null;
  }

  // P0.1: Obtener estado de pago para bloqueo (síncrono, solo para visibilidad inicial)
  const [estadoPagoInicial, setEstadoPagoInicial] = React.useState(null);
  
  React.useEffect(() => {
    if (ordenTrabajo?.id && effectiveOrgId) {
      obtenerEstadoPagoOT(ordenTrabajo.id, effectiveOrgId).then(setEstadoPagoInicial);
    }
  }, [ordenTrabajo?.id, effectiveOrgId]);

  // P0.1: Bloquear si no está pagado
  if (estadoPagoInicial && estadoPagoInicial.status !== 'PAGADO') {
    return null;
  }

  return (
    <>
      <Button
        onClick={() => setShowModal(true)}
        className="bg-gradient-to-r from-purple-500 to-indigo-500"
      >
        <Package className="w-4 h-4 mr-2" />
        Entregar al Cliente
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Package className="w-6 h-6 text-purple-600" />
              Confirmar Entrega de Orden de Trabajo
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Resumen de OT */}
            <div className="bg-slate-50 p-4 rounded-lg">
              <h3 className="font-semibold text-slate-900 mb-3">Resumen de la Orden</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-500">Código OT:</p>
                  <p className="font-semibold">{ordenTrabajo.codigo_ot}</p>
                </div>
                <div>
                  <p className="text-slate-500">Motivo:</p>
                  <p className="font-semibold">{ordenTrabajo.motivo_ingreso}</p>
                </div>
              </div>
              {/* P0.1: Badge estado de pago */}
              {estadoPago && (
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <p className="text-slate-500 text-sm mb-2">Estado de Pago:</p>
                  <BadgeEstadoPago status={estadoPago.status} />
                </div>
              )}
            </div>

            {/* P0.1: Bloqueo hard si no está pagado */}
            {estadoPago && estadoPago.status !== 'PAGADO' && (
              <Alert className="bg-red-50 border-red-200">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <AlertDescription className="text-red-900">
                  <strong>No se puede entregar:</strong> Esta OT no tiene una venta pagada asociada. 
                  Debe cobrar en el Punto de Venta antes de entregar.
                </AlertDescription>
              </Alert>
            )}

            {/* Validación de garantía */}
            {diagnostico && !config?.texto_reparaciones && (
              <Alert className="bg-red-50 border-red-200">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <AlertDescription className="text-red-900">
                  <strong>Configuración incompleta:</strong> Falta configurar el texto de garantía de reparaciones. 
                  Ve a Configuración → Garantías antes de continuar.
                </AlertDescription>
              </Alert>
            )}

            {/* Garantía info */}
            {diagnostico && config?.texto_reparaciones && (
              <Alert className="bg-emerald-50 border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <AlertDescription className="text-emerald-900">
                  Se emitirá automáticamente una garantía de reparación de {config.meses_vigencia_reparaciones || 3} meses.
                </AlertDescription>
              </Alert>
            )}

            {/* Checkbox legal */}
            <div className="border border-slate-200 rounded-lg p-4 bg-white">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="checkbox-entrega"
                  checked={checkboxAceptado}
                  onCheckedChange={setCheckboxAceptado}
                  className="mt-1"
                />
                <Label htmlFor="checkbox-entrega" className="text-sm font-medium cursor-pointer">
                  {TEXTO_LEGAL_CHECKBOX}
                </Label>
              </div>
            </div>

            {/* Nota de entrega */}
            <div className="space-y-2">
              <Label>Nota de Entrega (opcional)</Label>
              <Textarea
                value={notaEntrega}
                onChange={(e) => setNotaEntrega(e.target.value)}
                placeholder="Observaciones sobre la entrega..."
                rows={3}
              />
            </div>

            {/* Botones */}
            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowModal(false);
                  setCheckboxAceptado(false);
                  setNotaEntrega('');
                }}
                disabled={entregarMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleEntregar}
                disabled={
                  !checkboxAceptado || 
                  entregarMutation.isPending ||
                  (diagnostico && !config?.texto_reparaciones) ||
                  (estadoPago && estadoPago.status !== 'PAGADO')
                }
                className="bg-gradient-to-r from-purple-500 to-indigo-500"
              >
                {entregarMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Procesando Entrega...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Confirmar Entrega
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}