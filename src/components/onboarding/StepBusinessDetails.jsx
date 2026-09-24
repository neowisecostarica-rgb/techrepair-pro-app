import React, { useState } from 'react';
import { Loader2, Phone, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { updateIdentityOrganization } from '@/api/identity';

export default function StepBusinessDetails({ effectiveOrgId, onSkip, onContinue }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    telefono_negocio: '',
    direccion_comercial: '',
    email: '',
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const changes = {};
      if (form.telefono_negocio.trim()) changes.telefono_negocio = form.telefono_negocio.trim();
      if (form.direccion_comercial.trim()) changes.direccion_comercial = form.direccion_comercial.trim();
      if (form.email.trim()) changes.email = form.email.trim();

      if (Object.keys(changes).length > 0) {
        await updateIdentityOrganization(effectiveOrgId, changes);
      }
      onContinue();
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Datos de tu negocio</h2>
        <p className="mt-1 text-sm text-slate-500">
          Estos datos aparecen en comprobantes, cotizaciones y portales públicos de tus clientes.
          Puedes configurarlos ahora o después desde Configuración.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="telefono_negocio">Teléfono del negocio</Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="telefono_negocio"
              className="pl-9"
              placeholder="Ej: +506 2222-3333"
              value={form.telefono_negocio}
              onChange={e => setForm({ ...form, telefono_negocio: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="direccion_comercial">Dirección comercial</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <Input
              id="direccion_comercial"
              className="pl-9"
              placeholder="Ej: San José, Costa Rica"
              value={form.direccion_comercial}
              onChange={e => setForm({ ...form, direccion_comercial: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email de contacto comercial</Label>
          <Input
            id="email"
            type="email"
            placeholder="contacto@minegocio.com"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onSkip} className="flex-1" disabled={saving}>
          Saltar por ahora
        </Button>
        <Button onClick={handleSave} className="flex-1" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar y continuar'}
        </Button>
      </div>
    </div>
  );
}