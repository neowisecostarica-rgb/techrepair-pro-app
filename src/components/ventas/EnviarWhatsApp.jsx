import React from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { generarResumenTrabajo } from './utils/generarResumenTrabajo';
import { getPublicBaseUrl } from './getPublicBaseUrl';
import { issuePublicLink } from '@/api/publicLinks';

export default function EnviarWhatsApp({ 
  venta, 
  cliente, 
  equipo, 
  ordenTrabajo,
  diagnostico,
  cotizacion,
  garantia, 
  organization,
  onSent 
}) {
  const telefono = cliente?.telefono;
  
  if (!telefono) {
    return (
      <Alert className="bg-amber-50 border-amber-200">
        <AlertCircle className="w-4 h-4 text-amber-600" />
        <AlertDescription className="text-amber-800">
          ⚠️ Cliente sin número de teléfono registrado. Edite el cliente para habilitar envío.
        </AlertDescription>
      </Alert>
    );
  }

  const handleEnviar = async () => {
    const resumen = diagnostico && cotizacion 
      ? generarResumenTrabajo(diagnostico, cotizacion)
      : 'Servicio completado';

    const baseUrl = getPublicBaseUrl(organization);
    const linkComprobante = await issuePublicLink('receipt', venta.id, baseUrl);
    const linkGarantia = garantia 
      ? await issuePublicLink('warranty', garantia.id, baseUrl)
      : null;

    const mensaje = `¡Hola ${cliente.nombre_completo}! 👋

✅ Tu equipo está listo

${equipo ? `📱 *${equipo.marca} ${equipo.modelo}*` : ''}
${ordenTrabajo ? `🔧 OT: ${ordenTrabajo.codigo_ot}` : ''}

🔍 *Trabajo realizado:*
${resumen}

💰 *Total cobrado: ₡${venta.total.toLocaleString()}*
💳 Pagado con ${venta.metodo_pago}

${garantia ? `🛡️ *Garantía:*
${Math.floor((new Date(garantia.fecha_fin) - new Date(garantia.fecha_inicio)) / (1000 * 60 * 60 * 24 * 30))} meses de cobertura
Válida hasta ${new Date(garantia.fecha_fin).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}

📄 *Documentos:*
📋 Ver comprobante: ${linkComprobante}
${linkGarantia ? `🛡️ Ver garantía: ${linkGarantia}` : ''}

---

Gracias por confiar en nosotros 😊

${organization?.name || 'Taller de Reparaciones'}
${organization?.telefono_negocio ? `📞 ${organization.telefono_negocio}` : ''}`;

    // Limpiar teléfono (solo números)
    const telefonoLimpio = telefono.replace(/\D/g, '');
    
    // Abrir WhatsApp Web
    const url = `https://wa.me/${telefonoLimpio}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');

    // Callback
    if (onSent) {
      onSent();
    }
  };

  return (
    <Button
      onClick={handleEnviar}
      className="w-full bg-green-600 hover:bg-green-700 text-white"
    >
      <MessageSquare className="w-4 h-4 mr-2" />
      Enviar WhatsApp al Cliente
    </Button>
  );
}
