import {readFile,writeFile,mkdir} from 'node:fs/promises';
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
const dependencies=[];
for(const [location,pkg] of Object.entries(lock.packages)){
 if(!location)continue;
 const name=pkg.name||location.split('node_modules/').at(-1);
 let installed={};try{installed=JSON.parse(await readFile(location+'/package.json','utf8'));}catch{}
 dependencies.push({name,version:pkg.version,license:pkg.license||installed.license||'REVIEW_REQUIRED',integrity:pkg.integrity||null,developmentOnly:!!pkg.dev,location});
}
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/dependency-inventory.json',JSON.stringify({format:'dependency-inventory-v1',lockfileVersion:lock.lockfileVersion,dependencies},null,2));
console.log(`Recorded ${dependencies.length} locked dependencies. Licence identifiers are an inventory, not a legal clearance.`);
if(dependencies.some(d=>d.license==='REVIEW_REQUIRED'))console.warn('Some packages require manual licence review.');
