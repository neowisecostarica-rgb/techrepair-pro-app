// Local UX state only. It must never authorize tenant access or a backend write.
export const ONBOARDING_STEPS = ['welcome','business','team','first_ot'];
export function optionalProgressStorage(browser = typeof window === "undefined" ? null : window) {
  try { return browser?.localStorage ?? null; } catch { return null; }
}
export function progressKey(appId,userId,orgId){
  if (![appId,userId,orgId].every(x=>typeof x==='string'&&x.length>0)) return null;
  return 'trp:onboarding:v1:'+JSON.stringify([appId,userId,orgId]);
}
export function readProgress(storage,key){
  if(!key) return null;
  try { const value=storage.getItem(key); return ONBOARDING_STEPS.includes(value)?value:null; } catch {return null;}
}
export function saveProgress(storage,key,step){
  if(!key||!ONBOARDING_STEPS.includes(step)) return;
  try {storage.setItem(key,step);} catch { /* Storage is optional. */ }
}
export function clearProgress(storage,key){
  if(!key)return;
  try {storage.removeItem(key);} catch { /* Storage is optional. */ }
}
export function safeInstagramProfile(value){
  if(typeof value!=='string'||!value.trim())return null;
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||!['instagram.com','www.instagram.com'].includes(u.hostname)||u.port||u.username||u.password||u.search||u.hash||!/^\/[a-zA-Z0-9._]{1,30}\/?$/.test(u.pathname))return null;
    if(['accounts','explore','reels','direct','p','stories','about','developer','privacy'].includes(u.pathname.split('/')[1].toLowerCase()))return null;
    return 'https://www.instagram.com/'+u.pathname.split('/')[1]+'/';
  }catch{return null;}
}
