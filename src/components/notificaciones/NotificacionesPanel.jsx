import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, AlertCircle, Info, CheckCircle, Eye, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';

export default function NotificacionesPanel({ userAccount, compact = false }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: notificaciones = [] } = useQuery({
    queryKey: ['notificaciones', userAccount?.organization_id, userAccount?.user_id, userAccount?.role],
    queryFn: async () => {
      const all = await base44.entities.Notificacion.filter({
        organization_id: userAccount.organization_id,
        estado: 'pendiente'
      });
      
      // P1.4: Filtrar por usuario o rol + alinear con rol efectivo
      const filtered = all.filter(n => 
        (n.user_id && n.user_id === userAccount.user_id) ||
        (n.role_target && n.role_target === userAccount.role) ||
        (n.role_target === 'ORG_ADMIN' && ['ORG_ADMIN', 'BRANCH_ADMIN'].includes(userAccount.role)) ||
        (!n.user_id && !n.role_target)
      );

      // P1.4: Agrupar notificaciones repetidas
      const grouped = {};
      filtered.forEach(n => {
        if (n.mensaje.includes('pausada hace')) {
          const key = 'pausadas';
          if (!grouped[key]) {
            grouped[key] = { ...n, mensaje: `${filtered.filter(x => x.mensaje.includes('pausada hace')).length} OTs pausadas requieren atención`, count: 0 };
          }
          grouped[key].count++;
        } else if (n.mensaje.includes('sin movimiento')) {
          const key = 'sin_movimiento';
          if (!grouped[key]) {
            grouped[key] = { ...n, mensaje: `${filtered.filter(x => x.mensaje.includes('sin movimiento')).length} OTs sin movimiento reciente`, count: 0 };
          }
          grouped[key].count++;
        } else {
          grouped[n.id] = n;
        }
      });

      return Object.values(grouped);
    },
    enabled: !!userAccount?.organization_id,
    refetchInterval: 30000, // Refetch cada 30 segundos
    // P0.5: Defensas anti-loop
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: 25000, // 25 segundos (menor que interval)
    retry: false, // No reintentar en caso de 429
  });

  const marcarVistaMutation = useMutation({
    mutationFn: (id) => base44.entities.Notificacion.update(id, { estado: 'vista' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
    },
    retry: false, // P0.5: No reintentar
  });

  const marcarResueltaMutation = useMutation({
    mutationFn: (id) => base44.entities.Notificacion.update(id, { estado: 'resuelta' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
    },
    retry: false, // P0.5: No reintentar
  });

  const handleNavegar = (notif) => {
    if (notif.referencia_ot_id) {
      navigate(createPageUrl('OrdenesTrabajo'));
    }
    marcarVistaMutation.mutate(notif.id);
  };

  // P1.4: Clasificación con límite de críticas visibles (máx 5)
  const criticas = notificaciones.filter(n => n.tipo === 'critica').slice(0, 5);
  const importantes = notificaciones.filter(n => n.tipo === 'importante');
  const info = notificaciones.filter(n => n.tipo === 'info');

  const tipoConfig = {
    critica: { 
      color: 'bg-red-100 text-red-700 border-red-300', 
      icon: AlertCircle, 
      iconColor: 'text-red-600',
      label: 'Crítica'
    },
    importante: { 
      color: 'bg-orange-100 text-orange-700 border-orange-300', 
      icon: Bell, 
      iconColor: 'text-orange-600',
      label: 'Importante'
    },
    info: { 
      color: 'bg-blue-100 text-blue-700 border-blue-300', 
      icon: Info, 
      iconColor: 'text-blue-600',
      label: 'Info'
    }
  };

  if (compact) {
    return (
      <div className="relative">
        <Button 
          variant="outline" 
          size="sm"
          className="relative"
          onClick={() => navigate(createPageUrl('Dashboard'))}
        >
          <Bell className="w-4 h-4" />
          {notificaciones.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {notificaciones.length}
            </span>
          )}
        </Button>
      </div>
    );
  }

  if (notificaciones.length === 0) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="p-8 text-center">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
          <p className="text-slate-500">No hay notificaciones pendientes</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notificaciones
            </div>
            <div className="flex items-center gap-2">
              {criticas.length > 0 && (
                <Badge className="bg-red-100 text-red-700 border-0">
                  🔴 {criticas.length} Críticas
                </Badge>
              )}
              {importantes.length > 0 && (
                <Badge className="bg-orange-100 text-orange-700 border-0">
                  🟡 {importantes.length} Operativas
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-3">
          {/* Críticas primero */}
          {criticas.map((notif) => {
            const config = tipoConfig[notif.tipo];
            const Icon = config.icon;
            
            return (
              <div
                key={notif.id}
                className={`p-4 rounded-lg border-2 ${config.color} hover:shadow-md transition-all`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`w-6 h-6 ${config.iconColor} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Badge className={`${config.color} border-0`}>
                        {config.label}
                      </Badge>
                      <span className="text-xs text-slate-500 flex-shrink-0">
                        {formatDistanceToNow(new Date(notif.created_date), { addSuffix: true, locale: es })}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-900 mb-2">
                      {notif.mensaje}
                    </p>
                    {notif.accion_sugerida && (
                      <p className="text-xs text-slate-600 mb-3">
                        💡 {notif.accion_sugerida}
                      </p>
                    )}
                    <div className="flex gap-2">
                      {notif.referencia_ot_id && (
                        <Button
                          size="sm"
                          onClick={() => handleNavegar(notif)}
                          className="bg-slate-900 hover:bg-slate-800 text-xs"
                        >
                          Ver Orden
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => marcarResueltaMutation.mutate(notif.id)}
                        className="text-xs"
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Resolver
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Importantes */}
          {importantes.map((notif) => {
            const config = tipoConfig[notif.tipo];
            const Icon = config.icon;
            
            return (
              <div
                key={notif.id}
                className={`p-4 rounded-lg border ${config.color} hover:shadow-md transition-all`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Badge className={`${config.color} border-0 text-xs`}>
                        {config.label}
                      </Badge>
                      <span className="text-xs text-slate-500 flex-shrink-0">
                        {formatDistanceToNow(new Date(notif.created_date), { addSuffix: true, locale: es })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-900 mb-2">
                      {notif.mensaje}
                    </p>
                    {notif.accion_sugerida && (
                      <p className="text-xs text-slate-600 mb-3">
                        💡 {notif.accion_sugerida}
                      </p>
                    )}
                    <div className="flex gap-2">
                      {notif.referencia_ot_id && (
                        <Button
                          size="sm"
                          onClick={() => handleNavegar(notif)}
                          variant="outline"
                          className="text-xs"
                        >
                          Ver Orden
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => marcarResueltaMutation.mutate(notif.id)}
                        className="text-xs"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Descartar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Info */}
          {info.map((notif) => {
            const config = tipoConfig[notif.tipo];
            const Icon = config.icon;
            
            return (
              <div
                key={notif.id}
                className={`p-3 rounded-lg border ${config.color} hover:shadow-md transition-all`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`w-4 h-4 ${config.iconColor} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900">
                      {notif.mensaje}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-slate-500">
                        {formatDistanceToNow(new Date(notif.created_date), { addSuffix: true, locale: es })}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => marcarVistaMutation.mutate(notif.id)}
                        className="text-xs h-6 px-2"
                      >
                        <Eye className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}