/** Compile local shared-audit functions to standalone deployable Base44 bundles. */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { build } from 'esbuild';
const root=resolve('base44/functions');
const backup=resolve('scripts/base44-function-sources');
const names=[];
for(const name of readdirSync(root)){
  const dir=join(root,name);
  if(!existsSync(join(dir,'_shared/auditEvent.ts')) || !existsSync(join(dir,'entry.ts')))continue;
  const backupDir=join(backup,name); mkdirSync(backupDir,{recursive:true});
  const sourcePath=join(backupDir,'entry.ts');
  if(!existsSync(sourcePath))writeFileSync(sourcePath,readFileSync(join(dir,'entry.ts')));
  const file=join(dir,'entry.ts');
  const built=await build({entryPoints:[file],write:false,bundle:true,format:'esm',platform:'neutral',target:'es2022',packages:'external',logLevel:'silent',plugins:[{
    name:'shared-dependency-fallback',setup(api){
      api.onResolve({filter:/^\.\//},arg=>{
        const absolute=resolve(dirname(arg.importer),arg.path);
        if(existsSync(absolute))return;
        if(!arg.importer.includes('/_shared/'))return;
        const central=join(root,'_shared',basename(arg.path));
        if(existsSync(central))return {path:central};
      });
    }
  }]});
  const output=built.outputFiles[0].text;
  if(/(?:from\s*|import\s*)["']\.\.\//.test(output))throw Error('Unsafe import in '+name);
  writeFileSync(join(dir,'bundle.ts'),output);
  const cfgPath=join(dir,'function.jsonc');const cfg=JSON.parse(readFileSync(cfgPath,'utf8'));
  cfg.entry='bundle.ts';writeFileSync(cfgPath,JSON.stringify(cfg,null,2)+'\n');
  names.push(name);
}
console.log('Local audit consumers rebuilt:',names.length, names.join(', '));
