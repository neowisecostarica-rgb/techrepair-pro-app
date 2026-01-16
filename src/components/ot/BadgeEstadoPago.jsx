import React from 'react';
import { Badge } from '@/components/ui/badge';

/**
 * P0.1 - Badge visual dominante para estado de pago
 * 
 * Renderiza exactamente:
 * - 🟢 PAGADO
 * - 🔴 PENDIENTE
 * 
 * @param {Object} props
 * @param {"PAGADO"|"PENDIENTE"} props.status
 */
export default function BadgeEstadoPago({ status }) {
  if (status === 'PAGADO') {
    return (
      <Badge className="bg-green-100 text-green-800 border-0 font-semibold">
        🟢 PAGADO
      </Badge>
    );
  }

  return (
    <Badge className="bg-red-100 text-red-800 border-0 font-semibold">
      🔴 PENDIENTE
    </Badge>
  );
}