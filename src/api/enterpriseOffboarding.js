import { base44 } from '@/api/base44Client';
export async function manageEnterpriseOffboarding(payload){const r=await base44.functions.invoke('manageEnterpriseOffboarding',payload);return r?.data??r;}
