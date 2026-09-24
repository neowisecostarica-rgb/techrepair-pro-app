import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { KeyRound, Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react';

/**
 * RevealDeviceCredential — Revelación controlada y auditada del PIN/contraseña del dispositivo.
 * Usa la backend function `revealDeviceCredential` que valida:
 *   - capability TECHNICAL_WORK
 *   - técnico asignado a la OT
 *   - audita el evento DEVICE_CREDENTIAL_REVEALED
 */
export default function RevealDeviceCredential({ ot, effectiveRole }) {
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState(null);
  const [error, setError] = useState(null);
  const [show, setShow] = useState(false);

  if (!ot?.id) return null;

  // Solo técnicos/admins pueden revelar; el backend valida asignación
  if (!['TECHNICIAN', 'ORG_ADMIN', 'BRANCH_ADMIN', 'SUPER_ADMIN'].includes(effectiveRole)) return null;

  const handleReveal = async () => {
    setLoading(true);
    setError(null);
    setPin(null);
    setShow(true);
    try {
      const response = await base44.functions.invoke('revealDeviceCredential', {
        work_order_id: ot.id,
        correlation_id: crypto.randomUUID(),
      });
      const result = response?.data ?? response;
      if (result?.error) throw new Error(result.error);
      setPin(result.contrasena_ingreso);
    } catch (e) {
      setError(e?.message || 'No se pudo revelar la credencial. Verifica que tengas la OT asignada.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 text-amber-800">
        <KeyRound className="w-4 h-4 shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wide flex-1">PIN / Contraseña del dispositivo</span>
      </div>
      <div className="px-4 py-3 bg-white">
        {!pin && !loading && !error && (
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={handleReveal} className="border-amber-300 text-amber-800 hover:bg-amber-50">
              <Eye className="w-4 h-4 mr-1" />Revelar credencial
            </Button>
            <p className="text-xs text-slate-500">La revelación queda registrada en auditoría. Solo el técnico asignado puede revelarla.</p>
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin" />Verificando autorización...
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {pin !== null && !loading && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2">
                <KeyRound className="w-4 h-4 text-slate-500" />
                <span className="text-lg font-mono font-bold tracking-wider text-slate-900">{pin || '(sin PIN registrado)'}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setShow(s => !s)}>
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-slate-500">Revelado a las {new Date().toLocaleTimeString()}. Esta acción fue auditada.</p>
          </div>
        )}
      </div>
    </div>
  );
}