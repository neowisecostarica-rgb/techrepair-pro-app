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
      const authenticatedUser = await base44.auth.me();
      setUser(authenticatedUser);

      // SUPER_ADMIN bypass - ya tienen acceso directo
      if (authenticatedUser.is_super_admin) {
        window.location.href = createPageUrl('Saas');
        return;
      }

      // P0 FIX: Buscar UserAccount por user_id (fuente de verdad)
      const accounts = await base44.entities.UserAccount.filter({
        user_id: authenticatedUser.id,
      });

      // CASO 1: Usuario con cuenta activa y organization_id → redirigir
      const activeAccount = accounts.find(a => a.active && a.organization_id);
      if (activeAccount) {
        const targetPage = activeAccount.role === 'ORG_ADMIN' || activeAccount.role === 'BRANCH_ADMIN' 
          ? 'Dashboard' 
          : 'MiDia';
        window.location.href = createPageUrl(targetPage);
        return;
      }

      // CASO 2: Buscar también por email (para invitaciones pre-signup)
      const accountsByEmail = await base44.entities.UserAccount.filter({
        user_email: authenticatedUser.email,
      });

      // P0 FIX: PRIORIDAD A INVITACIONES - Detectar ANY invitation (active o no, con o sin user_id)
      // Esto cubre:
      // - Invitaciones pendientes (user_id set, active: false)
      // - Invitaciones antiguas (sin user_id, solo email)
      const anyInvitation = 
        accounts.find(a => a.organization_id) || 
        accountsByEmail.find(a => a.organization_id);

      if (anyInvitation) {
        // P0: GUARD - Evitar múltiples linking simultáneos
        if (isLinkingRef.current) {
          console.warn('Linking ya en progreso, abortando');
          return;
        }
        isLinkingRef.current = true;

        try {
          // P0: IDEMPOTENCIA - Verificar si ya está correctamente enlazado
          if (anyInvitation.user_id === authenticatedUser.id && anyInvitation.active) {
            console.log('UserAccount ya enlazado y activo, redirigiendo...');
            const targetPage = anyInvitation.role === 'ORG_ADMIN' || anyInvitation.role === 'BRANCH_ADMIN' 
              ? 'Dashboard' 
              : 'MiDia';
            window.location.href = createPageUrl(targetPage);
            return;
          }

          // P0: Linking atómico - actualizar user_id + active en una sola operación
          await base44.entities.UserAccount.update(anyInvitation.id, {
            user_id: authenticatedUser.id,
            active: true,
          });

          // P0 FIX: Sincronizar organization_id al user para RLS
          await base44.auth.updateMe({
            organization_id: anyInvitation.organization_id
          });

          console.log('Invitación activada para', authenticatedUser.email, '→', anyInvitation.organization_id);

          // Redirigir según rol
          const targetPage = anyInvitation.role === 'ORG_ADMIN' || anyInvitation.role === 'BRANCH_ADMIN' 
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

      // CASO 3: SOLO permitir new_company si NO existe NINGUNA invitación
      // P0: Doble check defensivo
      const hasAnyOrgAccount =
        accounts.some(a => a.organization_id) ||
        accountsByEmail.some(a => a.organization_id);

      if (!hasAnyOrgAccount) {
        setMode('new_company');
        return;
      }


      // CASO 5: Usuario huérfano REAL (sin organization_id válido)
      if (accounts.length === 0 && accountsByEmail.every(a => !a.organization_id)) {
        setMode('orphaned_user');
        return;
      }

      // Fallback: si hay cuentas pero no válidas, mostrar huérfano
      setMode('orphaned_user');
    } catch (err) {
      console.error('Error checking user status:', err);
      setMode('orphaned_user');
    }
  };

  const completeInvitedUserSetup = async (user, account) => {
    try {
      // P0: HARDENING - Validación de tenant en invitación
      if (!account.organization_id) {
        throw new Error('La invitación no tiene un tenant asociado. Contacta al administrador.');
      }

      // P0: Vincular UserAccount con user_id y activar (ligado a tenant existente)
      await base44.entities.UserAccount.update(account.id, {
        user_id: user.id,
        active: true,
      });

      // P0: Establecer contexto de tenant activo inmediatamente
      // (AuthContext lo detectará automáticamente al recargar)
      
      setMode('success');
      setTimeout(() => {
        // Redirigir según rol
        if (account.role === 'ORG_ADMIN' || account.role === 'BRANCH_ADMIN') {
          window.location.href = createPageUrl('Dashboard');
        } else {
          window.location.href = createPageUrl('MiDia');
        }
      }, 1500);
    } catch (err) {
      console.error('Error completing invited setup:', err);
      alert('Error al completar el registro: ' + err.message);
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
      // P0: Validación defensiva de campos requeridos
      const companyName = e.target.company_name.value.trim();
      if (!companyName || !selectedCountry || !selectedCurrency) {
        alert('Por favor completa todos los campos requeridos');
        isCreatingOrgRef.current = false;
        setCreating(false);
        return;
      }

      // P0 FIX CRÍTICO: Verificar si tiene INVITACIÓN PENDIENTE (precedencia sobre new_company)
      const allAccounts = await base44.entities.UserAccount.filter({
        user_id: user.id
      });
      const emailAccounts = await base44.entities.UserAccount.filter({
        user_email: user.email
      });

      // Si existe CUALQUIER invitación con organization_id → ABORTAR creación
      const hasInvitation = 
        allAccounts.some(a => a.organization_id) ||
        emailAccounts.some(a => a.organization_id);

      if (hasInvitation) {
        console.warn('⛔ Usuario tiene invitación pendiente, abortando creación de org nueva');
        alert('Detectamos que tienes una invitación pendiente. Refrescando la página para vincular tu cuenta...');
        isCreatingOrgRef.current = false;
        window.location.reload();
        return;
      }

      // P0: DOBLE CHECK - Verificar si ya creó org anteriormente (por refresh/retry)
      const activeAccount = allAccounts.find(a => a.organization_id);
      if (activeAccount) {
        console.log('Usuario ya tiene organización asociada, redirigiendo...');
        isCreatingOrgRef.current = false;
        setMode('success');
        setTimeout(() => {
          window.location.href = createPageUrl('Settings');
        }, 1500);
        return;
      }

      // P0: Verificar si existe una org con este nombre del mismo usuario (anti-duplicación)
      const existingOrgs = await base44.entities.Organization.filter({
        name: companyName
      });
      
      for (const org of existingOrgs) {
        // Verificar si este usuario ya está asociado a esta org
        const orgAccounts = await base44.entities.UserAccount.filter({
          user_id: user.id,
          organization_id: org.id
        });
        if (orgAccounts.length > 0) {
          console.warn('⚠️ Organización duplicada detectada, usando existente');
          isCreatingOrgRef.current = false;
          setMode('success');
          setTimeout(() => {
            window.location.href = createPageUrl('Settings');
          }, 1500);
          return;
        }
      }
      
      // P0: IDEMPOTENCIA - Crear Organization UNA SOLA VEZ
      console.log('Creando nueva organización:', companyName);
      const org = await base44.entities.Organization.create({
        name: companyName,
        country: selectedCountry,
        currency: selectedCurrency,
        plan: 'basic',
        status: 'active',
      });
      console.log('Organización creada exitosamente:', org.id);

      // 2. P0 FIX: Vincular UserAccount al tenant ANTES de crear Branch (requerido por RLS)
      const finalAccounts = await base44.entities.UserAccount.filter({
        user_id: user.id
      });

      if (finalAccounts.length === 0) {
        // Crear UserAccount ÚNICO ligado al tenant
        console.log('Creando UserAccount para ORG_ADMIN');
        await base44.entities.UserAccount.create({
          user_id: user.id,
          user_email: user.email,
          organization_id: org.id,
          role: 'ORG_ADMIN',
          active: true,
        });
      } else {
        // P0: IMPORTANTE - Si ya existe UserAccount sin org, actualizarlo
        // NUNCA crear un segundo UserAccount
        console.log('Actualizando UserAccount existente');
        await base44.entities.UserAccount.update(finalAccounts[0].id, {
          organization_id: org.id,
          role: 'ORG_ADMIN',
          active: true,
        });
      }

      // P0 FIX: Sincronizar organization_id al user para RLS
      await base44.auth.updateMe({
        organization_id: org.id
      });

      console.log('✅ UserAccount vinculado a org:', org.id);

      // 3. P0 FIX: Crear Branch DESPUÉS de vincular UserAccount (idempotente)
      const existingBranches = await base44.entities.Branch.filter({
        organization_id: org.id,
        name: 'Principal'
      });

      if (existingBranches.length === 0) {
        console.log('Creando Branch Principal');
        await base44.entities.Branch.create({
          organization_id: org.id,
          name: 'Principal',
          address: '',
          active: true,
        });
      } else {
        console.log('Branch Principal ya existe, omitiendo creación');
      }

      // 4. SEED CATEGORÍAS BASE (idempotente)
      const categoriasBase = [
        { nombre: "Servicios", permite_stock: false, permite_precio: true, es_vendible: true },
        { nombre: "Repuestos", permite_stock: true, permite_precio: true, es_vendible: true },
        { nombre: "Equipos / Portátiles", permite_stock: true, permite_precio: true, es_vendible: true },
        { nombre: "Accesorios", permite_stock: true, permite_precio: true, es_vendible: true },
        { nombre: "Reciclaje", permite_stock: true, permite_precio: false, es_vendible: false }
      ];

      for (const cat of categoriasBase) {
        const existing = await base44.entities.CategoriaInventario.filter({
          organization_id: org.id,
          nombre: cat.nombre
        });

        if (existing.length === 0) {
          await base44.entities.CategoriaInventario.create({
            ...cat,
            organization_id: org.id,
            activo: true
          });
        }
      }

      console.log('✅ Setup completo para usuario:', user.email);

      // P0: Resetear guard ANTES de success
      isCreatingOrgRef.current = false;

      // P0: Success - redirigir INMEDIATAMENTE
      setMode('success');
      setTimeout(() => {
        window.location.href = createPageUrl('Settings');
      }, 1500);
      
    } catch (err) {
      console.error('❌ Error creating company:', err);
      isCreatingOrgRef.current = false;
      
      // P0: IDEMPOTENCIA - Si falla, verificar si ya se creó parcialmente
      try {
        const retryAccounts = await base44.entities.UserAccount.filter({
          user_id: user.id
        });
        const retryActiveAccount = retryAccounts.find(a => a.organization_id);
        
        if (retryActiveAccount) {
          console.log('Organización creada parcialmente, redirigiendo...');
          isCreatingOrgRef.current = false;
          setMode('success');
          setTimeout(() => {
            window.location.href = createPageUrl('Settings');
          }, 1000);
          return;
        }
      } catch (retryErr) {
        console.error('Error verificando estado:', retryErr);
      }
      
      // Error real - resetear guard
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