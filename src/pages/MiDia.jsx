import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Play, 
  Pause, 
  Clock, 
  AlertCircle, 
  CheckCircle,
  ArrowRight,
  Zap
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import WizardDiagnostico from '@/components/diagnostico/WizardDiagnostico';
import NotificacionesPanel from '@/components/notificaciones/NotificacionesPanel';
import { useNotificacionesAutomaticas } from '@/components/notificaciones/useNotificacionesAutomaticas';
import { useUserAccount } from '@/components/hooks/useOrgData';

export default function MiDia() {
  const [user, setUser] = useState(null);
  const { userAccount } = useUserAccount();
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedOT, setSelectedOT] = useState(null);
  const [motivoPausa, setMotivoPausa] = useState('interrupcion');
  const [observacionesPausa, setObservacionesPausa] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: ordenes = [] } = useQuery({
    queryKey: ['mis-ordenes', user?.id],
    queryFn: () => base44.entities.OrdenTrabajo.filter({
      tecnico_asignado_id: user.id
    }),
    enabled: !!user?.id,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const { data: equipos = [] } = useQuery({
    queryKey: ['equipos'],
    queryFn: () => base44.entities.Equipo.list(),
  });

  const updateOTMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.OrdenTrabajo.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mis-ordenes'] });
      setShowPauseModal(false);
      setObservacionesPausa('');
    },
  });

  const ordenActiva = ordenes.find(o => o.estado_atencion === 'ACTIVO');
  const ordenesPausadas = ordenes
    .filter(o => o.estado_atencion === 'PAUSADO')
    .sort((a, b) => {
      // Ordenar por prioridad DESC, luego por tiempo pausado DESC
      const prioridadOrden = { urgente: 4, high: 3, normal: 2, low: 1 };
      const prioA = prioridadOrden[a.prioridad] || 0;
      const prioB = prioridadOrden[b.prioridad] || 0;
      
      if (prioA !== prioB) return prioB - prioA;
      
      return new Date(a.ultima_actividad_at || a.created_date) - new Date(b.ultima_actividad_at || b.created_date);
    });
  
  const ordenesEsperando = ordenes.filter(o => o.estado_atencion === 'ESPERANDO');

  const getClienteName = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || 'Cliente desconocido';
  };

  const getEquipoInfo = (equipoId) => {
    const equipo = equipos.find(e => e.id === equipoId);
    return equipo ? `${equipo.marca} ${equipo.modelo}` : 'Equipo desconocido';
  };

  const handlePausar = () => {
    if (!ordenActiva) return;
    setShowPauseModal(true);
  };

  const confirmPausar = () => {
    if (!ordenActiva) return;
    
    updateOTMutation.mutate({
      id: ordenActiva.id,
      data: {
        estado_atencion: 'PAUSADO',
        motivo_pausa: motivoPausa,
        ultima_actividad: observacionesPausa || 'Trabajo pausado',
        ultima_actividad_at: new Date().toISOString()
      }
    });
  };

  const handleRetomar = (orden) => {
    if (ordenActiva && ordenActiva.id !== orden.id) {
      if (confirm('Ya tienes un trabajo activo. ¿Pausar el actual y retomar este?')) {
        // Pausar actual primero
        updateOTMutation.mutate({
          id: ordenActiva.id,
          data: {
            estado_atencion: 'PAUSADO',
            motivo_pausa: 'interrupcion',
            ultima_actividad: 'Trabajo pausado automáticamente',
            ultima_actividad_at: new Date().toISOString()
          }
        }, {
          onSuccess: () => {
            // Luego activar nuevo
            activarOrden(orden);
          }
        });
      }
    } else {
      activarOrden(orden);
    }
  };

  const activarOrden = (orden) => {
    updateOTMutation.mutate({
      id: orden.id,
      data: {
        estado_atencion: 'ACTIVO',
        ultima_actividad: 'Trabajo retomado',
        ultima_actividad_at: new Date().toISOString()
      }
    });
  };

  const handleIniciarDiagnostico = (orden) => {
    if (orden.estado !== 'EN_REVISION') {
      alert('Esta orden debe estar en estado EN_REVISION para iniciar el diagnóstico');
      return;
    }
    setSelectedOT(orden);
    setShowWizard(true);
  };

  const motivoPausaLabels = {
    esperando_repuesto: 'Esperando Repuesto',
    esperando_cliente: 'Esperando Cliente',
    interrupcion: 'Interrupción',
    otro: 'Otro'
  };

  // Generar notificaciones automáticas
  useNotificacionesAutomaticas(userAccount);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Mi Día</h1>
        <p className="text-slate-500">Gestión de trabajos asignados</p>
      </div>

      {/* Notificaciones */}
      <NotificacionesPanel userAccount={userAccount} />

      {/* Sección ACTIVO */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
          <h2 className="text-xl font-bold text-slate-900">ACTIVO</h2>
          <Badge variant="outline" className="ml-auto">1 máximo</Badge>
        </div>

        {ordenActiva ? (
          <Card className="border-2 border-red-500 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl flex items-center justify-center text-white font-bold">
                      <Zap className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">{ordenActiva.motivo_ingreso}</h3>
                      <p className="text-sm text-slate-500">
                        {getClienteName(ordenActiva.cliente_id)} • {getEquipoInfo(ordenActiva.equipo_id)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <Badge className="bg-red-100 text-red-700 border-0">
                      {ordenActiva.estado}
                    </Badge>
                    <Badge className={`${
                      ordenActiva.prioridad === 'urgente' ? 'bg-red-100 text-red-700' :
                      ordenActiva.prioridad === 'high' ? 'bg-orange-100 text-orange-700' :
                      'bg-slate-100 text-slate-700'
                    } border-0 capitalize`}>
                      {ordenActiva.prioridad}
                    </Badge>
                  </div>

                  {ordenActiva.ultima_actividad && (
                    <div className="text-sm text-slate-600 mb-4">
                      <p className="font-medium">Última actividad:</p>
                      <p>{ordenActiva.ultima_actividad}</p>
                      <p className="text-xs text-slate-400">
                        {formatDistanceToNow(new Date(ordenActiva.ultima_actividad_at), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {ordenActiva.estado === 'EN_REVISION' && (
                    <Button
                      onClick={() => handleIniciarDiagnostico(ordenActiva)}
                      className="bg-gradient-to-r from-purple-500 to-blue-500"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Continuar Diagnóstico
                    </Button>
                  )}
                  <Button
                    onClick={handlePausar}
                    variant="outline"
                    className="border-orange-500 text-orange-700 hover:bg-orange-50"
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    Pausar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-2 border-dashed border-slate-300">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500 mb-2">No hay trabajo activo</p>
              <p className="text-sm text-slate-400">Retoma un trabajo pausado para comenzar</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sección PAUSADOS */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
          <h2 className="text-xl font-bold text-slate-900">PAUSADOS</h2>
          <Badge variant="outline" className="ml-auto">{ordenesPausadas.length}</Badge>
        </div>

        <div className="grid gap-4">
          {ordenesPausadas.map((orden, index) => (
            <Card 
              key={orden.id} 
              className={`border-0 shadow-md hover:shadow-xl transition-all ${
                index === 0 ? 'ring-2 ring-yellow-400' : ''
              }`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {index === 0 && (
                      <Badge className="bg-yellow-100 text-yellow-700 border-0 mb-3">
                        ⭐ Sugerido para retomar
                      </Badge>
                    )}
                    
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center text-white font-bold">
                        <Pause className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">{orden.motivo_ingreso}</h3>
                        <p className="text-sm text-slate-500">
                          {getClienteName(orden.cliente_id)} • {getEquipoInfo(orden.equipo_id)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge className="bg-slate-100 text-slate-700 border-0">
                        {orden.estado}
                      </Badge>
                      <Badge className={`${
                        orden.prioridad === 'urgente' ? 'bg-red-100 text-red-700' :
                        orden.prioridad === 'high' ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-700'
                      } border-0 capitalize`}>
                        {orden.prioridad}
                      </Badge>
                      {orden.motivo_pausa && (
                        <Badge variant="outline">
                          {motivoPausaLabels[orden.motivo_pausa]}
                        </Badge>
                      )}
                    </div>

                    {orden.ultima_actividad && (
                      <div className="text-sm text-slate-600">
                        <p className="font-medium">Última actividad:</p>
                        <p>{orden.ultima_actividad}</p>
                        <p className="text-xs text-slate-400">
                          Pausado hace {formatDistanceToNow(new Date(orden.ultima_actividad_at), { locale: es })}
                        </p>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={() => handleRetomar(orden)}
                    className="bg-gradient-to-r from-emerald-500 to-blue-500"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Retomar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {ordenesPausadas.length === 0 && (
            <Card className="border-0 shadow-md">
              <CardContent className="p-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
                <p className="text-slate-500">No hay trabajos pausados</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Sección ESPERANDO */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <h2 className="text-xl font-bold text-slate-900">ESPERANDO</h2>
          <Badge variant="outline" className="ml-auto">{ordenesEsperando.length}</Badge>
        </div>

        <div className="grid gap-4">
          {ordenesEsperando.map((orden) => (
            <Card key={orden.id} className="border-0 shadow-md opacity-75">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center text-white font-bold">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">{orden.motivo_ingreso}</h3>
                        <p className="text-sm text-slate-500">
                          {getClienteName(orden.cliente_id)} • {getEquipoInfo(orden.equipo_id)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge className="bg-blue-100 text-blue-700 border-0">
                        Bloqueado
                      </Badge>
                      {orden.motivo_pausa && (
                        <Badge variant="outline">
                          {motivoPausaLabels[orden.motivo_pausa]}
                        </Badge>
                      )}
                    </div>

                    {orden.ultima_actividad && (
                      <p className="text-sm text-slate-600">{orden.ultima_actividad}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {ordenesEsperando.length === 0 && (
            <Card className="border-0 shadow-md">
              <CardContent className="p-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-blue-500" />
                <p className="text-slate-500">No hay trabajos en espera</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal Pausar */}
      <Dialog open={showPauseModal} onOpenChange={setShowPauseModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pausar Trabajo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Motivo de la pausa</Label>
              <Select value={motivoPausa} onValueChange={setMotivoPausa}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="esperando_repuesto">Esperando Repuesto</SelectItem>
                  <SelectItem value="esperando_cliente">Esperando Cliente</SelectItem>
                  <SelectItem value="interrupcion">Interrupción</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Observaciones (opcional)</Label>
              <Textarea
                value={observacionesPausa}
                onChange={(e) => setObservacionesPausa(e.target.value)}
                placeholder="Describe el estado actual del trabajo..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => setShowPauseModal(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmPausar} className="bg-orange-500 hover:bg-orange-600">
                Pausar Trabajo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wizard Diagnóstico */}
      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <WizardDiagnostico
            ordenTrabajo={selectedOT}
            onClose={() => {
              setShowWizard(false);
              setSelectedOT(null);
            }}
            onComplete={() => {
              setShowWizard(false);
              setSelectedOT(null);
              queryClient.invalidateQueries({ queryKey: ['mis-ordenes'] });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}