import test from 'node:test';
import assert from 'node:assert/strict';
import { optionalProgressStorage, progressKey, readProgress, saveProgress, clearProgress, safeInstagramProfile } from '../src/components/onboarding/onboardingProgress.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
test('progress survives reload and is isolated by app, user and organization',()=>{
 const s=storage(),k=progressKey('app','u','org');
 saveProgress(s,k,'team');assert.equal(readProgress(s,k),'team');
 for(const other of [progressKey('app2','u','org'),progressKey('app','u2','org'),progressKey('app','u','org2')])assert.equal(readProgress(s,other),null);
 clearProgress(s,k);assert.equal(readProgress(s,k),null);
});
test('invalid progress or unavailable storage cannot grant a step',()=>{
 const s=storage(),k=progressKey('app','u','org');
 s.setItem(k,'admin');assert.equal(readProgress(s,k),null);
 assert.equal(progressKey('app',null,'org'),null);
 const bad={getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}};
 assert.equal(readProgress(bad,k),null);saveProgress(bad,k,'team');clearProgress(bad,k);
});
test('valid official profile is normalized',()=>assert.equal(safeInstagramProfile('https://instagram.com/example.trp/'),'https://www.instagram.com/example.trp/'));
for(const value of ['',undefined,'http://instagram.com/test','https://instagram.com.evil.invalid/test','https://evil.invalid/test','javascript:alert(1)','https://instagram.com/accounts/','https://instagram.com/p/abc','https://instagram.com/test?next=evil','https://user@instagram.com/test'])
 test('rejects invalid profile '+String(value),()=>assert.equal(safeInstagramProfile(value),null));

test("blocked localStorage getter is optional and never throws",()=>{
 const browser={get localStorage(){throw new Error("blocked")}};
 assert.equal(optionalProgressStorage(browser),null);
 assert.equal(optionalProgressStorage(null),null);
 const s=storage();assert.equal(optionalProgressStorage({localStorage:s}),s);
 assert.equal(readProgress(optionalProgressStorage(browser),progressKey("a","u","o")),null);
});

test('optional browser storage is used at all onboarding progress call sites',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const file of ['src/pages/Onboarding.jsx','src/components/onboarding/GuidedOnboardingWizard.jsx']){
  const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
  assert.ok(source.includes('optionalProgressStorage()'));
  assert.ok(!source.includes('window.localStorage'));
 }
});
test('business details uses native form validation and synchronous save guard',async()=>{
 const {readFile}=await import('node:fs/promises');
 const s=await readFile(new URL('../src/components/onboarding/StepBusinessDetails.jsx',import.meta.url),'utf8');
 assert.match(s,/<form[^>]+onSubmit=\{handleSave\}/);
 assert.match(s,/type="email"/);
 assert.match(s,/if \(saveInFlight.current\) return;\s*saveInFlight.current = true;/);
 assert.match(s,/finally\s*\{\s*saveInFlight.current = false;/);
 assert.match(s,/type="button".*onClick=\{\(\) => \{ if \(!saveInFlight.current\) onSkip\(\); \}\}/);
 assert.match(s,/type="submit"/);
});
