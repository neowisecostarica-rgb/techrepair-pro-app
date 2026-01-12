import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Shield, QrCode } from 'lucide-react';

export default function TiqueteVenta({ venta, onClose }) {
  const { data: cliente } = useQuery({
    queryKey: ['cliente-tiquete', venta?.cliente_id],
    queryFn: () => base44.entities.Cliente.list(),
    enabled: !!venta?.cliente_id,
    select: (data) => data.find(c => c.id === venta.cliente_id),
  });

  const { data: items = [] } = useQuery({
    queryKey: ['venta-items', venta?.id],
    queryFn: () => base44.entities.VentaItem.filter({
      venta_id: venta.id
    }),
    enabled: !!venta?.id,
  });

  const { data: organization } = useQuery({
    queryKey: ['org-tiquete', venta?.organization_id],
    queryFn: async () => {
      const orgs = await base44.entities.Organization.list();
      return orgs.find(o => o.id === venta.organization_id);
    },
    enabled: !!venta?.organization_id,
  });

  const { data: garantia } = useQuery({
    queryKey: ['garantia-venta', venta?.id],
    queryFn: async () => {
      const garantias = await base44.entities.Garantia.filter({
        origen_tipo: 'VENTA',
        origen_id: venta.id
      });
      return garantias[0];
    },
    enabled: !!venta?.id,
  });

  const handleImprimir = () => {
    window.print();
  };

  if (!venta) return null;

  const urlGarantia = garantia 
    ? `${window.location.origin}/PortalGarantia?token=${garantia.public_access_token}`
    : null;

  return (
    <div className="max-w-2xl mx-auto p-8 bg-white">
      <div className="print:block">
        {/* Header */}
        <div className="text-center border-b-2 border-slate-900 pb-4 mb-6">
          <h1 className="text-2xl font-bold">{organization?.name || 'TALLER DE REPARACIONES'}</h1>
          <p className="text-sm text-slate-600 mt-1">Comprobante de Venta</p>
        </div>

        {/* Info Venta */}
        <div className="grid grid-cols-2 gap-4 text-sm mb-6">
          <div>
            <p className="font-semibold">Fecha:</p>
            <p>{format(new Date(venta.created_date), "dd 'de' MMMM, yyyy", { locale: es })}</p>
          </div>
          <div>
            <p className="font-semibold">Método de Pago:</p>
            <p className="capitalize">{venta.metodo_pago}</p>
          </div>
        </div>

        {/* Cliente */}
        {cliente && (
          <div className="mb-6 p-3 bg-slate-50 rounded">
            <p className="font-semibold text-sm mb-1">Cliente:</p>
            <p className="text-sm">{cliente.nombre_completo}</p>
            <p className="text-sm text-slate-600">{cliente.telefono}</p>
          </div>
        )}

        {/* Items */}
        <div className="mb-6">
          <table className="w-full text-sm">
            <thead className="border-b-2 border-slate-900">
              <tr>
                <th className="text-left py-2">Descripción</th>
                <th className="text-center py-2">Cant.</th>
                <th className="text-right py-2">Precio</th>
                <th className="text-right py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-slate-200">
                  <td className="py-2">{item.descripcion}</td>
                  <td className="text-center py-2">{item.cantidad}</td>
                  <td className="text-right py-2">₡{item.precio_unitario.toLocaleString()}</td>
                  <td className="text-right py-2 font-semibold">₡{item.subtotal.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div className="mb-6 border-t-2 border-slate-900 pt-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Subtotal:</span>
            <span>₡{venta.subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm mb-2">
            <span>IVA (13%):</span>
            <span>₡{venta.impuesto.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-lg font-bold">
            <span>TOTAL:</span>
            <span>₡{venta.total.toLocaleString()}</span>
          </div>
        </div>

        {/* Garantía */}
        {garantia && urlGarantia && (
          <div className="mb-6 p-4 border-2 border-indigo-200 bg-indigo-50 rounded">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-indigo-900">Garantía del Producto</h3>
            </div>
            
            <div className="space-y-2 text-sm">
              <p className="text-slate-700">
                Esta compra incluye garantía válida hasta el{' '}
                <strong>{format(new Date(garantia.fecha_fin), "dd 'de' MMMM, yyyy", { locale: es })}</strong>
              </p>
              
              <div className="flex items-start gap-3 mt-3 p-3 bg-white rounded border border-indigo-200">
                <div className="flex-1">
                  <p className="text-xs text-slate-600 mb-1">Consulte su garantía en línea:</p>
                  <p className="text-xs font-mono break-all text-indigo-600">{urlGarantia}</p>
                </div>
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 bg-white border border-slate-300 rounded flex items-center justify-center">
                    <QrCode className="w-12 h-12 text-slate-400" />
                    <span className="sr-only">Código QR</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-500 border-t pt-4">
          <p>Gracias por su compra</p>
          {garantia && (
            <p className="mt-1">Conserve este comprobante para hacer válida la garantía</p>
          )}
        </div>
      </div>

      {/* Botones (no imprimir) */}
      <div className="print:hidden flex gap-3 mt-6">
        <button
          onClick={handleImprimir}
          className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
        >
          Imprimir
        </button>
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700"
        >
          Cerrar
        </button>
      </div>

      <style jsx>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:block, .print\\:block * {
            visibility: visible;
          }
          .print\\:block {
            position: absolute;
            left: 0;
            top: 0;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}