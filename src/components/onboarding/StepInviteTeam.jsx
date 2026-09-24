import React, { useState } from 'react';
import { Loader2, UserPlus, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';

const ROLES = [
  { value: 'TECHNICIAN', label: 'Técnico' },
  { value: 'BRANCH_ADMIN', label: 'Admin de sucursal' },
  { value: 'SALES', label: 'Ventas' },
  { value: 'INVENTORY', label: 'Inventario' },
  { value: 'CUSTOMER_SERVICE', label: 'Servicio al cliente' },
];

export default function StepInviteTeam({ effectiveOrgId, onSkip, onContinue }) {
  const { toast } = useToast();
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('TECHNICIAN');

  const handleInvite = async () => {
    if (!email.trim()) {
      onContinue();
      return;
    }
    setInviting(true);
    try {
      const response = await base44.functions.invoke('manageOrgUser', {
        action: 'invite',
        organizationId: effectiveOrgId,
        data: { user_email: email.trim().toLowerCase(), role },
      });
      if (!response?.data?.success) {
        throw new Error(response?.data?.error || 'No se pudo invitar');
      }
      toast({ title: 'Invitación enviada', description: `${email.trim()} recibirá un correo para unirse.` });
      onContinue();
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo invitar', description: err?.message });
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Invita a tu equipo</h2>
        <p className="mt-1 text-sm text-slate-500">
          TRP funciona mejor cuando tu equipo opera desde la misma plataforma.
          Invita al menos a un técnico para recibir y diagnosticar equipos.
          Puedes invitar a más personas después.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="invite_email">Correo del invitado</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="invite_email"
              type="email"
              className="pl-9"
              placeholder="tecnico@minegocio.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Rol</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map(r => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onSkip} className="flex-1" disabled={inviting}>
          Saltar por ahora
        </Button>
        <Button onClick={handleInvite} className="flex-1" disabled={inviting}>
          {inviting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : email.trim() ? (
            <>
              <UserPlus className="h-4 w-4" />
              Invitar y continuar
            </>
          ) : (
            'Continuar'
          )}
        </Button>
      </div>
    </div>
  );
}