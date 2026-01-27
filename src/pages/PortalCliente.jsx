import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Package, 
  Wrench,
  AlertCircle,
  Shield,
  Calendar,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { transicionarEstadoOT } from '@/components/ot/transicionarEstadoOT';

const estadoConfig = {
  EN_COLA_REVISION: { color: 'bg-slate-100 text-slate-700', label: 'En Cola de Revisión', icon: Clock },
  ASIGNADA: { color: 'bg-blue-100 text-blue-700', label: 'Asignada', icon: Clock },
  EN_REVISION: { color: 'bg-purple-100 text-purple-700', label: 'En Revisión', icon: Wrench },
  DIAGNOSTICADA: { color: 'bg-yellow-100 text-yellow-700', label: 'Diagnosticada - Esperando Aprobación', icon: AlertCircle },
  COTIZADA: { color: 'bg-orange-100 text-orange-700', label: 'Cotizada - Esperando Aprobación', icon: AlertCircle },
  EN_REPARACION: { color: 'bg-indigo-100 text-indigo-700', label: 'En Reparación', icon: Wrench },
  FINALIZADA: { color: 'bg-emerald-100 text-emerald-700', label: 'Finalizada', icon: CheckCircle },
  ENTREGADA: { color: 'bg-green-100 text-green-700', label: 'Entregada', icon: CheckCircle },
  CANCELADA: { color: 'bg-red-100 text-red-700', label: 'Cancelada', icon: XCircle },
};

