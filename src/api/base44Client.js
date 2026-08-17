import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Raw SDK access is never exported. Operational entities are backend-owned and
// transparently routed through operationalGateway so PageGuard cannot become an
// authorization boundary by accident.
const rawBase44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

const protectedOperationalEntities = new Set([
  'ActividadTecnica',
  'BloqueoTecnico',
  'Branch',
  'CategoriaInventario',
  'Cita',
  'Cliente',
  'ComprobanteVentaLog',
  'Cotizacion',
  'DiagnosticMasterRecord',
  'Diagnostico',
  'DiagnosticoDocumento',
  'DiagnosticoEvidencia',
  'DiagnosticoResultado',
  'DiagnosticoTecnico',
  'EntregaLog',
  'Equipo',
  'Expense',
  'Garantia',
  'Inventario',
  'InventarioHistorial',
  'InventarioReserva',
  'NoConformidad',
  'NotaInterna',
  'Notificacion',
  'OTEvent',
  'OrdenTrabajo',
  'PreDiagnostico',
  'PruebaTecnica',
  'PurchaseInvoice',
  'Reciclaje',
  'RegistroTiempo',
  'Servicio',
  'SolicitudTecnica',
  'Supplier',
  'SupplierPayment',
  'TerminosYCondiciones',
  'Venta',
  'VentaItem',
  'WorkflowGate',
]);

const custodyAwareTechnicalEntities = new Set([
  'BloqueoTecnico',
  'Diagnostico',
  'DiagnosticoDocumento',
  'DiagnosticoEvidencia',
  'DiagnosticoResultado',
  'DiagnosticoTecnico',
  'NotaInterna',
  'RegistroTiempo',
]);

async function invokeOperational(payload) {
  const response = await rawBase44.functions.invoke('operationalGateway', payload);
  return response?.data ?? response;
}

async function invokeTechnicalRecord(payload) {
  const response = await rawBase44.functions.invoke('technicalRecordCommand', payload);
  const result = response?.data ?? response;
  return result?.record ?? result;
}

function protectedEntity(entityName) {
  return {
    async filter(filter = {}, sort = '-created_date', limit = 100) {
      if (typeof sort === 'number') {
        limit = sort;
        sort = '-created_date';
      }
      const result = await invokeOperational({
        operation: 'read',
        method: 'filter',
        entity: entityName,
        filter,
        sort,
        limit,
      });
      return result?.records || [];
    },
    async list(sort = '-created_date', limit = 100) {
      if (typeof sort === 'number') {
        limit = sort;
        sort = '-created_date';
      }
      const result = await invokeOperational({
        operation: 'read',
        method: 'list',
        entity: entityName,
        sort,
        limit,
      });
      return result?.records || [];
    },
    async get(id) {
      const result = await invokeOperational({
        operation: 'read',
        method: 'filter',
        entity: entityName,
        filter: { id },
        limit: 1,
      });
      return result?.records?.[0] || null;
    },
    create(data) {
      if (custodyAwareTechnicalEntities.has(entityName)) {
        return invokeTechnicalRecord({ operation: 'create', entity: entityName, data });
      }
      return invokeOperational({ operation: 'create', entity: entityName, data });
    },
    update(id, data) {
      if (custodyAwareTechnicalEntities.has(entityName)) {
        return invokeTechnicalRecord({ operation: 'update', entity: entityName, id, data });
      }
      return invokeOperational({ operation: 'update', entity: entityName, id, data });
    },
    delete(id) {
      if (custodyAwareTechnicalEntities.has(entityName)) {
        return invokeTechnicalRecord({ operation: 'delete', entity: entityName, id });
      }
      return invokeOperational({
        operation: 'delete',
        entity: entityName,
        ...(id && typeof id === 'object' ? { filter: id.query || id } : { id }),
      });
    },
  };
}

const operationalEntityCache = new Map();
const entities = new Proxy(rawBase44.entities, {
  get(target, entityName, receiver) {
    if (typeof entityName === 'string' && protectedOperationalEntities.has(entityName)) {
      if (!operationalEntityCache.has(entityName)) {
        operationalEntityCache.set(entityName, protectedEntity(entityName));
      }
      return operationalEntityCache.get(entityName);
    }
    return Reflect.get(target, entityName, receiver);
  },
});

export const base44 = new Proxy(rawBase44, {
  get(target, property, receiver) {
    if (property === 'entities') return entities;
    return Reflect.get(target, property, receiver);
  },
});
