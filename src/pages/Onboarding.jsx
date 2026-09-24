import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Building2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  acceptIdentityInvitation,
  bootstrapIdentityOrganization,
  getIdentityContext,
} from '@/api/identity';
import { useToast } from '@/components/ui/use-toast';
import GuidedOnboardingWizard from '@/components/onboarding/GuidedOnboardingWizard';

export default function Onboarding() {
  const { toast } = useToast();
  const [mode, setMode] = useState('checking'); // checking | invited | new_company | wizard
  const [user, setUser] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createdOrg, setCreatedOrg] = useState(null);
  const [effectiveOrgId, setEffectiveOrgId] = useState(null);
  
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
        const targetPage = ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'].includes(activeAccount.role)
          ? 'MiDia'
          : activeAccount.role === 'CUSTOMER_SERVICE'
            ? 'OrdenesTrabajo'
            : activeAccount.role === 'SALES'
              ? 'MiDia'
              : activeAccount.role === 'INVENTORY'
                ? 'Inventario'
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
          const targetPage = ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'].includes(accepted.account?.role)
            ? 'MiDia'
            : accepted.account?.role === 'CUSTOMER_SERVICE'
              ? 'OrdenesTrabajo'
              : accepted.account?.role === 'SALES'
                ? 'MiDia'
                : accepted.account?.role === 'INVENTORY'
                  ? 'Inventario'
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
      toast({ title: 'Estamos preparando tu sesión', description: 'Espera unos segundos e inténtalo nuevamente.' });
      isCreatingOrgRef.current = false;
      setCreating(false);
      return;
    }

    try {
      const companyName = e.target.company_name.value.trim();
      if (!companyName || !selectedCountry || !selectedCurrency) {
        toast({ variant: 'destructive', title: 'Faltan datos requeridos', description: 'Completa los campos obligatorios antes de continuar.' });
        isCreatingOrgRef.current = false;
        setCreating(false);
        return;
      }

      const result = await bootstrapIdentityOrganization({
        name: companyName,
        country: selectedCountry,
        currency: selectedCurrency,
      });
      isCreatingOrgRef.current = false;
      setCreatedOrg(result?.organization || null);
      setEffectiveOrgId(result?.organization?.id || null);
      setMode('wizard');
    } catch (err) {
      console.error('❌ Error creating company:', err);
      isCreatingOrgRef.current = false;
      toast({ variant: 'destructive', title: 'No se pudo crear la empresa', description: err.message });
      isCreatingOrgRef.current = false;
      setCreating(false);
    }
  };

  if (mode === 'checking') {
    return (
      <div className="min-h-screen bg-[#f6f8fb] flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-0 shadow-2xl">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-12 h-12 text-teal-700 animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Verificando tu cuenta...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === 'invited') {
    return (
      <div className="min-h-screen bg-[#f6f8fb] flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-0 shadow-2xl">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-12 h-12 text-teal-700 animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Completando tu registro como usuario invitado...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === 'wizard') {
    return (
      <GuidedOnboardingWizard
        organization={createdOrg}
        effectiveOrgId={effectiveOrgId}
      />
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
    <div className="min-h-screen bg-[#f6f8fb] flex items-center justify-center p-6">
      <Card className="w-full max-w-lg border-0 shadow-2xl">
        <CardHeader className="text-center border-b border-slate-100">
          <div className="w-16 h-16 bg-[#0b1220] rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold text-slate-900">Configura tu organización</CardTitle>
          <p className="text-slate-500 mt-2">Solo lo esencial para empezar. TRP te llevará directo a registrar tu primer trabajo.</p>
        </CardHeader>
        <CardContent className="p-8">
          <form onSubmit={handleCreateCompany} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="company_name">Nombre de la Empresa *</Label>
              <Input
                id="company_name"
                name="company_name"
                placeholder="Ej: Compu Store Costa Rica"
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

            <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
              <p className="text-sm text-teal-900">
                <strong>Serás el administrador principal</strong> de esta empresa con acceso completo a todas las funciones.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full bg-teal-700 hover:bg-teal-800"
              disabled={creating || !user?.id || !selectedCountry || !selectedCurrency}

            >
              {creating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creando Empresa...
                </>
              ) : (
                <>
                  Crear organización y recibir primer equipo
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