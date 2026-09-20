import { base44 } from '@/api/base44Client';
export async function manageAssetAssignment(payload){const response=await base44.functions.invoke('manageAssetAssignment',payload);return response?.data??response;}
