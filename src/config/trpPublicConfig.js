export const TRP_PUBLIC_CONFIG_KEY = 'trpPublicConfig';
export const TRP_PUBLIC_DEFAULTS = { contactEmail: '' };
export function readTRPPublicConfig(){ if(typeof window==='undefined') return TRP_PUBLIC_DEFAULTS; try{return {...TRP_PUBLIC_DEFAULTS,...JSON.parse(localStorage.getItem(TRP_PUBLIC_CONFIG_KEY)||'{}')}}catch{return TRP_PUBLIC_DEFAULTS}}
export function writeTRPPublicConfig(value){localStorage.setItem(TRP_PUBLIC_CONFIG_KEY,JSON.stringify({...TRP_PUBLIC_DEFAULTS,...value}))}
