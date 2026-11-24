import React, { useState } from 'react';
import { useI18n } from '@/i18n';
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

export default function StepInviteTeam({ effectiveOrgId, primaryBranchId, onSkip, onContinue }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [inviting, setInviting] = useState(false);
  const inviteInFlight = React.useRef(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('TECHNICIAN');

  const handleInvite = async () => {
    if (!email.trim()) {
      onContinue();
      return;
    }
    if (inviteInFlight.current) return;
    if (!primaryBranchId || !effectiveOrgId) { toast({variant:'destructive',title:'Sucursal no verificada',description:'Puedes continuar e invitar a tu equipo desde Configuración.'}); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast({variant:'destructive',title:'Correo inválido'}); return; }
    inviteInFlight.current = true;
    setInviting(true);
    try {
      const response = await base44.functions.invoke('manageOrgUser', {
        action: 'invite',
        organizationId: effectiveOrgId,
        data: { user_email: email.trim().toLowerCase(), role, branch_id: primaryBranchId },
      });
      if (!response?.data?.success) {
        throw new Error(response?.data?.error || 'No se pudo invitar');
      }
      toast({ title: 'Invitación registrada', description: 'El estado de la invitación se puede consultar en Configuración.' });
      onContinue();
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo invitar', description: err?.message });
    } finally {
      inviteInFlight.current = false;
      setInviting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t('preGo.inviteTeam','Invita a tu equipo')}</h2>
        <p className="mt-1 text-sm text-slate-500">
          TRP funciona mejor cuando tu equipo opera desde la misma plataforma.
          Si trabajas solo, puedes continuar sin invitar a nadie.
          Puedes invitar a más personas después.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="invite_email">{t('preGo.inviteEmail','Correo del invitado')}</Label>
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
          <Label>{t('preGo.role','Rol')}</Label>
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
          {t('preGo.skip','Saltar por ahora')}
        </Button>
        <Button onClick={handleInvite} className="flex-1" disabled={inviting}>
          {inviting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : email.trim() ? (
            <>
              <UserPlus className="h-4 w-4" />
              {t('preGo.inviteContinue','Invitar y continuar')}
            </>
          ) : (
            t('preGo.continue','Continuar')
          )}
        </Button>
      </div>
    </div>
  );
}