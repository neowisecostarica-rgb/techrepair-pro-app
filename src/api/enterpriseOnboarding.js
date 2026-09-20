import { base44 } from '@/api/base44Client';
export async function manageEnterpriseOnboarding(payload){const r=await base44.functions.invoke('manageEnterpriseOnboarding',payload);return r?.data??r;}
