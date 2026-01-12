import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Shield, 
  XCircle, 
  CheckCircle2, 
  Clock, 
  Calendar,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const estadoConfig = {
  ACTIVA: { 
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200', 
    label: 'Garantía Vigente', 
    icon: CheckCircle2,
    alertClass: 'bg-emerald-50 border-emerald-200'
  },
  VENCIDA: { 
    color: 'bg-amber-100 text-amber-700 border-amber-200', 
    label: 'Garantía Vencida', 
    icon: Clock,
    alertClass: 'bg-amber-50 border-amber-200'
  },
  ANULADA: { 
    color: 'bg-red-100 text-red-700 border-red-200', 
    label: 'Garantía Anulada', 
    icon: XCircle,
    alertClass: 'bg-red-50 border-red-200'
  },
};

export default function PortalGarantia() {
  const [token, setToken] = useState('');

  useEffect(() => {
    // Extraer token de URL
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      setToken(urlToken);
    }
  }, []);

  const { data: garantia, isLoading, error } = useQuery({
    queryKey: ['garantia-publica', token],
    queryFn: async () => {
      const garantias = await base44.entities.Garantia.filter({
        public_access_token: token
      });
      
      if (garantias.length === 0) {
        throw new Error('Garantía no encontrada');
      }

      return garantias[0];
    },
    enabled: !!token,
    retry: false,
  });

  const { data: cliente } = useQuery({
    queryKey: ['cliente-garantia', garantia?.cliente_id],
    queryFn: () => base44.entities.Cliente.list(),
    enabled: !!garantia?.cliente_id,
    select: (data) => data.find(c => c.id === garantia.cliente_id),
  });

  const { data: organization } = useQuery({
    queryKey: ['org-garantia', garantia?.organization_id],
    queryFn: async () => {
      const orgs = await base44.entities.Organization.list();
      return orgs.find(o => o.id === garantia.organization_id);
    },
    enabled: !!garantia?.organization_id,
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-0 shadow-2xl">
          <CardContent className="p-12 text-center">
            <Shield className="w-16 h-16 mx-auto mb-6 text-slate-400" />
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Acceso Restringido</h1>
            <p className="text-slate-600">
              Por favor, utilice el enlace único enviado para acceder a su certificado de garantía.
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
          <p className="text-slate-600">Cargando certificado...</p>
        </div>
      </div>
    );
  }

  if (error || !garantia) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-0 shadow-2xl">
          <CardContent className="p-12 text-center">
            <XCircle className="w-16 h-16 mx-auto mb-6 text-red-500" />
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Garantía No Encontrada</h1>
            <p className="text-slate-600">
              El enlace puede haber expirado o no es válido. Contacte al taller para obtener un nuevo certificado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const config = estadoConfig[garantia.estado] || estadoConfig.ACTIVA;
  const Icon = config.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card className="border-0 shadow-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <CardContent className="p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                <Shield className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Certificado de Garantía</h1>
                <p className="text-blue-100">Documento de respaldo de servicio</p>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-4 border-t border-white/20">
              <Icon className="w-6 h-6" />
              <span className="text-xl font-semibold">{config.label}</span>
            </div>
          </CardContent>
        </Card>

        {/* Información del Cliente */}
        <Card className="border-0 shadow-xl">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-slate-500 text-sm">Cliente</Label>
                <p className="font-bold text-lg text-slate-900">{cliente?.nombre_completo || 'Cargando...'}</p>
                {cliente?.telefono && <p className="text-sm text-slate-600">{cliente.telefono}</p>}
              </div>
              <div>
                <Label className="text-slate-500 text-sm">Tipo de Origen</Label>
                <Badge variant="outline" className="text-sm">
                  {garantia.origen_tipo === 'OT' ? 'Orden de Trabajo' : 'Venta'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fechas y Vigencia */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg">Vigencia de la Garantía</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <Label className="text-slate-500 text-sm">Fecha de Emisión</Label>
                <p className="text-slate-900 flex items-center gap-2 mt-1">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {format(new Date(garantia.fecha_emision), "dd 'de' MMMM, yyyy", { locale: es })}
                </p>
              </div>
              <div>
                <Label className="text-slate-500 text-sm">Vigencia Desde</Label>
                <p className="text-slate-900 flex items-center gap-2 mt-1">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {format(new Date(garantia.fecha_inicio), "dd 'de' MMMM, yyyy", { locale: es })}
                </p>
              </div>
              <div>
                <Label className="text-slate-500 text-sm">Vigencia Hasta</Label>
                <p className="text-slate-900 flex items-center gap-2 mt-1">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {format(new Date(garantia.fecha_fin), "dd 'de' MMMM, yyyy", { locale: es })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estado Visual */}
        <Alert className={`border-2 ${config.alertClass}`}>
          <Icon className="w-5 h-5" />
          <AlertDescription className="text-base font-medium">
            {garantia.estado === 'ACTIVA' && 'Esta garantía está vigente y cubre los servicios especificados.'}
            {garantia.estado === 'VENCIDA' && 'Esta garantía ha expirado según las fechas establecidas.'}
            {garantia.estado === 'ANULADA' && 'Esta garantía ha sido anulada y no se encuentra vigente.'}
          </AlertDescription>
        </Alert>

        {/* Texto Legal (Snapshot) */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              Condiciones de la Garantía
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
              <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">
                {garantia.texto_snapshot}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Footer - Información del Taller */}
        <Card className="border-0 shadow-xl bg-slate-50">
          <CardContent className="p-6 text-center">
            <div className="text-sm text-slate-600 space-y-2">
              <p className="font-semibold text-slate-900 text-base">
                Emitido por: {organization?.name || 'Taller de Reparaciones'}
              </p>
              <p>Este documento es válido como certificado de garantía</p>
              <p>Conserve este enlace para consultas futuras</p>
            </div>
          </CardContent>
        </Card>

        {/* Footer Legal */}
        <div className="text-center text-xs text-slate-500 py-4">
          <p>Este enlace es privado y único para su garantía</p>
          <p>Documento generado el {format(new Date(garantia.created_date), "dd/MM/yyyy 'a las' HH:mm", { locale: es })}</p>
        </div>
      </div>
    </div>
  );
}