import { appendAuditEvent } from './auditEvent.ts';
import { evaluateCommandPolicy } from './commandPolicy.ts';

const EVALUATED_DECISIONS = new WeakSet();

function decision(value, fallbackCode) {
  if (typeof value === 'boolean') return { ok: value, code: value ? 'ALLOW' : fallbackCode };
  return {
    ok: value?.ok === true,
    code: typeof value?.code === 'string'
      ? value.code.slice(0, 120)
      : (value?.ok === true ? 'ALLOW' : fallbackCode),
  };
}

function seal(value, shadow) {
  const evaluated = Object.freeze({
    ...value,
    shadow: Object.freeze({ ...shadow }),
  });
  EVALUATED_DECISIONS.add(evaluated);
  return evaluated;
}

function denyFrom(value, code, shadow) {
  return seal({
    ...value,
    ok: false,
    status: 503,
    code,
  }, shadow);
}

async function recordShadowMismatch(base44, authorization, policyId, authoritative, compatibility, audit) {
  return appendAuditEvent(base44, {
    eventType: 'AUTHORIZATION_SHADOW_MISMATCH',
    principalClass: authorization.principalClass,
    actorUserId: audit.actorUserId || null,
    actorPrimaryRole: authorization.persistedRole || authorization.role || null,
    organizationId: authorization.organizationId,
    branchId: audit.branchId || null,
    resourceType: audit.resourceType,
    resourceId: audit.resourceId,
    commandPolicyId: policyId,
    correlationId: audit.correlationId,
    auditOperationId: crypto.randomUUID(),
    operationKey: audit.operationKey || null,
    operationSemantics: { authoritative_allowed: authoritative.ok, compatibility_allowed: compatibility.ok },
    outcome: authoritative.ok ? 'FAILED' : 'DENIED',
    priorState: {
      compatibility_allowed: compatibility.ok,
      compatibility_code: compatibility.code,
    },
    newState: {
      authoritative_allowed: authoritative.ok,
      authoritative_code: authoritative.code || 'ALLOW',
    },
    metadata: {
      mode: 'OBSERVE_ONLY',
      shadow_can_grant: false,
      endpoint: authoritative.policy?.endpoint || null,
      writer: authoritative.policy?.writer || null,
    },
  });
}

/**
 * Canonical evaluation plus observe-only compatibility comparison.
 * The compatibility result can never replace or relax the canonical result.
 */
export async function evaluateCommandPolicyWithShadow({
  base44,
  policyId,
  authorization,
  relationship,
  authorityContract = null,
  commandCapability = null,
  commandRelationship = null,
  scopeSatisfied = true,
  preconditionSatisfied = true,
  preconditionStatus = 403,
  preconditionCode = 'COMMAND_PRECONDITION_DENIED',
  compatibilityDecision,
  audit = null,
}) {
  const authoritative = evaluateCommandPolicy({
    policyId,
    authorization,
    relationship,
    authorityContract,
    commandCapability,
    commandRelationship,
    scopeSatisfied,
    preconditionSatisfied,
    preconditionStatus,
    preconditionCode,
  });
  const compatibility = decision(compatibilityDecision, 'COMPATIBILITY_DENY');
  const mismatch = authoritative.ok !== compatibility.ok
    || (!authoritative.ok && !compatibility.ok && authoritative.code !== compatibility.code);
  const shadow = {
    mode: 'OBSERVE_ONLY',
    authoritativeAllowed: authoritative.ok,
    compatibilityAllowed: compatibility.ok,
    compatibilityCode: compatibility.code,
    mismatch,
    evidenceRecorded: false,
  };

  if (!mismatch) return seal(authoritative, shadow);
  if (!audit || !base44 || !authorization?.organizationId) {
    return authoritative.ok
      ? denyFrom(authoritative, 'SHADOW_AUTHORIZATION_AUDIT_CONTEXT_REQUIRED', shadow)
      : seal(authoritative, shadow);
  }

  try {
    await recordShadowMismatch(base44, authorization, policyId, authoritative, compatibility, audit);
    return seal(authoritative, { ...shadow, evidenceRecorded: true });
  } catch (error) {
    const auditFailure = { ...shadow, auditError: String(error?.message || error).slice(0, 160) };
    return authoritative.ok
      ? denyFrom(authoritative, 'SHADOW_AUTHORIZATION_AUDIT_REQUIRED', auditFailure)
      : seal(authoritative, auditFailure);
  }
}

export class SovereignCommandError extends Error {
  constructor(message, code, status = 403) {
    super(message);
    this.name = 'SovereignCommandError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Dispatch an evaluated command to its named sovereign writer callback.
 * Business mutation logic remains owned by that writer.
 */
export async function ExecuteSovereignCommand({ decision: evaluated, sovereignWriter, execute }) {
  if (!evaluated || !EVALUATED_DECISIONS.has(evaluated)) {
    throw new SovereignCommandError('La decision no proviene del evaluador canonico', 'UNEVALUATED_COMMAND_DECISION');
  }
  if (!evaluated.ok) {
    throw new SovereignCommandError('El comando no esta autorizado', evaluated.code || 'COMMAND_DENIED', evaluated.status || 403);
  }
  if (evaluated.policy?.writer !== sovereignWriter) {
    throw new SovereignCommandError('El writer no coincide con la politica autorizada', 'SOVEREIGN_WRITER_MISMATCH');
  }
  if (typeof execute !== 'function') {
    throw new SovereignCommandError('El writer soberano no es ejecutable', 'SOVEREIGN_WRITER_REQUIRED', 500);
  }
  return execute();
}

export const executeSovereignCommand = ExecuteSovereignCommand;
