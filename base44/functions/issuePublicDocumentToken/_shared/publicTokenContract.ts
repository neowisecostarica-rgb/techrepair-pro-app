export const PUBLIC_TOKEN_MAX_TTL_DAYS = Object.freeze({
  WORK_ORDER_STATUS_READ: 30,
  QUOTE_DECISION: 7,
  WARRANTY_READ: 365,
  RECEIPT_READ: 365,
});

export function tokenExpiry(issuedAt, purpose) {
  const maxDays = PUBLIC_TOKEN_MAX_TTL_DAYS[purpose];
  if (!maxDays) throw new Error('PUBLIC_TOKEN_PURPOSE_INVALID');
  return new Date(Date.parse(issuedAt) + maxDays * 24 * 60 * 60 * 1000).toISOString();
}

export function issuePublicTokenMetadata({ purpose, resourceId, version = 'v1', now = new Date().toISOString(), token = crypto.randomUUID() }) {
  if (!PUBLIC_TOKEN_MAX_TTL_DAYS[purpose] || !resourceId) throw new Error('PUBLIC_TOKEN_ISSUE_INVALID');
  return {
    public_access_token: token,
    public_access_purpose: purpose,
    public_access_resource_id: resourceId,
    public_access_version: String(version),
    public_access_issued_at: now,
    public_access_expires_at: tokenExpiry(now, purpose),
    public_access_revoked_at: null,
    public_access_consumed_at: null,
  };
}

export function validatePublicTokenRecord(record, { token, purpose, resourceId, version, now = Date.now(), allowConsumed = false }) {
  const deny = code => ({ ok: false, code });
  if (!record || typeof token !== 'string' || record.public_access_token !== token) return deny('PUBLIC_TOKEN_INVALID');
  if (record.public_access_purpose !== purpose) return deny('PUBLIC_TOKEN_WRONG_PURPOSE');
  if (record.public_access_resource_id !== resourceId) return deny('PUBLIC_TOKEN_WRONG_RESOURCE');
  if (String(record.public_access_version) !== String(version)) return deny('PUBLIC_TOKEN_STALE_VERSION');
  if (record.public_access_revoked_at) return deny('PUBLIC_TOKEN_REVOKED');
  if (record.public_access_consumed_at && !allowConsumed) return deny('PUBLIC_TOKEN_CONSUMED');
  const issuedAt = Date.parse(record.public_access_issued_at || '');
  const expiresAt = Date.parse(record.public_access_expires_at || '');
  const maxDays = PUBLIC_TOKEN_MAX_TTL_DAYS[purpose];
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= now) return deny('PUBLIC_TOKEN_EXPIRED');
  if (expiresAt - issuedAt > maxDays * 24 * 60 * 60 * 1000) return deny('PUBLIC_TOKEN_TTL_EXCEEDED');
  return { ok: true };
}

export async function publicTokenReference(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

