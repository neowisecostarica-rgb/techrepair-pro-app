import React from 'react';
import { resolveAdPlacement } from '@/config/adPlacements';

// First-party visual reservation only. No scripts, trackers, external frames,
// network calls, campaign content or client data leave TRP.
export default function WorkspaceAdSlot({ policy, organizationId, page, placement, forcePreview = false }) {
  const slot = resolveAdPlacement(policy, organizationId, page, placement);
  if (!slot || slot.preview !== true) return null;
  return (
    <aside aria-label="Espacio publicitario" data-ad-placement={placement}
      className={`mx-auto mb-5 w-full min-w-0 overflow-hidden rounded-xl border border-dashed border-teal-200 bg-[#f6f9f8] text-slate-600 ${placement === "workspace_side" && !forcePreview ? "hidden xl:block shrink-0 self-start" : ""}`}
      style={{ maxWidth: slot.width }}>
      <div className="flex items-center justify-center px-3 text-center" style={{ aspectRatio: slot.width / slot.height }}>
        <span className="text-xs font-medium">Espacio publicitario · vista previa</span>
      </div>
    </aside>
  );
}
