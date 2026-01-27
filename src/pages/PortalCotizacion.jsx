import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  FileText, 
  XCircle, 
  CheckCircle2, 
  Clock, 
  Calendar,
  AlertCircle,
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import jsPDF from 'jspdf';

const estadoConfig = {
  borrador: { 
    color: 'bg-slate-100 text-slate-700 border-slate-200', 
    label: 'Borrador', 
    icon: FileText,
    alertClass: 'bg-slate-50 border-slate-200'
  },
  enviada: { 
    color: 'bg-blue-100 text-blue-700 border-blue-200', 
    label: 'Enviada', 
    icon: Clock,
    alertClass: 'bg-blue-50 border-blue-200'
  },
  aprobada: { 
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200', 
    label: 'Aprobada', 
    icon: CheckCircle2,
    alertClass: 'bg-emerald-50 border-emerald-200'
  },
  rechazada: { 
    color: 'bg-red-100 text-red-700 border-red-200', 
    label: 'Rechazada', 
    icon: XCircle,
    alertClass: 'bg-red-50 border-red-200'
  },
  vencida: { 
    color: 'bg-orange-100 text-orange-700 border-orange-200', 
    label: 'Vencida', 
    icon: Clock,
    alertClass: 'bg-orange-50 border-orange-200'
  },
};

