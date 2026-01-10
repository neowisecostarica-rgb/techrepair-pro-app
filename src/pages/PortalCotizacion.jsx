import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Clock,
  AlertCircle,
  Package,
  Wrench
} from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function PortalCotizacion() {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [cotizacion, setCotizacion] = useState(null);
  const [ordenTrabajo, setOrdenTrabajo] = useState(null);
  const [terminosCondiciones, setTerminosCondiciones] = useState(null);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [showRechazo, setShowRechazo] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        setError('Token de acceso no válido');
        setLoading(false);
        return;
      }

      // Buscar OT por token
      const ots = await base44.entities.OrdenTrabajo.filter({
        public_access_token: token
      });

      if (ots.length === 0) {
        setError('No se encontró la orden de trabajo');
        setLoading(false);
        return;
      }

      const ot = ots[0];
      setOrdenTrabajo(ot);

      // Buscar cotización enviada
      const cotizaciones = await base44.entities.Cotizacion.filter({
        orden_trabajo_id: ot.id,
        estado: 'enviada'
      });

      if (cotizaciones.length === 0) {
        setError('No hay cotización disponible para aprobar');
        setLoading(false);
        return;
      }

      setCotizacion(cotizaciones[0]);

      // Cargar términos activos
      const terminos = await base44.entities.TerminosYCondiciones.filter({
        organization_id: ot.organization_id,
        activo: true
      });

      if (terminos.length > 0) {
        setTerminosCondiciones(terminos[0]);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error cargando datos:', error);
      setError('Error al cargar la cotización');
      setLoading(false);
    }
  };

  const aprobarCotizacion = async () => {
    if (!aceptaTerminos) {
      alert('Debes aceptar los términos y condiciones');
      return;
    }

    setProcessing(true);
    try {
      // Snapshot completo de la cotización
      const snapshot = {
        ...cotizacion,
        fecha_aprobacion: new Date().toISOString()
      };

      // Actualizar cotización
      await base44.entities.Cotizacion.update(cotizacion.id, {
        estado: 'aprobada',
        aprobada_at: new Date().toISOString(),
        contenido_aprobado_snapshot: snapshot,
        terminos_version_aceptada: terminosCondiciones?.version || 'v1.0',
        ip_aprobacion: 'client-ip' // TODO: capturar IP real si es posible
      });

      // Actualizar OT
      await base44.entities.OrdenTrabajo.update(ordenTrabajo.id, {
        estado: 'EN_REPARACION',
        cliente_aprobado: true,
        cliente_aprobado_at: new Date().toISOString()
      });

      // Recargar para mostrar estado actualizado
      await cargarDatos();
      alert('¡Cotización aprobada! El trabajo iniciará pronto.');
    } catch (error) {
      console.error('Error aprobando cotización:', error);
      alert('Error al aprobar: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const rechazarCotizacion = async () => {
    if (!motivoRechazo.trim()) {
      alert('Por favor indica el motivo del rechazo');
      return;
    }

    setProcessing(true);
    try {
      // Actualizar cotización
      await base44.entities.Cotizacion.update(cotizacion.id, {
        estado: 'rechazada',
        cliente_rechazo_motivo: motivoRechazo
      });

      // Actualizar OT
      await base44.entities.OrdenTrabajo.update(ordenTrabajo.id, {
        estado: 'DIAGNOSTICADA',
        cliente_aprobado: false,
        cliente_rechazo_motivo: motivoRechazo
      });

      // Recargar para mostrar estado actualizado
      await cargarDatos();
      alert('Cotización rechazada. Nos pondremos en contacto contigo.');
    } catch (error) {
      console.error('Error rechazando cotización:', error);
      alert('Error al rechazar: ' + error.message);
    } finally {
      setProcessing(false);
      setShowRechazo(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Error</h2>
            <p className="text-slate-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (cotizacion.estado === 'aprobada') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">¡Cotización Aprobada!</h2>
            <p className="text-slate-600 mb-4">
              Tu reparación ha sido aprobada y el trabajo iniciará pronto.
            </p>
            <Badge className="bg-emerald-100 text-emerald-800 text-lg px-4 py-2">
              Aprobada el {new Date(cotizacion.aprobada_at).toLocaleDateString()}
            </Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (cotizacion.estado === 'rechazada') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Cotización Rechazada</h2>
            <p className="text-slate-600">
              Hemos recibido tu respuesta. Nos pondremos en contacto contigo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Cotización de Reparación</CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  Orden: {ordenTrabajo.codigo_ot}
                </p>
              </div>
              <Badge variant="outline" className="text-lg">
                <Clock className="w-4 h-4 mr-2" />
                Esperando aprobación
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Detalle de Items */}
        <Card>
          <CardHeader>
            <CardTitle>Detalle de Servicios y Repuestos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cotizacion.items.map((item, index) => (
              <div key={index} className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
                {item.tipo === 'repuesto' ? (
                  <Package className="w-5 h-5 text-blue-600 mt-1" />
                ) : (
                  <Wrench className="w-5 h-5 text-emerald-600 mt-1" />
                )}
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-medium text-slate-900">{item.descripcion}</h4>
                    <span className="font-bold text-slate-900">
                      ${item.subtotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {item.cantidad} × ${item.precio_unitario.toFixed(2)}
                  </div>
                  <Badge variant="outline" className="mt-2">
                    {item.tipo}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Resumen de Costos */}
        <Card>
          <CardHeader>
            <CardTitle>Resumen de Costos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span>${cotizacion.subtotal.toFixed(2)}</span>
            </div>
            {cotizacion.descuento_total > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Descuento:</span>
                <span>-${cotizacion.descuento_total.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Impuestos:</span>
              <span>${cotizacion.impuesto.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-2xl font-bold text-slate-900 border-t pt-3">
              <span>Total:</span>
              <span className="text-emerald-600">${cotizacion.total.toFixed(2)}</span>
            </div>
            {cotizacion.valida_hasta && (
              <Alert className="mt-4">
                <Clock className="w-4 h-4" />
                <AlertDescription>
                  Esta cotización es válida hasta el{' '}
                  <strong>{new Date(cotizacion.valida_hasta).toLocaleDateString()}</strong>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Términos y Condiciones */}
        {terminosCondiciones && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Términos y Condiciones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-60 overflow-y-auto p-4 bg-slate-50 rounded-lg text-sm whitespace-pre-wrap">
                {terminosCondiciones.texto}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Aprobación */}
        {!showRechazo ? (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="acepta-terminos"
                  checked={aceptaTerminos}
                  onCheckedChange={setAceptaTerminos}
                  disabled={processing}
                />
                <Label htmlFor="acepta-terminos" className="cursor-pointer text-slate-900 leading-relaxed">
                  Acepto la cotización y los términos y condiciones. Autorizo el inicio de los trabajos detallados.
                </Label>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={aprobarCotizacion}
                  disabled={!aceptaTerminos || processing}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-blue-500 text-lg py-6"
                >
                  {processing ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                  )}
                  Aprobar Cotización
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowRechazo(true)}
                  disabled={processing}
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Rechazar
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="text-red-900">Rechazar Cotización</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  Lamentamos que no estés de acuerdo con la cotización. Por favor indícanos el motivo.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label>Motivo del rechazo</Label>
                <Textarea
                  value={motivoRechazo}
                  onChange={(e) => setMotivoRechazo(e.target.value)}
                  placeholder="Explica por qué rechazas esta cotización..."
                  rows={4}
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowRechazo(false)}
                  disabled={processing}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={rechazarCotizacion}
                  disabled={processing || !motivoRechazo.trim()}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  {processing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-2" />
                  )}
                  Confirmar Rechazo
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}