export default function PortalCliente() {
  const [token, setToken] = useState('');
  const [showAprobarModal, setShowAprobarModal] = useState(false);
  const [showRechazarModal, setShowRechazarModal] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [tokenExpirado, setTokenExpirado] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Extraer token de URL
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      setToken(urlToken);
    }
  }, []);

  const { data: orden, isLoading, error } = useQuery({
    queryKey: ['orden-publica', token],
    queryFn: async () => {
      const ordenes = await base44.entities.OrdenTrabajo.filter({
        public_access_token: token
      });
      
      if (ordenes.length === 0) {
        throw new Error('Orden no encontrada');
      }

      const orden = ordenes[0];

      // P0-3: Validar expiración del token
      if (orden.public_access_expires_at) {
        const ahora = new Date();
        const expira = new Date(orden.public_access_expires_at);
        if (expira < ahora) {
          setTokenExpirado(true);
          throw new Error('Token expirado');
        }
      }

      // Registrar acceso solo si NO está expirado
      await base44.entities.OrdenTrabajo.update(orden.id, {
        public_last_viewed_at: new Date().toISOString()
      });

      return orden;
    },
    enabled: !!token,
    retry: false,
  });

  const { data: cliente } = useQuery({
    queryKey: ['cliente-publico', orden?.cliente_id],
    queryFn: () => base44.entities.Cliente.list(),
    enabled: !!orden?.cliente_id,
    select: (data) => data.find(c => c.id === orden.cliente_id),
  });

  const { data: equipo } = useQuery({
    queryKey: ['equipo-publico', orden?.equipo_id],
    queryFn: () => base44.entities.Equipo.list(),
    enabled: !!orden?.equipo_id,
    select: (data) => data.find(e => e.id === orden.equipo_id),
  });

  const { data: diagnostico } = useQuery({
    queryKey: ['diagnostico-publico', orden?.id],
    queryFn: async () => {
      const diagnosticos = await base44.entities.Diagnostico.filter({
        orden_trabajo_id: orden.id,
        estado_diagnostico: 'completado'
      });
      return diagnosticos[0];
    },
    enabled: !!orden?.id,
  });

  const { data: evidencias = [] } = useQuery({
    queryKey: ['evidencias-publicas', diagnostico?.id],
    queryFn: () => base44.entities.DiagnosticoEvidencia.filter({
      diagnostico_id: diagnostico.id
    }),
    enabled: !!diagnostico?.id,
  });

  const aprobarMutation = useMutation({
    mutationFn: async () => {
      // P0-3: Validación defensiva - NO permitir si token expirado
      if (orden.public_access_expires_at) {
        const ahora = new Date();
        const expira = new Date(orden.public_access_expires_at);
        if (expira < ahora) {
          throw new Error('El enlace ha expirado. Contacta al taller para un nuevo enlace.');
        }
      }

      // P0-003: usar helper centralizado para transición de estado
      await transicionarEstadoOT(orden.id, 'EN_REPARACION', {
        userId: 'portal_cliente',
        userEmail: 'portal_publico',
        organizationId: orden.organization_id,
        motivo: 'Cliente aprobó reparación desde portal público'
      });
      
      // Actualizar campos de aprobación del cliente (no gestionados por helper)
      await base44.entities.OrdenTrabajo.update(orden.id, {
        cliente_aprobado: true,
        cliente_aprobado_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orden-publica'] });
      setShowAprobarModal(false);
    },
  });

  const rechazarMutation = useMutation({
    mutationFn: async () => {
      // P0-3: Validación defensiva - NO permitir si token expirado
      if (orden.public_access_expires_at) {
        const ahora = new Date();
        const expira = new Date(orden.public_access_expires_at);
        if (expira < ahora) {
          throw new Error('El enlace ha expirado. Contacta al taller para un nuevo enlace.');
        }
      }

      // P0-004: usar helper centralizado para transición de estado
      await transicionarEstadoOT(orden.id, 'CANCELADA', {
        userId: 'portal_cliente',
        userEmail: 'portal_publico',
        organizationId: orden.organization_id,
        motivo: `Cliente rechazó reparación desde portal público: ${motivoRechazo || 'Sin motivo especificado'}`
      });
      
      // Actualizar campos de rechazo del cliente (no gestionados por helper)
      await base44.entities.OrdenTrabajo.update(orden.id, {
        cliente_aprobado: false,
        cliente_rechazo_motivo: motivoRechazo
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orden-publica'] });
      setShowRechazarModal(false);
    },
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-0 shadow-2xl">
          <CardContent className="p-12 text-center">
            <Shield className="w-16 h-16 mx-auto mb-6 text-slate-400" />
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Acceso Restringido</h1>
            <p className="text-slate-600">
              Por favor, utilice el enlace único enviado por su técnico para acceder al estado de su equipo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Cargando información...</p>
        </div>
      </div>
    );
  }

  if (error || !orden) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-0 shadow-2xl">
          <CardContent className="p-12 text-center">
            <XCircle className="w-16 h-16 mx-auto mb-6 text-red-500" />
            <h1 className="text-2xl font-bold text-slate-900 mb-3">
              {tokenExpirado ? 'Enlace Expirado' : 'Orden No Encontrada'}
            </h1>
            <p className="text-slate-600">
              {tokenExpirado 
                ? 'Este enlace ha expirado. Por favor, contacta al taller para obtener un nuevo enlace de acceso.' 
                : 'El enlace puede haber expirado o no es válido. Contacte a su técnico para obtener un nuevo enlace.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const config = estadoConfig[orden.estado] || estadoConfig.EN_COLA_REVISION;
  const Icon = config.icon;
  
  // P0-3: Verificar expiración antes de permitir aprobación
  const linkExpirado = orden.public_access_expires_at && new Date(orden.public_access_expires_at) < new Date();
  const puedeAprobar = (orden.estado === 'DIAGNOSTICADA' || orden.estado === 'COTIZADA') && 
                       orden.cliente_aprobado === undefined &&
                       !linkExpirado;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card className="border-0 shadow-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <CardContent className="p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                <Package className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Estado de tu Equipo</h1>
                <p className="text-blue-100">Consulta el progreso de tu reparación</p>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-4 border-t border-white/20">
              <Icon className="w-6 h-6" />
              <span className="text-xl font-semibold">{config.label}</span>
            </div>
          </CardContent>
        </Card>

        {/* Información del Cliente y Equipo */}
        <Card className="border-0 shadow-xl">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-slate-500 text-sm">Cliente</Label>
                <p className="font-bold text-lg text-slate-900">{cliente?.nombre_completo}</p>
                <p className="text-sm text-slate-600">{cliente?.telefono}</p>
              </div>
              <div>
                <Label className="text-slate-500 text-sm">Equipo</Label>
                <p className="font-bold text-lg text-slate-900">
                  {equipo?.marca} {equipo?.modelo}
                </p>
                {equipo?.serie && <p className="text-sm text-slate-600">Serie: {equipo.serie}</p>}
              </div>
              <div>
                <Label className="text-slate-500 text-sm">Motivo de Ingreso</Label>
                <p className="text-slate-900">{orden.motivo_ingreso}</p>
              </div>
              <div>
                <Label className="text-slate-500 text-sm">Fecha de Ingreso</Label>
                <p className="text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {format(new Date(orden.fecha_ingreso || orden.created_date), "dd 'de' MMMM, yyyy", { locale: es })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Línea de Tiempo */}
        <Card className="border-0 shadow-xl">
          <CardContent className="p-6">
            <h3 className="font-bold text-lg text-slate-900 mb-6">Progreso</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">Ingreso Recibido</p>
                  <p className="text-sm text-slate-600">
                    {format(new Date(orden.fecha_ingreso || orden.created_date), "dd/MM/yyyy HH:mm", { locale: es })}
                  </p>
                </div>
              </div>

              {orden.fecha_revision_inicio && (
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">Revisión Iniciada</p>
                    <p className="text-sm text-slate-600">
                      {format(new Date(orden.fecha_revision_inicio), "dd/MM/yyyy HH:mm", { locale: es })}
                    </p>
                  </div>
                </div>
              )}

              {orden.fecha_diagnostico && (
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">Diagnóstico Completado</p>
                    <p className="text-sm text-slate-600">
                      {format(new Date(orden.fecha_diagnostico), "dd/MM/yyyy HH:mm", { locale: es })}
                    </p>
                  </div>
                </div>
              )}

              {orden.estado === 'EN_REPARACION' && (
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center animate-pulse">
                    <Wrench className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">En Reparación</p>
                    <p className="text-sm text-slate-600">Trabajando en tu equipo</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Diagnóstico */}
        {diagnostico && (
          <>
            <Card className="border-0 shadow-xl">
              <CardContent className="p-6">
                <h3 className="font-bold text-lg text-slate-900 mb-4">Diagnóstico</h3>
                
                <div className="space-y-4">
                  <div>
                    <Label className="text-slate-500 text-sm">Resumen</Label>
                    <p className="text-slate-900 mt-1">{diagnostico.resumen_cliente}</p>
                  </div>

                  {diagnostico.nivel_riesgo && (
                    <div>
                      <Label className="text-slate-500 text-sm">Nivel de Urgencia</Label>
                      <div className="mt-1">
                        <Badge className={`${
                          diagnostico.nivel_riesgo === 'critico' ? 'bg-red-100 text-red-700' :
                          diagnostico.nivel_riesgo === 'alto' ? 'bg-orange-100 text-orange-700' :
                          diagnostico.nivel_riesgo === 'medio' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        } border-0 capitalize`}>
                          {diagnostico.nivel_riesgo}
                        </Badge>
                      </div>
                    </div>
                  )}

                  {diagnostico.propuesta_precio_total && (
                    <div className="p-6 bg-gradient-to-br from-emerald-50 to-blue-50 rounded-xl border-2 border-emerald-200">
                      <Label className="text-slate-700 text-sm font-semibold">Costo Estimado</Label>
                      <p className="text-4xl font-bold text-emerald-600 mt-2">
                        ₡{diagnostico.propuesta_precio_total.toLocaleString()}
                      </p>
                      {diagnostico.propuesta_precio_detalle && (
                        <div className="mt-4 space-y-2">
                          {diagnostico.propuesta_precio_detalle.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-slate-700">{item.descripcion}</span>
                              <span className="font-semibold">₡{item.subtotal.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Evidencias */}
            {evidencias.length > 0 && (
              <Card className="border-0 shadow-xl">
                <CardContent className="p-6">
                  <h3 className="font-bold text-lg text-slate-900 mb-4">Evidencias</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {evidencias.map((ev, idx) => (
                      <div key={idx}>
                        {ev.tipo === 'foto' ? (
                          <div className="relative group">
                            <img 
                              src={ev.url} 
                              alt="Evidencia" 
                              className="w-full h-48 object-cover rounded-lg shadow-md"
                            />
                            {ev.descripcion && (
                              <p className="text-sm text-slate-600 mt-2">{ev.descripcion}</p>
                            )}
                          </div>
                        ) : (
                          <div className="p-4 bg-slate-50 rounded-lg">
                            <p className="text-sm text-slate-700">{ev.contenido_texto}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Enlace Expirado */}
        {linkExpirado && (orden.estado === 'DIAGNOSTICADA' || orden.estado === 'COTIZADA') && !orden.cliente_aprobado && (
          <Card className="border-0 shadow-xl bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-300">
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-600" />
              <h3 className="font-bold text-xl text-slate-900 mb-2">Enlace Expirado</h3>
              <p className="text-slate-700">
                Este enlace de acceso ha expirado. Por favor, contacta al taller para obtener un nuevo enlace y poder aprobar o rechazar la reparación.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Aprobación */}
        {puedeAprobar && (
          <Card className="border-0 shadow-xl bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-200">
            <CardContent className="p-8">
              <div className="flex items-start gap-4 mb-6">
                <AlertCircle className="w-8 h-8 text-orange-600 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-xl text-slate-900 mb-2">Decisión Requerida</h3>
                  <p className="text-slate-700">
                    Por favor, revise el diagnóstico y costo estimado. ¿Desea autorizar la reparación de su equipo?
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={() => setShowAprobarModal(true)}
                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:shadow-lg h-14 text-lg"
                >
                  <ThumbsUp className="w-5 h-5 mr-2" />
                  Autorizar Reparación
                </Button>
                <Button
                  onClick={() => setShowRechazarModal(true)}
                  variant="outline"
                  className="flex-1 border-2 border-red-300 text-red-700 hover:bg-red-50 h-14 text-lg"
                >
                  <ThumbsDown className="w-5 h-5 mr-2" />
                  Rechazar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Estado de Aprobación */}
        {orden.cliente_aprobado === true && (
          <Card className="border-0 shadow-xl bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200">
            <CardContent className="p-8 text-center">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-600" />
              <h3 className="font-bold text-2xl text-slate-900 mb-2">Reparación Autorizada</h3>
              <p className="text-slate-700">
                Has autorizado la reparación el {format(new Date(orden.cliente_aprobado_at), "dd 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
              </p>
              <p className="text-sm text-slate-600 mt-2">
                Nuestro equipo está trabajando en tu equipo. Te notificaremos cuando esté listo.
              </p>
            </CardContent>
          </Card>
        )}

        {orden.cliente_aprobado === false && (
          <Card className="border-0 shadow-xl bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200">
            <CardContent className="p-8 text-center">
              <XCircle className="w-16 h-16 mx-auto mb-4 text-red-600" />
              <h3 className="font-bold text-2xl text-slate-900 mb-2">Reparación Rechazada</h3>
              <p className="text-slate-700">
                Has rechazado la reparación. Puedes recoger tu equipo cuando lo desees.
              </p>
              {orden.cliente_rechazo_motivo && (
                <p className="text-sm text-slate-600 mt-2">
                  Motivo: {orden.cliente_rechazo_motivo}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-slate-500 py-6">
          <p>Este enlace es privado y único para tu orden</p>
          <p>Para cualquier consulta, contacta a tu técnico</p>
        </div>
      </div>

      {/* Modal Aprobar */}
      <Dialog open={showAprobarModal} onOpenChange={setShowAprobarModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-600" />
              Confirmar Autorización
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <p className="text-slate-700">
              Al autorizar, confirmas que:
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-slate-600">
              <li>Has revisado el diagnóstico y costo estimado</li>
              <li>Autorizas el inicio de la reparación</li>
              <li>Aceptas el costo de <strong className="text-emerald-600">₡{diagnostico?.propuesta_precio_total?.toLocaleString()}</strong></li>
            </ul>

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => setShowAprobarModal(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => aprobarMutation.mutate()}
                disabled={aprobarMutation.isPending}
                className="bg-gradient-to-r from-green-500 to-emerald-500"
              >
                {aprobarMutation.isPending ? 'Procesando...' : 'Confirmar Autorización'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Rechazar */}
      <Dialog open={showRechazarModal} onOpenChange={setShowRechazarModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <XCircle className="w-8 h-8 text-red-600" />
              Rechazar Reparación
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <p className="text-slate-700">
              ¿Estás seguro de que deseas rechazar la reparación?
            </p>

            <div className="space-y-2">
              <Label>Motivo (opcional)</Label>
              <Textarea
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                placeholder="Ej: Costo muy alto, quiero una segunda opinión, etc."
                rows={3}
              />
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => setShowRechazarModal(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => rechazarMutation.mutate()}
                disabled={rechazarMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {rechazarMutation.isPending ? 'Procesando...' : 'Confirmar Rechazo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}