export default function PortalCotizacion() {
  const [token, setToken] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      setToken(urlToken);
    }
  }, []);

  const { data: cotizacion, isLoading, error } = useQuery({
    queryKey: ['cotizacion-publica', token],
    queryFn: async () => {
      const cotizaciones = await base44.entities.Cotizacion.filter({
        public_access_token: token
      });
      
      if (cotizaciones.length === 0) {
        throw new Error('Cotización no encontrada');
      }

      return cotizaciones[0];
    },
    enabled: !!token,
    retry: false,
  });

  const { data: cliente } = useQuery({
    queryKey: ['cliente-cotizacion', cotizacion?.cliente_id],
    queryFn: async () => {
      const clientes = await base44.entities.Cliente.filter({ id: cotizacion.cliente_id });
      return clientes[0];
    },
    enabled: !!cotizacion?.cliente_id,
  });

  const { data: organization } = useQuery({
    queryKey: ['org-cotizacion', cotizacion?.organization_id],
    queryFn: async () => {
      const orgs = await base44.entities.Organization.filter({ id: cotizacion.organization_id });
      return orgs[0];
    },
    enabled: !!cotizacion?.organization_id,
  });

  const descargarPDF = () => {
    if (!cotizacion) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    let y = 20;

    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('COTIZACIÓN COMERCIAL', pageWidth / 2, y, { align: 'center' });
    
    y += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 0, 0);
    doc.text('Este documento NO es una factura ni comprobante fiscal', pageWidth / 2, y, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    y += 15;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`${organization?.name || 'Negocio'}`, 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    if (organization?.telefono_negocio) {
      doc.text(`Tel: ${organization.telefono_negocio}`, 14, y);
      y += 6;
    }

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(cliente?.nombre_completo || 'N/A', 40, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Estado:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(estadoConfig[cotizacion.estado]?.label || cotizacion.estado, 40, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Fecha:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(format(new Date(cotizacion.created_date), 'dd/MM/yyyy', { locale: es }), 40, y);
    
    if (cotizacion.valida_hasta) {
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Válida hasta:', 14, y);
      doc.setFont('helvetica', 'normal');
      doc.text(format(new Date(cotizacion.valida_hasta), 'dd/MM/yyyy', { locale: es }), 40, y);
    }

    y += 15;
    doc.setFont('helvetica', 'bold');
    doc.text('ÍTEMS', 14, y);
    y += 8;

    // Items
    cotizacion.items?.forEach((item, idx) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFont('helvetica', 'normal');
      doc.text(`${idx + 1}. ${item.descripcion}`, 14, y);
      y += 5;
      doc.setFontSize(9);
      doc.text(`${item.cantidad} x ₡${item.precio_unitario?.toLocaleString()} ${item.descuento_porcentaje > 0 ? `(-${item.descuento_porcentaje}%)` : ''}`, 20, y);
      doc.text(`₡${item.subtotal?.toLocaleString()}`, pageWidth - 40, y, { align: 'right' });
      doc.setFontSize(10);
      y += 7;
    });

    y += 5;
    doc.line(14, y, pageWidth - 14, y);
    y += 7;

    // Totales
    doc.text('Subtotal:', 14, y);
    doc.text(`₡${cotizacion.subtotal?.toLocaleString()}`, pageWidth - 40, y, { align: 'right' });
    y += 6;
    if (cotizacion.descuento_total > 0) {
      doc.text('Descuento:', 14, y);
      doc.text(`-₡${cotizacion.descuento_total?.toLocaleString()}`, pageWidth - 40, y, { align: 'right' });
      y += 6;
    }
    doc.text('IVA (13%):', 14, y);
    doc.text(`₡${cotizacion.impuesto?.toLocaleString()}`, pageWidth - 40, y, { align: 'right' });
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('TOTAL:', 14, y);
    doc.text(`₡${cotizacion.total?.toLocaleString()}`, pageWidth - 40, y, { align: 'right' });

    if (cotizacion.notas) {
      y += 15;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Notas:', 14, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      const splitNotas = doc.splitTextToSize(cotizacion.notas, pageWidth - 28);
      doc.text(splitNotas, 14, y);
    }

    doc.save(`Cotizacion_${cotizacion.id}.pdf`);
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-0 shadow-2xl">
          <CardContent className="p-12 text-center">
            <FileText className="w-16 h-16 mx-auto mb-6 text-slate-400" />
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Acceso Restringido</h1>
            <p className="text-slate-600">
              Por favor, utilice el enlace único enviado para acceder a su cotización.
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
          <p className="text-slate-600">Cargando cotización...</p>
        </div>
      </div>
    );
  }

  if (error || !cotizacion) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-0 shadow-2xl">
          <CardContent className="p-12 text-center">
            <XCircle className="w-16 h-16 mx-auto mb-6 text-red-500" />
            <h1 className="text-2xl font-bold text-slate-900 mb-3">Cotización No Encontrada</h1>
            <p className="text-slate-600">
              El enlace puede haber expirado o no es válido. Contacte al negocio para obtener una nueva cotización.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const config = estadoConfig[cotizacion.estado] || estadoConfig.enviada;
  const Icon = config.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card className="border-0 shadow-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <FileText className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">{organization?.name || 'Cotización Comercial'}</h1>
                  <p className="text-blue-100">Propuesta de servicio/producto</p>
                </div>
              </div>
              <Button
                onClick={descargarPDF}
                variant="secondary"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Descargar PDF
              </Button>
            </div>
            <div className="flex items-center gap-3 pt-4 border-t border-white/20">
              <Icon className="w-6 h-6" />
              <span className="text-xl font-semibold">{config.label}</span>
            </div>
          </CardContent>
        </Card>

        {/* Disclaimer Legal */}
        <Alert className="border-2 border-red-300 bg-red-50">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <AlertDescription className="text-base font-semibold text-red-800">
            Este documento NO es una factura ni comprobante fiscal. Es una propuesta comercial.
          </AlertDescription>
        </Alert>

        {/* Información del Cliente y Cotización */}
        <Card className="border-0 shadow-xl">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-slate-500 text-sm">Cliente</Label>
                <p className="font-bold text-lg text-slate-900">{cliente?.nombre_completo || 'Cargando...'}</p>
                {cliente?.telefono && <p className="text-sm text-slate-600">{cliente.telefono}</p>}
              </div>
              <div>
                <Label className="text-slate-500 text-sm">Vendedor</Label>
                <p className="font-medium text-slate-900">{cotizacion.vendedor_nombre}</p>
              </div>
              <div>
                <Label className="text-slate-500 text-sm">Fecha de Emisión</Label>
                <p className="text-slate-900 flex items-center gap-2 mt-1">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {format(new Date(cotizacion.created_date), "dd 'de' MMMM, yyyy", { locale: es })}
                </p>
              </div>
              {cotizacion.valida_hasta && (
                <div>
                  <Label className="text-slate-500 text-sm">Válida Hasta</Label>
                  <p className="text-slate-900 flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    {format(new Date(cotizacion.valida_hasta), "dd 'de' MMMM, yyyy", { locale: es })}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Items */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg">Ítems de la Cotización</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {cotizacion.items?.map((item, idx) => (
                <div key={idx} className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{item.descripcion}</p>
                      <p className="text-sm text-slate-600 mt-1">
                        {item.cantidad} x ₡{item.precio_unitario?.toLocaleString()}
                        {item.descuento_porcentaje > 0 && (
                          <span className="text-emerald-600 ml-2">
                            (-{item.descuento_porcentaje}% descuento)
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="font-semibold text-lg text-slate-900">
                      ₡{item.subtotal?.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Totales */}
        <Card className="border-0 shadow-xl">
          <CardContent className="p-6">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Subtotal:</span>
                <span className="font-medium">₡{cotizacion.subtotal?.toLocaleString()}</span>
              </div>
              {cotizacion.descuento_total > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Descuento:</span>
                  <span className="font-medium text-emerald-600">-₡{cotizacion.descuento_total?.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">IVA (13%):</span>
                <span className="font-medium">₡{cotizacion.impuesto?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xl font-bold border-t pt-3">
                <span>TOTAL:</span>
                <span className="text-emerald-600">₡{cotizacion.total?.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {cotizacion.notas && (
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg">Notas Adicionales</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-700 whitespace-pre-wrap">{cotizacion.notas}</p>
            </CardContent>
          </Card>
        )}

        {/* Footer - Información del Negocio */}
        <Card className="border-0 shadow-xl bg-slate-50">
          <CardContent className="p-6 text-center">
            <div className="text-sm text-slate-600 space-y-2">
              <p className="font-semibold text-slate-900 text-base">
                {organization?.name || 'Negocio'}
              </p>
              {organization?.telefono_negocio && (
                <p>Teléfono: {organization.telefono_negocio}</p>
              )}
              {organization?.email && (
                <p>Email: {organization.email}</p>
              )}
              {organization?.direccion_comercial && (
                <p className="mt-2">{organization.direccion_comercial}</p>
              )}
              <p className="text-xs text-slate-500 mt-3">
                Este documento es una cotización comercial válida
              </p>
              <p className="text-xs text-slate-500">
                Conserve este enlace para consultas futuras
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer Legal */}
        <div className="text-center text-xs text-slate-500 py-4">
          <p>Este enlace es privado y único para su cotización</p>
          <p>Documento generado el {format(new Date(cotizacion.created_date), "dd/MM/yyyy 'a las' HH:mm", { locale: es })}</p>
        </div>
      </div>
    </div>
  );
}