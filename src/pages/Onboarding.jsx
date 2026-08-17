import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, Building2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  acceptIdentityInvitation,
  bootstrapIdentityOrganization,
  getIdentityContext,
} from '@/api/identity';

export default function Onboarding() {
  const [mode, setMode] = useState('checking'); // checking | invited | new_company | success
  const [user, setUser] = useState(null);
  const [creating, setCreating] = useState(false);
  
  // Estados controlados para Selects (P0: hardening)
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');

  // P0: IDEMPOTENCIA - Prevenir múltiples ejecuciones
  const hasCheckedRef = React.useRef(false);
  const isLinkingRef = React.useRef(false);
  const isCreatingOrgRef = React.useRef(false);

  useEffect(() => {
    if (hasCheckedRef.current) return; // Ya ejecutado
    hasCheckedRef.current = true;
    checkUserStatus();
  }, []);

  const checkUserStatus = async () => {
    try {
      const context = await getIdentityContext();
      setUser(context.user);
      if (context.user?.is_super_admin) {
        window.location.href = createPageUrl('Saas');
        return;
      }

      const activeAccount = context.userAccount;
      if (activeAccount) {
        const targetPage = ['ORG_ADMIN', 'BRANCH_ADMIN'].includes(activeAccount.role)
          ? 'Dashboard'
          : 'MiDia';
        window.location.href = createPageUrl(targetPage);
        return;
      }

      const invitation = context.pendingInvitations?.[0];
      if (invitation) {
        if (isLinkingRef.current) {
          return;
        }
        isLinkingRef.current = true;
        try {
          const accepted = await acceptIdentityInvitation(invitation.id);
          const targetPage = ['ORG_ADMIN', 'BRANCH_ADMIN'].includes(accepted.account?.role)
            ? 'Dashboard'
            : 'MiDia';
          window.location.href = createPageUrl(targetPage);
          return;
        } catch (err) {
          console.error('Error activando invitación:', err);
          isLinkingRef.current = false;
          throw err;
        }
      }

      if ((context.memberships || []).length === 0) {
        setMode('new_company');
        return;
      }
      setMode('orphaned_user');
    } catch (err) {
      console.error('Error checking user status:', err);
      setMode('orphaned_user');
    }
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    
    // P0: GUARD INMUTABLE - Prevenir doble submit con ref (más fuerte que state)
    if (isCreatingOrgRef.current) {
      console.warn('⛔ Guard activo: creación ya en progreso, bloqueando submit duplicado');
      return;
    }
    
    isCreatingOrgRef.current = true;
    setCreating(true);
    
    // P0 HARD GUARD: user debe existir y tener id válido
    if (!user || typeof user.id !== 'string') {
      console.error('Usuario no inicializado al crear tenant', user);
      alert('Tu sesión aún se está inicializando. Intenta de nuevo en unos segundos.');
      isCreatingOrgRef.current = false;
      setCreating(false);
      return;
    }

    try {
      const companyName = e.target.company_name.value.trim();
      if (!companyName || !selectedCountry || !selectedCurrency) {
        alert('Por favor completa todos los campos requeridos');
        isCreatingOrgRef.current = false;
        setCreating(false);
        return;
      }

      await bootstrapIdentityOrganization({
        name: companyName,
        country: selectedCountry,
        currency: selectedCurrency,
      });
      isCreatingOrgRef.current = false;
      setMode('success');
      setTimeout(() => {
        window.location.href = createPageUrl('Settings');
      }, 1500);
      
    } catch (err) {
      console.error('❌ Error creating company:', err);
      isCreatingOrgRef.current = false;
      alert('Error al crear la empresa: ' + err.message);
      isCreatingOrgRef.current = false;
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

  // P0 GUARD: Usuario huérfano bloqueado
  if (mode === 'orphaned_user') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-red-50 to-orange-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-0 shadow-2xl">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Cuenta Desactivada</h2>
            <p className="text-slate-600 mb-6">
              Tu cuenta no está asociada a ninguna organización. 
              Esto puede ocurrir si tu cuenta fue reiniciada o desactivada.
            </p>
            <p className="text-sm text-slate-500 mb-6">
              Por favor, contacta a tu administrador o al soporte técnico para reactivar tu acceso.
            </p>
            <Button
              onClick={() => base44.auth.logout()}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              Cerrar Sesión
            </Button>
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
                <Select 
                  name="country" 
                  required 
                  disabled={creating}
                  value={selectedCountry}
                  onValueChange={setSelectedCountry}
                >
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
                <Select 
                  name="currency" 
                  required 
                  disabled={creating}
                  value={selectedCurrency}
                  onValueChange={setSelectedCurrency}
                >
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
              disabled={creating || !user?.id || !selectedCountry || !selectedCurrency}

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
            
            <p className="text-xs text-center text-slate-500 mt-2">
              Si refrescas la página, no se duplicará tu empresa
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
