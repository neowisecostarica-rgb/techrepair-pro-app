import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageGuard from '../components/guards/PageGuard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Loader2, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Trash2,
  Building2,
  FlaskConical,
  BarChart3
} from 'lucide-react';

export default function AdminSeedCompuStore() {
  return (
    <PageGuard allowedRoles={['SUPER_ADMIN']}>
      <AdminSeedContent />
    </PageGuard>
  );
}

function AdminSeedContent() {
  const queryClient = useQueryClient();
  const [logs, setLogs] = useState([]);
  const [processing, setProcessing] = useState(false);

  // Estados sandbox
  const [sandboxNombre, setSandboxNombre] = useState('Test Org 1');
  const [sandboxEmail, setSandboxEmail] = useState('gustavo+test@compustorecr.com');
  const [incluirSeed, setIncluirSeed] = useState(true);

  // Queries
  const { data: organizations = [] } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => base44.entities.Organization.filter({}),
  });

  const { data: userAccounts = [] } = useQuery({
    queryKey: ['userAccounts'],
    queryFn: () => base44.entities.UserAccount.filter({}),
  });

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const clearLogs = () => setLogs([]);

  // ============================================
  // SANDBOX: Crear tenant de prueba
  // ============================================
  const crearSandbox = async () => {
    if (!sandboxNombre || !sandboxEmail) {
      alert('Nombre y email son requeridos');
      return;
    }

    // Validar que no se use el SUPER_ADMIN
    if (sandboxEmail.includes('gustavo.aguilar@gmail.com')) {
      alert('❌ No puedes usar el email del SUPER_ADMIN. Usa gustavo+test@compustorecr.com');
      return;
    }

    setProcessing(true);
    clearLogs();
    
    try {
      addLog(`Creando organización: ${sandboxNombre}...`, 'info');
      
      // 1. Crear organización
      const org = await base44.entities.Organization.create({
        name: sandboxNombre,
        country: "Costa Rica",
        currency: "CRC",
        plan: "premium",
        status: "active"
      });
      addLog(`✓ Organización creada: ${org.id}`, 'success');

      // 2. Crear branch
      const branch = await base44.entities.Branch.create({
        organization_id: org.id,
        name: "Sucursal Principal",
        direccion: "San José, Costa Rica",
        telefono: "+506 1234-5678",
        email: sandboxEmail,
        es_principal: true
      });
      addLog(`✓ Sucursal creada: ${branch.id}`, 'success');

      // 3. Buscar usuario o invitar
      addLog(`Buscando usuario: ${sandboxEmail}...`, 'info');
      
      // Intentar invitar (si no existe, se crea)
      try {
        await base44.users.inviteUser(sandboxEmail, "user");
        addLog(`✓ Usuario invitado: ${sandboxEmail}`, 'success');
      } catch (error) {
        addLog(`⚠️ Usuario ya existe o error al invitar: ${error.message}`, 'warning');
      }

      // Esperar un momento para que se cree el usuario
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Buscar el user_id
      const allUsers = await base44.entities.User.filter({});
      const targetUser = allUsers.find(u => u.email === sandboxEmail);
      
      if (!targetUser) {
        throw new Error('No se encontró el usuario después de invitar. Intenta de nuevo en unos segundos.');
      }

      // 4. Crear UserAccount
      await base44.entities.UserAccount.create({
        user_id: targetUser.id,
        user_email: sandboxEmail,
        organization_id: org.id,
        branch_id: branch.id,
        role: 'ORG_ADMIN',
        active: true
      });
      addLog(`✓ UserAccount creado como ORG_ADMIN`, 'success');

      // 5. Seed mínimo
      if (incluirSeed) {
        addLog('Cargando seed enriquecido...', 'info');
        await seedEnriquecido(org.id, addLog);
      }

      addLog('🎉 ¡Sandbox creado exitosamente!', 'success');
      
      // Invalidar queries
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['userAccounts'] });

    } catch (error) {
      addLog(`❌ Error: ${error.message}`, 'error');
      console.error('Error creando sandbox:', error);
    } finally {
      setProcessing(false);
    }
  };

  // ============================================
  // SEED ENRIQUECIDO
  // ============================================
  async function seedEnriquecido(orgId, logger) {
    // 5-7 productos con 2 categorías
    const productos = [
      {
        codigo_barras: `7501234${Date.now().toString().slice(-6)}01`,
        sku: "RAM-8GB-DDR4",
        nombre: "Memoria RAM DDR4 8GB Kingston",
        categoria: "repuesto",
        marca: "Kingston",
        modelo: "DDR4-2666",
        cantidad_disponible: 10,
        costo_unitario: 15000,
        precio_venta: 25000,
        ubicacion: "bodega",
        estado: "activo",
        organization_id: orgId
      },
      {
        codigo_barras: `7501234${Date.now().toString().slice(-6)}02`,
        sku: "SSD-256-SATA",
        nombre: "SSD 256GB SATA Samsung",
        categoria: "repuesto",
        marca: "Samsung",
        modelo: "860 EVO",
        cantidad_disponible: 5,
        costo_unitario: 25000,
        precio_venta: 40000,
        ubicacion: "vitrina",
        estado: "activo",
        organization_id: orgId
      },
      {
        codigo_barras: `7501234${Date.now().toString().slice(-6)}03`,
        sku: "MOUSE-LOG-M185",
        nombre: "Mouse Inalámbrico Logitech",
        categoria: "accesorio",
        marca: "Logitech",
        modelo: "M185",
        cantidad_disponible: 20,
        costo_unitario: 3500,
        precio_venta: 7500,
        ubicacion: "vitrina",
        estado: "activo",
        organization_id: orgId
      },
      {
        codigo_barras: `7501234${Date.now().toString().slice(-6)}04`,
        sku: "TECLADO-USB",
        nombre: "Teclado USB Genérico",
        categoria: "accesorio",
        marca: "Generic",
        modelo: "KB-100",
        cantidad_disponible: 15,
        costo_unitario: 2500,
        precio_venta: 5500,
        ubicacion: "vitrina",
        estado: "activo",
        organization_id: orgId
      },
      {
        codigo_barras: `7501234${Date.now().toString().slice(-6)}05`,
        sku: "HDD-1TB-WD",
        nombre: "Disco Duro 1TB Western Digital",
        categoria: "repuesto",
        marca: "Western Digital",
        modelo: "Blue 1TB",
        cantidad_disponible: 8,
        costo_unitario: 20000,
        precio_venta: 35000,
        ubicacion: "bodega",
        estado: "activo",
        organization_id: orgId
      },
      {
        codigo_barras: `7501234${Date.now().toString().slice(-6)}06`,
        sku: "CABLE-HDMI",
        nombre: "Cable HDMI 2.0 1.5m",
        categoria: "accesorio",
        marca: "Generic",
        modelo: "HDMI-150",
        cantidad_disponible: 0, // Stock en 0
        costo_unitario: 1500,
        precio_venta: 3500,
        ubicacion: "vitrina",
        estado: "activo",
        organization_id: orgId
      },
      {
        codigo_barras: `7501234${Date.now().toString().slice(-6)}07`,
        sku: "FUENTE-500W",
        nombre: "Fuente de Poder 500W",
        categoria: "repuesto",
        marca: "Thermaltake",
        modelo: "Smart 500W",
        cantidad_disponible: 3,
        costo_unitario: 18000,
        precio_venta: 32000,
        ubicacion: "bodega",
        estado: "activo",
        organization_id: orgId
      }
    ];

    for (const prod of productos) {
      await base44.entities.Inventario.create(prod);
    }
    logger(`✓ ${productos.length} productos creados (2 categorías, 1 sin stock)`, 'success');

    // 1 Cliente
    await base44.entities.Cliente.create({
      organization_id: orgId,
      nombre_completo: "Juan Pérez Sandbox",
      email: "juan.perez@test.com",
      telefono: "+506 8888-9999",
      identificacion: "1-1234-5678",
      tipo: "individual",
      direccion: "San José, Costa Rica"
    });
    logger('✓ Cliente creado', 'success');

    // 2 Servicios
    await base44.entities.Servicio.create({
      organization_id: orgId,
      nombre: "Diagnóstico General",
      descripcion: "Diagnóstico completo de equipo",
      precio: 5000,
      categoria: "diagnostico",
      activo: true
    });

    await base44.entities.Servicio.create({
      organization_id: orgId,
      nombre: "Reparación Hardware",
      descripcion: "Reparación de componentes hardware",
      precio: 15000,
      categoria: "reparacion",
      activo: true
    });
    logger('✓ 2 servicios creados', 'success');
  }

  // ============================================
  // PRODUCCIÓN: Limpiar todo
  // ============================================
  const limpiarTodo = async () => {
    // Triple confirmación
    const confirm1 = window.confirm("⚠️ ADVERTENCIA: Esto eliminará TODAS las organizaciones y datos asociados. ¿Continuar?");
    if (!confirm1) return;

    const confirm2 = window.confirm("⚠️ ÚLTIMA ADVERTENCIA: Se perderán TODAS las orgs sandbox y sus datos. ¿Confirmar?");
    if (!confirm2) return;

    const confirm3 = window.prompt("Escribe 'ELIMINAR TODO' para confirmar (en mayúsculas):");
    if (confirm3 !== 'ELIMINAR TODO') {
      alert('Operación cancelada');
      return;
    }

    setProcessing(true);
    clearLogs();

    try {
      addLog('🗑️ Iniciando limpieza total...', 'info');

      // Orden estricto de eliminación
      const entities = [
        'DiagnosticoEvidencia',
        'DiagnosticoResultado',
        'DiagnosticoDocumento',
        'VentaItem',
        'PruebaTecnica',
        'NotaInterna',
        'MensajeCliente',
        'Notificacion',
        'ActividadTecnica',
        'SolicitudTecnica',
        'BloqueoTecnico',
        'RegistroTiempo',
        'Diagnostico',
        'OrdenTrabajo',
        'Venta',
        'Cotizacion',
        'Cita',
        'Equipo',
        'Cliente',
        'Lead',
        'Inventario',
        'Servicio',
        'NoConformidad',
        'Reciclaje',
      ];

      for (const entity of entities) {
        try {
          const items = await base44.entities[entity].filter({});
          if (items.length > 0) {
            addLog(`Eliminando ${items.length} de ${entity}...`, 'info');
            for (const item of items) {
              await base44.entities[entity].delete(item.id);
            }
            addLog(`✓ ${entity} limpiado`, 'success');
          }
        } catch (err) {
          addLog(`⚠️ Error en ${entity}: ${err.message}`, 'warning');
        }
      }

      // UserAccounts (PRESERVAR SUPER_ADMIN)
      const accounts = await base44.entities.UserAccount.filter({});
      const safeAccounts = accounts.filter(a => a.role !== 'SUPER_ADMIN');
      if (safeAccounts.length > 0) {
        addLog(`Eliminando ${safeAccounts.length} UserAccounts (preservando SUPER_ADMIN)...`, 'info');
        for (const acc of safeAccounts) {
          await base44.entities.UserAccount.delete(acc.id);
        }
        addLog('✓ UserAccounts limpiados', 'success');
      }

      // Branches
      const branches = await base44.entities.Branch.filter({});
      if (branches.length > 0) {
        addLog(`Eliminando ${branches.length} sucursales...`, 'info');
        for (const branch of branches) {
          await base44.entities.Branch.delete(branch.id);
        }
        addLog('✓ Sucursales eliminadas', 'success');
      }

      // Organizations (ÚLTIMO)
      const orgs = await base44.entities.Organization.filter({});
      if (orgs.length > 0) {
        addLog(`Eliminando ${orgs.length} organizaciones...`, 'info');
        for (const org of orgs) {
          await base44.entities.Organization.delete(org.id);
        }
        addLog('✓ Organizaciones eliminadas', 'success');
      }

      addLog('🎉 Limpieza total completada', 'success');
      
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['userAccounts'] });

    } catch (error) {
      addLog(`❌ Error: ${error.message}`, 'error');
      console.error('Error limpiando:', error);
    } finally {
      setProcessing(false);
    }
  };

  // ============================================
  // PRODUCCIÓN: Crear Compu Store Real
  // ============================================
  const crearCompuStoreReal = async () => {
    // Verificar que no hay orgs
    if (organizations.length > 0) {
      alert('❌ Primero debes ejecutar "Limpiar Todo". Se detectaron organizaciones existentes.');
      return;
    }

    const confirm = window.confirm('¿Crear Compu Store REAL como organización de producción?');
    if (!confirm) return;

    setProcessing(true);
    clearLogs();

    try {
      addLog('Creando Compu Store (PRODUCCIÓN)...', 'info');

      // 1. Organización
      const org = await base44.entities.Organization.create({
        name: "Compu Store",
        legal_name: "Compu Store S.A.",
        country: "Costa Rica",
        currency: "CRC",
        plan: "premium",
        status: "active"
      });
      addLog(`✓ Organización creada: ${org.id}`, 'success');

      // 2. Sucursal
      const branch = await base44.entities.Branch.create({
        organization_id: org.id,
        name: "Sucursal Principal",
        direccion: "San José, Costa Rica",
        telefono: "+506 1234-5678",
        email: "info@compustorecr.com",
        es_principal: true
      });
      addLog(`✓ Sucursal creada: ${branch.id}`, 'success');

      // 3. ORG_ADMIN real: gustavo@compustorecr.com
      const adminEmail = 'gustavo@compustorecr.com';
      addLog(`Configurando ORG_ADMIN: ${adminEmail}...`, 'info');

      try {
        await base44.users.inviteUser(adminEmail, "user");
        addLog(`✓ Usuario invitado: ${adminEmail}`, 'success');
      } catch (error) {
        addLog(`⚠️ Usuario ya existe: ${error.message}`, 'warning');
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      const allUsers = await base44.entities.User.filter({});
      const adminUser = allUsers.find(u => u.email === adminEmail);

      if (!adminUser) {
        throw new Error('No se encontró el usuario admin. Intenta de nuevo.');
      }

      await base44.entities.UserAccount.create({
        user_id: adminUser.id,
        user_email: adminEmail,
        organization_id: org.id,
        branch_id: branch.id,
        role: 'ORG_ADMIN',
        active: true
      });
      addLog(`✓ ORG_ADMIN configurado`, 'success');

      // 4. Seed producción
      addLog('Cargando seed de producción...', 'info');
      await seedEnriquecido(org.id, addLog);

      addLog('🎉 ¡Compu Store REAL creado exitosamente!', 'success');
      
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['userAccounts'] });

    } catch (error) {
      addLog(`❌ Error: ${error.message}`, 'error');
      console.error('Error creando Compu Store:', error);
    } finally {
      setProcessing(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Admin: Seed & Setup</h1>
          <p className="text-slate-600 mt-2">Gestión de tenants y datos iniciales</p>
        </div>

        <Tabs defaultValue="sandbox" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sandbox" className="gap-2">
              <FlaskConical className="w-4 h-4" />
              Sandbox
            </TabsTrigger>
            <TabsTrigger value="produccion" className="gap-2">
              <Building2 className="w-4 h-4" />
              Producción
            </TabsTrigger>
            <TabsTrigger value="estado" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Estado
            </TabsTrigger>
          </TabsList>

          {/* TAB: SANDBOX */}
          <TabsContent value="sandbox" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-blue-600" />
                  Crear Tenant Sandbox
                </CardTitle>
                <CardDescription>
                  Crea organizaciones de prueba sin afectar datos existentes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre de la organización</Label>
                  <Input
                    id="nombre"
                    value={sandboxNombre}
                    onChange={(e) => setSandboxNombre(e.target.value)}
                    placeholder="Test Org 1"
                    disabled={processing}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email del ORG_ADMIN</Label>
                  <Input
                    id="email"
                    type="email"
                    value={sandboxEmail}
                    onChange={(e) => setSandboxEmail(e.target.value)}
                    placeholder="gustavo+test@compustorecr.com"
                    disabled={processing}
                  />
                  <p className="text-sm text-slate-500">
                    ⚠️ NO usar gustavo.aguilar@gmail.com (reservado para SUPER_ADMIN)
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="seed"
                    checked={incluirSeed}
                    onCheckedChange={setIncluirSeed}
                    disabled={processing}
                  />
                  <Label htmlFor="seed" className="cursor-pointer">
                    Incluir seed enriquecido (7 productos, 1 cliente, 2 servicios)
                  </Label>
                </div>

                <Button
                  onClick={crearSandbox}
                  disabled={processing || !sandboxNombre || !sandboxEmail}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <FlaskConical className="w-4 h-4 mr-2" />
                      Crear Sandbox
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Lista de sandboxes existentes */}
            {organizations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Sandboxes Existentes ({organizations.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {organizations.map(org => (
                      <div key={org.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div>
                          <p className="font-medium text-slate-900">{org.name}</p>
                          <p className="text-sm text-slate-500">{org.id}</p>
                        </div>
                        <Badge>{org.status}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* TAB: PRODUCCIÓN */}
          <TabsContent value="produccion" className="space-y-6">
            <Alert>
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>
                <strong>Zona de Producción:</strong> Estas acciones son destructivas y requieren confirmación múltiple.
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-red-600" />
                  Paso 1: Limpiar Todo
                </CardTitle>
                <CardDescription>
                  Elimina TODAS las organizaciones y datos (preserva SUPER_ADMIN)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={limpiarTodo}
                  disabled={processing}
                  variant="destructive"
                  className="w-full"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Limpiando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      🗑️ Limpiar Todo (Requiere 3 confirmaciones)
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-emerald-600" />
                  Paso 2: Crear Compu Store Real
                </CardTitle>
                <CardDescription>
                  Crea la organización de producción con gustavo@compustorecr.com como ORG_ADMIN
                </CardDescription>
              </CardHeader>
              <CardContent>
                {organizations.length > 0 && (
                  <Alert className="mb-4">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>
                      Primero debes ejecutar "Limpiar Todo". Se detectaron {organizations.length} organizaciones existentes.
                    </AlertDescription>
                  </Alert>
                )}
                
                <Button
                  onClick={crearCompuStoreReal}
                  disabled={processing || organizations.length > 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <Building2 className="w-4 h-4 mr-2" />
                      🏢 Crear Compu Store REAL
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: ESTADO */}
          <TabsContent value="estado" className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Organizaciones</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-slate-900">{organizations.length}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Usuarios</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-slate-900">{userAccounts.length}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Estado</CardTitle>
                </CardHeader>
                <CardContent>
                  {organizations.length === 0 ? (
                    <Badge className="bg-emerald-100 text-emerald-800">Limpio</Badge>
                  ) : (
                    <Badge className="bg-blue-100 text-blue-800">Con datos</Badge>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Detalles de Usuarios</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {userAccounts.map(acc => (
                    <div key={acc.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <p className="font-medium text-slate-900">{acc.user_email}</p>
                        <p className="text-sm text-slate-500">Org: {acc.organization_id || 'N/A'}</p>
                      </div>
                      <Badge variant={acc.role === 'SUPER_ADMIN' ? 'destructive' : 'default'}>
                        {acc.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* LOGS */}
        {logs.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Logs de Operación</CardTitle>
                <Button onClick={clearLogs} variant="outline" size="sm">
                  Limpiar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg max-h-96 overflow-y-auto font-mono text-sm space-y-1">
                {logs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <span className="text-slate-500 text-xs">{log.timestamp}</span>
                    {log.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                    {log.type === 'error' && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                    {log.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                    {log.type === 'info' && <span className="w-4 h-4 flex-shrink-0" />}
                    <span className={`flex-1 ${
                      log.type === 'success' ? 'text-emerald-400' :
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'warning' ? 'text-amber-400' :
                      'text-slate-300'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}