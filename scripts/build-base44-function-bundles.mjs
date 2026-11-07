/** Build standalone Base44 backend deployments, preserving original entry.ts sources. */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildSync } from 'esbuild';
const root = resolve('base44/functions');
const changed=[];
for (const name of readdirSync(root)) {
  const folder=join(root,name), cfgPath=join(folder,'function.jsonc');
  if (!existsSync(cfgPath)) continue;
  const cfg=JSON.parse(readFileSync(cfgPath,'utf8'));
  const sourcePath=join(folder, cfg.entry==='bundle.ts'?'entry.ts':cfg.entry||'entry.ts');
  if (!existsSync(sourcePath)) continue;
  const source=readFileSync(sourcePath,'utf8');
  // Only functions that import a shared parent path need a self-contained bundle.
  if (!/(?:from\s*|import\s*)["']\.\.\//.test(source)) continue;
  const built=buildSync({entryPoints:[sourcePath],bundle:true,platform:'neutral',format:'esm',target:'es2022',packages:'external',write:false,logLevel:'silent'});
  const bundled=built.outputFiles[0].text;
  if (/(?:from\s*|import\s*)["']\.\.\//.test(bundled)) throw Error('Unbundled relative dependency: '+name);
  writeFileSync(join(folder,'bundle.ts'),bundled);
  cfg.entry='bundle.ts';
  writeFileSync(cfgPath,JSON.stringify(cfg,null,2)+'\n');
  changed.push([name,Buffer.byteLength(bundled)]);
}
console.log('Prepared bundles:',changed.length, 'bytes:',changed.reduce((n,x)=>n+x[1],0));
console.log(changed.map(x=>x[0]).join(', '));
