import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, Building2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function Onboarding() {
  const [mode, setMode] = useState('checking'); // checking | invited | new_company | success
  const [user, setUser] = useState(null);
  const [pendingAccount, setPendingAccount] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    checkUserStatus();
  }, []);

  const checkUserStatus = async () => {
    try {
      const authenticatedUser = await base44.auth.me();
      setUser(authenticatedUser);

      // SUPER_ADMIN bypass - ya tienen acceso directo
      if (authenticatedUser.is_super_admin) {
        window.location.href = createPageUrl('Saas');
        return;
      }

      // Buscar UserAccount existente (invitado o ya configurado)
      const accounts = await base44.entities.UserAccount.filter({
        user_email: authenticatedUser.email,
      });

      // CASO 1: Usuario invitado (tiene UserAccount pendiente sin user_id)
      const invited = accounts.find(a => !a.user_id);
      if (invited) {
        setPendingAccount(invited);
        setMode('invited');
        await completeInvitedUserSetup(authenticatedUser, invited);
        return;
      }

      // CASO 2: Usuario ya tiene cuenta vinculada (no debería estar aquí, pero redirigir)
      const existing = accounts.find(a => a.user_id === authenticatedUser.id);
      if (existing) {
        window.location.href = createPageUrl('Dashboard');
        return;
      }

      // CASO 3: Usuario nuevo sin invitación → debe crear empresa
      setMode('new_company');
    } catch (err) {
      console.error('Error checking user status:', err);
      setMode('new_company'); // Fallback: permitir crear empresa
    }
  };

  const completeInvitedUserSetup = async (user, account) => {
    try {
      // Vincular UserAccount con user_id
      await base44.entities.UserAccount.update(account.id, {
        user_id: user.id,
        active: true,
      });

      setMode('success');
      setTimeout(() => {
        if (account.role === 'ORG_ADMIN') {
          window.location.href = createPageUrl('Settings');
        } else {
          window.location.href = createPageUrl('Dashboard');
        }
      }, 1500);
    } catch (err) {
      console.error('Error completing invited setup:', err);
      alert('Error al completar el registro: ' + err.message);
    }
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    setCreating(true);

    try {
      const formData = new FormData(e.target);
      
      // 1. Crear Organization
      const org = await base44.entities.Organization.create({
        name: formData.get('company_name'),
        country: formData.get('country'),
        currency: formData.get('currency'),
        plan: 'basic',
        status: 'active',
      });

      // 2. Crear Branch default
      await base44.entities.Branch.create({
        organization_id: org.id,
        name: 'Principal',
        address: '',
        is_default: true,
      });

      // 3. Crear UserAccount como ORG_ADMIN (owner)
      await base44.entities.UserAccount.create({
        user_id: user.id,
        user_email: user.email,
        organization_id: org.id,
        role: 'ORG_ADMIN',
        active: true,
      });

      setMode('success');
      setTimeout(() => {
        window.location.href = createPageUrl('Settings');
      }, 1500);
    } catch (err) {
      console.error('Error creating company:', err);
      alert('Error al crear la empresa: ' + err.message);
      setCreating(false);
    }
  };

  if (mode === 'checking') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-0 shadow-2xl">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Verificando tu cuenta...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === 'invited') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-0 shadow-2xl">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Completando tu registro como usuario invitado...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-0 shadow-2xl">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">¡Todo Listo!</h2>
            <p className="text-emerald-600 font-medium">Redirigiendo a tu panel...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // mode === 'new_company'
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-lg border-0 shadow-2xl">
        <CardHeader className="text-center border-b border-slate-100">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold text-slate-900">Crea tu Empresa</CardTitle>
          <p className="text-slate-500 mt-2">Configura tu organización para comenzar</p>
        </CardHeader>
        <CardContent className="p-8">
          <form onSubmit={handleCreateCompany} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="company_name">Nombre de la Empresa *</Label>
              <Input
                id="company_name"
                name="company_name"
                placeholder="Ej: Mi Taller de Reparación"
                required
                disabled={creating}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="country">País *</Label>
                <Select name="country" required disabled={creating}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CR">Costa Rica</SelectItem>
                    <SelectItem value="MX">México</SelectItem>
                    <SelectItem value="CO">Colombia</SelectItem>
                    <SelectItem value="AR">Argentina</SelectItem>
                    <SelectItem value="CL">Chile</SelectItem>
                    <SelectItem value="PE">Perú</SelectItem>
                    <SelectItem value="EC">Ecuador</SelectItem>
                    <SelectItem value="UY">Uruguay</SelectItem>
                    <SelectItem value="PY">Paraguay</SelectItem>
                    <SelectItem value="BO">Bolivia</SelectItem>
                    <SelectItem value="VE">Venezuela</SelectItem>
                    <SelectItem value="PA">Panamá</SelectItem>
                    <SelectItem value="GT">Guatemala</SelectItem>
                    <SelectItem value="HN">Honduras</SelectItem>
                    <SelectItem value="SV">El Salvador</SelectItem>
                    <SelectItem value="NI">Nicaragua</SelectItem>
                    <SelectItem value="DO">República Dominicana</SelectItem>
                    <SelectItem value="PR">Puerto Rico</SelectItem>
                    <SelectItem value="US">Estados Unidos</SelectItem>
                    <SelectItem value="ES">España</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Moneda *</Label>
                <Select name="currency" required disabled={creating}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CRC">CRC (₡)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="MXN">MXN ($)</SelectItem>
                    <SelectItem value="COP">COP ($)</SelectItem>
                    <SelectItem value="ARS">ARS ($)</SelectItem>
                    <SelectItem value="CLP">CLP ($)</SelectItem>
                    <SelectItem value="PEN">PEN (S/)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-sm text-emerald-800">
                <strong>Serás el administrador principal</strong> de esta empresa con acceso completo a todas las funciones.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600"
              disabled={creating}
            >
              {creating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creando Empresa...
                </>
              ) : (
                <>
                  Crear Empresa
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}