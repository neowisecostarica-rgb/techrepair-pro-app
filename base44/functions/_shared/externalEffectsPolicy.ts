export const EMAIL_EFFECT_STATUS = Object.freeze({
  PENDING: 'pending',
  SENT: 'sent',
  SUPPRESSED_FOR_QA: 'suppressed_for_qa',
  FAILED: 'failed',
});

export function resolveExternalEffectsMode() {
  const mode = Deno.env.get('TRP_EXTERNAL_EFFECTS_MODE');
  if (mode === 'PRODUCTION') return 'PRODUCTION';
  // TEST_SINK is deliberately unsupported in P0-01; unknown/missing config blocks.
  return 'TEST_BLOCKED';
}

export async function dispatchExternalEmail({ message, send }) {
  const mode = resolveExternalEffectsMode();
  if (mode === 'TEST_BLOCKED') {
    return { status: EMAIL_EFFECT_STATUS.SUPPRESSED_FOR_QA, mode };
  }
  try {
    await send(message);
    return { status: EMAIL_EFFECT_STATUS.SENT, mode };
  } catch (error) {
    return { status: EMAIL_EFFECT_STATUS.FAILED, mode, error: error?.message || String(error) };
  }
}
