/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Motor de Custodia — P1-A.3
 * ═══════════════════════════════════════════════════════════════════════════
 * Fuente de verdad: OrdenTrabajo.fecha_cierre
 * Custodia aplica ÚNICAMENTE cuando estado === 'FINALIZADA'
 * No modifica estados de workflow de OT.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { differenceInDays } from 'date-fns';

/**
 * Calcula el estado de custodia derivado en función de días transcurridos
 * desde fecha_cierre. No persiste: es una función pura de lectura.
 *
 * @param {object} ot - Registro OrdenTrabajo
 * @returns {{ estadoCustodia: string, diasCustodia: number | null, elegibleAbandono: boolean }}
 */
export function calcularCustodia(ot) {
  // Solo aplica cuando la OT está FINALIZADA (no ENTREGADA, no CANCELADA)
  if (ot.estado !== 'FINALIZADA') {
    return { estadoCustodia: null, diasCustodia: null, elegibleAbandono: false };
  }

  // Si ya tiene un estado de custodia persistido mayor a NORMAL, respetarlo
  const estadoPersistido = ot.estado_custodia;
  if (estadoPersistido === 'ABANDONO_DECLARADO' || estadoPersistido === 'DISPOSICION_FINAL') {
    const diasCustodia = ot.fecha_cierre
      ? differenceInDays(new Date(), new Date(ot.fecha_cierre))
      : null;
    return { estadoCustodia: estadoPersistido, diasCustodia, elegibleAbandono: true };
  }

  const fechaRef = ot.fecha_cierre || ot.updated_date;
  if (!fechaRef) {
    return { estadoCustodia: 'NORMAL', diasCustodia: 0, elegibleAbandono: false };
  }

  const dias = differenceInDays(new Date(), new Date(fechaRef));

  // Reglas del Motor de Custodia
  // 0–7 días   → NORMAL
  // 8–30 días  → EN_CUSTODIA
  // 31+ días   → elegible ABANDONO_DECLARADO (estado derivado, no persiste solo)
  let estadoCustodia;
  if (dias <= 7) {
    estadoCustodia = 'NORMAL';
  } else if (dias <= 30) {
    estadoCustodia = 'EN_CUSTODIA';
  } else {
    // Mostrar EN_CUSTODIA hasta que un admin lo declare explícitamente como abandono
    estadoCustodia = estadoPersistido === 'EN_CUSTODIA' || !estadoPersistido
      ? 'EN_CUSTODIA'
      : estadoPersistido;
  }

  return {
    estadoCustodia,
    diasCustodia: dias,
    elegibleAbandono: dias >= 31,
  };
}

/**
 * Configuración visual por estado de custodia
 */
export const CUSTODIA_CONFIG = {
  NORMAL: {
    label: 'Normal',
    color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  EN_CUSTODIA: {
    label: 'En Custodia',
    color: 'bg-amber-50 border-amber-200 text-amber-800',
    badgeClass: 'bg-amber-100 text-amber-800',
    dot: 'bg-amber-500',
  },
  ABANDONO_DECLARADO: {
    label: 'Abandono Declarado',
    color: 'bg-red-50 border-red-200 text-red-700',
    badgeClass: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
  },
  DISPOSICION_FINAL: {
    label: 'Disposición Final',
    color: 'bg-slate-50 border-slate-300 text-slate-600',
    badgeClass: 'bg-slate-200 text-slate-600',
    dot: 'bg-slate-400',
  },
};