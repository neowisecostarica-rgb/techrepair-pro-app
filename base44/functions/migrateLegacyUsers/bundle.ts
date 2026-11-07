// base44/functions/migrateLegacyUsers/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";

// base44/functions/_shared/roleCapabilities.ts
var TENANT_ROLES = Object.freeze([
  "ORG_ADMIN",
  "BRANCH_ADMIN",
  "TECHNICIAN",
  "SALES",
  "INVENTORY",
  "CUSTOMER_SERVICE"
]);
var CAPABILITIES = Object.freeze([
  "ORG_ADMINISTRATION",
  "BRANCH_ADMINISTRATION",
  "USER_ADMINISTRATION",
  "RECEPTION_OPERATIONS",
  "CUSTOMER_READ_OPERATIONAL",
  "CUSTOMER_SERVICE_OPERATIONS",
  "TECHNICAL_WORK",
  "TECHNICAL_SUPERVISION",
  "TECHNICAL_ASSIGNMENT",
  "QUOTE_OPERATIONS",
  "SALE_OPERATIONS",
  "COMMERCIAL_READ",
  "FINANCIAL_READ",
  "INVENTORY_READ",
  "INVENTORY_OPERATIONS",
  "INVENTORY_ADMINISTRATION",
  "DELIVERY_OPERATIONS",
  "CRM_OPERATIONS",
  "AGENDA_OPERATIONS"
]);
var ROLE_CAPABILITY_PRESETS = Object.freeze({
  ORG_ADMIN: CAPABILITIES,
  BRANCH_ADMIN: [
    "BRANCH_ADMINISTRATION",
    "RECEPTION_OPERATIONS",
    "CUSTOMER_READ_OPERATIONAL",
    "CUSTOMER_SERVICE_OPERATIONS",
    "TECHNICAL_WORK",
    "TECHNICAL_SUPERVISION",
    "TECHNICAL_ASSIGNMENT",
    "QUOTE_OPERATIONS",
    "SALE_OPERATIONS",
    "COMMERCIAL_READ",
    "FINANCIAL_READ",
    "INVENTORY_READ",
    "INVENTORY_OPERATIONS",
    "INVENTORY_ADMINISTRATION",
    "DELIVERY_OPERATIONS",
    "CRM_OPERATIONS",
    "AGENDA_OPERATIONS"
  ],
  TECHNICIAN: [
    "CUSTOMER_READ_OPERATIONAL",
    "TECHNICAL_WORK",
    "COMMERCIAL_READ",
    "INVENTORY_READ",
    "INVENTORY_OPERATIONS"
  ],
  SALES: [
    "RECEPTION_OPERATIONS",
    "CUSTOMER_READ_OPERATIONAL",
    "CUSTOMER_SERVICE_OPERATIONS",
    "TECHNICAL_ASSIGNMENT",
    "QUOTE_OPERATIONS",
    "SALE_OPERATIONS",
    "COMMERCIAL_READ",
    "INVENTORY_READ",
    "DELIVERY_OPERATIONS",
    "CRM_OPERATIONS",
    "AGENDA_OPERATIONS"
  ],
  INVENTORY: [
    "CUSTOMER_READ_OPERATIONAL",
    "COMMERCIAL_READ",
    "INVENTORY_READ",
    "INVENTORY_OPERATIONS",
    "INVENTORY_ADMINISTRATION"
  ],
  CUSTOMER_SERVICE: [
    "RECEPTION_OPERATIONS",
    "CUSTOMER_READ_OPERATIONAL",
    "CUSTOMER_SERVICE_OPERATIONS",
    "COMMERCIAL_READ",
    "DELIVERY_OPERATIONS",
    "AGENDA_OPERATIONS"
  ]
});

// base44/functions/_shared/userAuthorization.ts
function isCanonicalSuperAdmin(user) {
  return user?.role === "admin";
}

// base44/functions/migrateLegacyUsers/entry.ts
var VALID_ROLES = /* @__PURE__ */ new Set(["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN", "SALES", "INVENTORY", "SUPPORT"]);
var VALID_STATUSES = /* @__PURE__ */ new Set(["invited", "active", "suspended"]);
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });
    if (!isCanonicalSuperAdmin(user)) {
      return Response.json({ error: "Superadmin can\xF3nico requerido" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    if (body.dry_run === false) {
      return Response.json({
        error: "La migraci\xF3n mutante est\xE1 deshabilitada",
        code: "MUTATING_MIGRATION_DISABLED"
      }, { status: 403 });
    }
    const accounts = await base44.asServiceRole.entities.UserAccount.list("-created_date", 500);
    const findings = (accounts || []).flatMap((account) => {
      const issues = [];
      if (!account.organization_id) issues.push("missing_organization_id");
      if (!VALID_ROLES.has(account.role)) issues.push("invalid_role");
      if (!VALID_STATUSES.has(account.status)) issues.push("missing_or_invalid_status");
      return issues.length > 0 ? [{ account_id: account.id, issues }] : [];
    });
    return Response.json({
      dry_run: true,
      mutation_enabled: false,
      total_accounts: accounts?.length || 0,
      findings
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
