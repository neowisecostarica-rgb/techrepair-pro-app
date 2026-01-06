import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, Loader2, Database } from 'lucide-react';

export default function MigrationAdmin() {
  const [status, setStatus] = useState({});
  const [processing, setProcessing] = useState(false);
  const [legacyOrgId, setLegacyOrgId] = useState(null);

  const log = (entity, message, type = 'info') => {
    setStatus(prev => ({
      ...prev,
      [entity]: { message, type }
    }));
  };

  const step0_CreateLegacyOrg = async () => {
    log('legacy', 'Buscando Legacy Organization...', 'loading');
    
    try {
      const orgs = await base44.entities.Organization.filter({ name: 'Legacy Organization' });
      
      if (orgs.length > 0) {
        setLegacyOrgId(orgs[0].id);
        log('legacy', `✅ Legacy Organization existe: ${orgs[0].id}`, 'success');
        return orgs[0].id;
      }
      
      log('legacy', 'Creando Legacy Organization...', 'loading');
      const legacyOrg = await base44.entities.Organization.create({
        name: 'Legacy Organization',
        country: 'N/A',
        currency: 'USD',
        plan: 'premium',
        status: 'active'
      });
      
      setLegacyOrgId(legacyOrg.id);
      log('legacy', `✅ Legacy Organization creada: ${legacyOrg.id}`, 'success');
      return legacyOrg.id;
    } catch (err) {
      log('legacy', `❌ Error: ${err.message}`, 'error');
      throw err;
    }
  };

  const step2_MigrateEntity = async (entityName, orgId) => {
    log(entityName, 'Listando registros...', 'loading');
    
    try {
      const records = await base44.entities[entityName].list();
      log(entityName, `Encontrados ${records.length} registros`, 'info');
      
      let migrated = 0;
      for (const record of records) {
        if (!record.organization_id) {
          await base44.entities[entityName].update(record.id, {
            organization_id: orgId
          });
          migrated++;
        }
      }
      
      log(entityName, `✅ Migrados ${migrated} de ${records.length} registros`, 'success');
      return { total: records.length, migrated };
    } catch (err) {
      log(entityName, `❌ Error: ${err.message}`, 'error');
      throw err;
    }
  };

  const step3_Verify = async (entityName) => {
    log(entityName + '_verify', 'Verificando...', 'loading');
    
    try {
      const records = await base44.entities[entityName].list();
      const missing = records.filter(r => !r.organization_id);
      
      if (missing.length > 0) {
        log(entityName + '_verify', `⚠️ ${missing.length} registros sin organization_id`, 'warning');
        return false;
      }
      
      log(entityName + '_verify', `✅ Todos los registros tienen organization_id`, 'success');
      return true;
    } catch (err) {
      log(entityName + '_verify', `❌ Error: ${err.message}`, 'error');
      return false;
    }
  };

  const runFullMigration = async () => {
    setProcessing(true);
    setStatus({});
    
    try {
      // PASO 0: Legacy Organization
      const orgId = await step0_CreateLegacyOrg();
      
      // PASO 2: Migración Fase 1
      const entities = ['Cliente', 'Equipo', 'Inventario'];
      for (const entity of entities) {
        await step2_MigrateEntity(entity, orgId);
      }
      
      // PASO 3: Verificación
      let allVerified = true;
      for (const entity of entities) {
        const verified = await step3_Verify(entity);
        if (!verified) allVerified = false;
      }
      
      if (allVerified) {
        log('final', '✅ Migración completada. Ahora puedes hacer required en schemas', 'success');
      } else {
        log('final', '⚠️ Hay registros sin migrar. NO hagas required aún', 'warning');
      }
      
    } catch (err) {
      log('final', `❌ Error general: ${err.message}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const makeRequired = async () => {
    log('required', '⚠️ Debes modificar manualmente los schemas para agregar organization_id a "required"', 'warning');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Migración Multitenancy - Fase 1</h1>
        <p className="text-slate-500">Cliente, Equipo, Inventario</p>
      </div>

      <Card className="border-0 shadow-lg bg-yellow-50 border-l-4 border-l-yellow-500">
        <CardContent className="p-6">
          <p className="text-sm text-slate-700">
            <strong>IMPORTANTE:</strong> Esta migración:
          </p>
          <ul className="list-disc list-inside text-sm text-slate-700 mt-2 space-y-1">
            <li>Crea "Legacy Organization" si no existe</li>
            <li>Migra datos existentes a Legacy Organization</li>
            <li>Verifica que todos tengan organization_id</li>
            <li>Debes hacer "required" manualmente después</li>
          </ul>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button 
          onClick={runFullMigration}
          disabled={processing}
          className="bg-gradient-to-r from-emerald-500 to-blue-500"
        >
          {processing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Procesando...
            </>
          ) : (
            <>
              <Database className="w-5 h-5 mr-2" />
              Ejecutar Migración Completa
            </>
          )}
        </Button>
        
        <Button 
          onClick={makeRequired}
          variant="outline"
          disabled={processing}
        >
          Info: Hacer Required
        </Button>
      </div>

      {/* Status Log */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b border-slate-100">
          <CardTitle>Log de Migración</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {Object.keys(status).length === 0 ? (
            <p className="text-slate-400 text-center py-8">No hay logs aún. Ejecuta la migración.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(status).map(([key, value]) => {
                let icon = null;
                let colorClass = 'text-slate-600';
                
                if (value.type === 'success') {
                  icon = <CheckCircle className="w-5 h-5 text-green-600" />;
                  colorClass = 'text-green-700';
                } else if (value.type === 'error') {
                  icon = <AlertTriangle className="w-5 h-5 text-red-600" />;
                  colorClass = 'text-red-700';
                } else if (value.type === 'warning') {
                  icon = <AlertTriangle className="w-5 h-5 text-yellow-600" />;
                  colorClass = 'text-yellow-700';
                } else if (value.type === 'loading') {
                  icon = <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
                  colorClass = 'text-blue-700';
                }
                
                return (
                  <div key={key} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    {icon}
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">{key}</p>
                      <p className={`text-sm ${colorClass}`}>{value.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {legacyOrgId && (
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Badge className="bg-emerald-100 text-emerald-700 border-0">Legacy Org ID</Badge>
              <code className="text-sm font-mono bg-slate-100 px-3 py-1 rounded">{legacyOrgId}</code>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}