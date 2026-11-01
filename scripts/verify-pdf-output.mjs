import {readFile,readdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const normalize=s=>s.toLowerCase().replace(/[\u2018\u2019]/g,"'").replace(/[^a-z0-9]/g,'');
const files=(await readdir('artifacts/pdfs')).filter(n=>n.endsWith('.pdf'));
assert.ok(files.length>=27,'Expected catalogue, execution and stress outputs.');
for(const file of files){const result=spawnSync('pdfinfo',['artifacts/pdfs/'+file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
const extract=file=>{const r=spawnSync('pdftotext',['-layout','artifacts/pdfs/'+file,'-'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return normalize(r.stdout);};
const ref=JSON.parse(await readFile('compliance/wa-form1-reference.json','utf8'));
const entry=extract('Entry.pdf');
for(const text of [...ref.instructions,...ref.notes])assert.ok(entry.includes(normalize(text)),`Missing prescribed instruction: ${text.slice(0,70)}`);
assert.ok(extract('EntryClosingStress.pdf').includes(normalize('ENTRY-CLOSING-TAIL-MARKER')),'Long Entry closing text was lost.');
assert.ok(extract('MonthlyPhotoStress.pdf').includes('photoevidence'),'Monthly evidence heading missing.');
await writeFile('artifacts/pdf-verification.json',JSON.stringify({pdfs:files.length,formInstructions:ref.instructions.length,formNotes:ref.notes.length,longClosingTail:true,monthlyInlineEvidence:true,legalCertification:false},null,2));
console.log('PASS: PDF readability, official instructions/notes and long-content/photo continuation checks.');
