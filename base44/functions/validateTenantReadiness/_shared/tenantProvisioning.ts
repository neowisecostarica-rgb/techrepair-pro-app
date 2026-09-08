import { AUTHORIZATION_PRESET_VERSION } from './roleCapabilities.ts';

export const BASE_INVENTORY_CATEGORIES = Object.freeze([
  { nombre: 'Servicios', permite_stock: false, permite_precio: true, es_vendible: true },
  { nombre: 'Repuestos', permite_stock: true, permite_precio: true, es_vendible: true },
  { nombre: 'Equipos / Portatiles', permite_stock: true, permite_precio: true, es_vendible: true },
  { nombre: 'Accesorios', permite_stock: true, permite_precio: true, es_vendible: true },
  { nombre: 'Reciclaje', permite_stock: true, permite_precio: false, es_vendible: false },
]);

export function canonicalOrganizationData(input, correlationId) {
  return {
    ...input,
    status: 'active',
    authorization_preset_version: AUTHORIZATION_PRESET_VERSION,
    custom_grants_enabled: false,
    provisioning_status: 'PENDING',
    provisioning_correlation_id: correlationId,
    inventario_config: input.inventario_config || { dias_dinero_dormido: 90 },
    garantia_config: input.garantia_config || {},
    saldo_caja_inicial: Number(input.saldo_caja_inicial || 0),
    saldo_caja_actual: Number(input.saldo_caja_actual || 0),
    marketing_spend: Number(input.marketing_spend || 0),
  };
}

export function canonicalPrimaryBranchData(organizationId) {
  return { organization_id: organizationId, name: 'Sucursal Principal', normalized_name: 'sucursal principal', active: true, is_primary: true };
}

export function canonicalOwnerMembershipData({ organizationId, userId = null, email, status }) {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    user_email: email,
    organization_id: organizationId,
    branch_id: null,
    role: 'ORG_ADMIN',
    status,
    active: status === 'active',
    ...(status === 'active' ? { accepted_at: now } : { invited_at: now }),
  };
}

export async function seedBaselineCategories(base44, organizationId, created = []) {
  const records = [];
  for (const category of BASE_INVENTORY_CATEGORIES) {
    const existing = await base44.asServiceRole.entities.CategoriaInventario.filter({ organization_id: organizationId, nombre: category.nombre }, '-created_date', 2);
    if (existing?.length > 1) throw new Error(`PROVISIONING_CATEGORY_AMBIGUOUS:${category.nombre}`);
    if (existing?.length === 1) { records.push(existing[0]); continue; }
    const record = await base44.asServiceRole.entities.CategoriaInventario.create({ ...category, organization_id: organizationId, activo: true });
    created.push({ entity: 'CategoriaInventario', id: record.id });
    records.push(record);
  }
  return records;
}

export async function validateTenantReadiness(base44, organizationId, { requireReadyMarker = true } = {}) {
  const [organizations, branches, accounts, categories] = await Promise.all([
    base44.asServiceRole.entities.Organization.filter({ id: organizationId }, '-created_date', 2),
    base44.asServiceRole.entities.Branch.filter({ organization_id: organizationId, active: true }, '-created_date', 500),
    base44.asServiceRole.entities.UserAccount.filter({ organization_id: organizationId, role: 'ORG_ADMIN' }, '-created_date', 500),
    base44.asServiceRole.entities.CategoriaInventario.filter({ organization_id: organizationId, activo: true }, '-created_date', 500),
  ]);
  const organization = organizations?.length === 1 ? organizations[0] : null;
  const primaryBranches = (branches || []).filter(branch => branch.is_primary === true || branch.normalized_name === 'sucursal principal');
  const owners = (accounts || []).filter(account => ['active', 'invited'].includes(account.status) && !account.branch_id);
  const categoryNames = new Set((categories || []).map(category => category.nombre));
  const missingCategories = BASE_INVENTORY_CATEGORIES.map(category => category.nombre).filter(name => !categoryNames.has(name));
  const checks = {
    organization_active: organization?.status === 'active',
    primary_branch_active: primaryBranches.length === 1,
    owner_org_admin: owners.length >= 1,
    owner_organization_wide: owners.every(owner => !owner.branch_id),
    baseline_categories: missingCategories.length === 0,
    preset_version: organization?.authorization_preset_version === AUTHORIZATION_PRESET_VERSION,
    custom_grants_disabled: organization?.custom_grants_enabled === false,
    provisioning_ready: !requireReadyMarker || organization?.provisioning_status === 'READY',
  };
  return {
    ready: Object.values(checks).every(Boolean),
    organization_id: organizationId,
    preset_version: AUTHORIZATION_PRESET_VERSION,
    checks,
    missing_categories: missingCategories,
    primary_branch_ids: primaryBranches.map(branch => branch.id),
    owner_account_ids: owners.map(account => account.id),
  };
}
