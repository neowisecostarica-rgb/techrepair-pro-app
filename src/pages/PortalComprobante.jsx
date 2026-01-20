import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  FileText, 
  XCircle, 
  CheckCircle2, 
  Calendar,
  Printer,
  Download,
  Shield
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function PortalComprobante() {
  const [token, setToken] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      setToken(urlToken);
    }
  }, []);

  const { data: venta, isLoading, error } = useQuery({
    queryKey: ['venta-publica', token],
    queryFn: async () => {
      const ventas = await base44.entities.Venta.filter({
        public_access_token: token
      });
      
      if (ventas.length === 0) {
        throw new Error('Comprobante no encontrado');
      }

      return ventas[0];
    },
    enabled: !!token,
    retry: false,
  });

  const { data: cliente } = useQuery({
    queryKey: ['cliente-comprobante', venta?.cliente_id],
    queryFn: () => base44.entities.Cliente.list(),
    enabled: !!venta?.cliente_id,
    select: (data) => data.find(c => c.id === venta.cliente_id),
  });

  const { data: items = [] } = useQuery({
    queryKey: ['venta-items-publico', venta?.id],
    queryFn: () => base44.entities.VentaItem.filter({
      venta_id: venta.id
    }),
    enabled: !!venta?.id,
  });

  const { data: organization } = useQuery({
    queryKey: ['org-comprobante', venta?.organization_id],
    queryFn: async () => {
      const orgs = await base44.entities.Organization.list();
      return orgs.find(o => o.id === venta.organization_id);
    },
    enabled: !!venta?.organization_id,
  });

  const { data: garantia } = useQuery({
    queryKey: ['garantia-comprobante', venta?.id],
    queryFn: async () => {
      const garantias = await base44.entities.Garantia.filter({
        origen_tipo: 'VENTA',
        origen_id: venta.id
      });
      return garantias[0];
    },
    enabled: !!venta?.id,
  });

  const { data: ordenTrabajo } = useQuery({
    queryKey: ['ot-comprobante', venta?.referencia_ot_id],
    queryFn: async () => {
      const ots = await base44.entities.OrdenTrabajo.filter({ id: venta.referencia_ot_id });
      return ots[0];
    },
    enabled: !!venta?.referencia_ot_id,
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-0 shadow-2xl">
          <CardContent className="p-12 text-center">
            <FileText className="w-16 h-16 mx-auto mb-6 text-slate-400" />
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Acceso Restringido</h1>
            <p className="text-slate-600">
              Por favor, utilice el enlace único enviado para acceder a su comprobante de venta.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Cargando comprobante...</p>
        </div>
      </div>
    );
  }

  if (error || !venta) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-0 shadow-2xl">
          <CardContent className="p-12 text-center">
            <XCircle className="w-16 h-16 mx-auto mb-6 text-red-500" />
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Comprobante No Encontrado</h1>
            <p className="text-slate-600">
              El enlace puede haber expirado o no es válido.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const urlGarantia = garantia 
    ? `${window.location.origin}/PortalGarantia?token=${garantia.public_access_token}`
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card className="border-0 shadow-2xl bg-gradient-to-r from-emerald-600 to-blue-600 text-white">
          <CardContent className="p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Comprobante de Venta</h1>
                <p className="text-emerald-100">{organization?.name || 'Taller de Reparaciones'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-4 border-t border-white/20">
              <CheckCircle2 className="w-6 h-6" />
              <span className="text-xl font-semibold">Venta Pagada</span>
            </div>
          </CardContent>
        </Card>

        {/* Información de Venta */}
        <Card className="border-0 shadow-xl">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-slate-500">Fecha</p>
                <p className="font-medium text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {format(new Date(venta.created_date), "dd 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Método de Pago</p>
                <Badge className="capitalize mt-1">{venta.metodo_pago}</Badge>
              </div>
              {ordenTrabajo && (
                <div>
                  <p className="text-sm text-slate-500">Orden de Trabajo</p>
                  <p className="font-medium text-slate-900">{ordenTrabajo.codigo_ot}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cliente */}
        {cliente && (
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg">Cliente</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium text-slate-900">{cliente.nombre_completo}</p>
              <p className="text-sm text-slate-600">{cliente.telefono}</p>
              {cliente.email && <p className="text-sm text-slate-600">{cliente.email}</p>}
            </CardContent>
          </Card>
        )}

        {/* Detalle de Items */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg">Detalle del Servicio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{item.descripcion}</p>
                    <p className="text-sm text-slate-500">Cantidad: {item.cantidad}</p>
                  </div>
                  <p className="font-semibold text-slate-900">₡{item.subtotal.toLocaleString()}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-slate-200 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Subtotal:</span>
                <span className="font-medium">₡{venta.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">IVA (13%):</span>
                <span className="font-medium">₡{venta.impuesto.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span>TOTAL:</span>
                <span className="text-emerald-600">₡{venta.total.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Garantía */}
        {garantia && (
          <Card className="border-2 border-indigo-200 bg-indigo-50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-indigo-900">
                <Shield className="w-5 h-5" />
                Garantía Incluida
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700 mb-4">
                Esta compra incluye garantía válida hasta el{' '}
                <strong>{format(new Date(garantia.fecha_fin), "dd 'de' MMMM, yyyy", { locale: es })}</strong>
              </p>
              {urlGarantia && (
                <Button asChild variant="outline" className="w-full border-indigo-300 text-indigo-700">
                  <a href={urlGarantia} target="_blank" rel="noopener noreferrer">
                    Ver Certificado de Garantía
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Acciones */}
        <div className="flex gap-3 print:hidden">
          <Button onClick={() => window.print()} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
        </div>

        {/* Footer */}
        <Card className="border-0 shadow-xl bg-slate-50">
          <CardContent className="p-6 text-center">
            <div className="text-sm text-slate-600 space-y-2">
              <p className="font-semibold text-slate-900 text-base">
                {organization?.name || 'Taller de Reparaciones'}
              </p>
              {organization?.telefono_negocio && (
                <p>📞 {organization.telefono_negocio}</p>
              )}
              <p className="mt-4">Conserve este comprobante para hacer válida la garantía</p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-xs text-slate-500 py-4">
          <p>Este enlace es privado y único para su comprobante</p>
        </div>
      </div>

      <style jsx>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}