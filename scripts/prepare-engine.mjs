import {build} from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source='vendor/proinspect/src', target='generated/reporting';
await mkdir('generated',{recursive:true});
await rm(target,{recursive:true,force:true});
await cp(source,target,{recursive:true});
const replace = async (file, fn) => { const path=`${target}/${file}`; await writeFile(path,fn(await readFile(path,'utf8'))); };
await writeFile(`${target}/config/company.ts`, `export const PROINSPECT_COMPANY={name:'Property Reports',address:'',phone:'',email:'',website:''} as const;\n`);
await replace('data/reportCatalogue.ts',s=>s.replaceAll('ProInspect','the reporting provider'));
await replace('lib/reportPdf.ts',s=>{
  s=s.replace('function drawBrand(pdf: jsPDF, x: number, y: number, scale = 1) {','function drawBrand(pdf: jsPDF, x: number, y: number, scale = 1, report?: ReportData) {');
  s=s.replace("pdf.text('ProInspect', x + (16 * scale), y + (7.4 * scale));", "pdf.text(truncateTextToWidth(pdf, value(report?.details.companyName) || 'Property Reports', 130), x + (16 * scale), y + (7.4 * scale));");
  s=s.replace("pdf.text('INSPECT. REPORT. PROTECT.', x + (16 * scale), y + (11.4 * scale));", "pdf.text('PROPERTY INSPECTION REPORT', x + (16 * scale), y + (11.4 * scale));\n  const logo = inlineJpeg((report?.details as any)?.companyLogoDataUrl || '');\n  if (logo) { pdf.setFillColor(255,255,255); pdf.rect(x-1,y-1,15*scale,16*scale,'F'); const r=containRect(logo.width,logo.height,14*scale,14*scale); pdf.addImage(logo.bytes,'JPEG',x+r.xOffset,y+r.yOffset,r.width,r.height); }");
  s=s.replace(/drawBrand\(pdf, ([^;\n]+)\);/g,(all,args)=>`drawBrand(pdf, ${args}, report);`);
  s=s.replace('const embedded = inlineJpeg(source);\n  if (', `const embedded = inlineJpeg(source);\n  if (typeof document === 'undefined') {\n    if (!embedded) throw new Error('Trusted renderer accepts validated stored JPEG data only.');\n    return embedded;\n  }\n  if (`);
  s=s.replace('title: `ProInspect ${reportInstanceTitle(report)}', 'title: `${value(report.details.companyName) || "Property Reports"} ${reportInstanceTitle(report)}');
  s=s.replace("creator: 'ProInspect Property Reports'", "creator: 'Property Report SaaS'");
  // A printed preparer name is not a collected signature.
  s=s.replace("const signatureLines = wrapText(pdf, displayName === 'Not recorded' ? '' : displayName, widths[1] - 3.6);", "const signatureLines: string[] = [''];");
  // Entry closing notes and disclaimers must not be silently clipped.
  const start=s.indexOf("  setFont(pdf, 8, 'bold');\n  setTextColor(pdf, TEXT);\n  pdf.text('Entry Report Additional comments'");
  const end=s.indexOf("  setFont(pdf, 7.5, 'bold');",start);
  if(start<0||end<0)throw new Error('Entry closing block changed upstream.');
  s=s.slice(0,start)+"  y = drawNarrativeSection(pdf, report, y, 'Entry Report Additional comments', details.additionalComments);\n  if (y + 52 > BODY_BOTTOM) y = addContentPage(pdf, report);\n\n"+s.slice(end);
  s=s.replace('  y = drawAgentSignoff(pdf, y, report, "Lessor/property manager\'s signature");', '  if (y + 55 > BODY_BOTTOM) y = addContentPage(pdf, report);\n  y = drawAgentSignoff(pdf, y, report, "Lessor/property manager\'s signature");\n  if (y + 30 > BODY_BOTTOM) y = addContentPage(pdf, report);');
  s=s.replace("  tenantNames.forEach((name, index) => {\n    drawBox", "  tenantNames.forEach((name, index) => {\n    if (y + 20 > BODY_BOTTOM) y = addContentPage(pdf, report, 'Tenant signatures (continued)');\n    name = truncateTextToWidth(pdf, name, 58);\n    drawBox");
  const ds=s.indexOf("  if (y > BODY_BOTTOM - 16) {\n    throw new Error('Final report signature page");
  const de=s.indexOf('\n}\n\ninterface KeyReceiptFragment',ds);
  if(ds<0||de<0)throw new Error('Entry final disclaimer block changed upstream.');
  s=s.slice(0,ds)+"  drawDisclaimerSection(pdf, report, y);"+s.slice(de);

  s=s.replaceAll('INSPECT. REPORT. PROTECT.','PROPERTY INSPECTION REPORT');
  return s;
});
await writeFile(`${target}/components/ProInspectLogo.tsx`, `import React from 'react';\nimport { useBrand } from '../../../src/editor/brand';\nexport const ProInspectLogo:React.FC<{size?:string;showTagline?:boolean;className?:string}> = ({showTagline=true,className=''}) => {const brand=useBrand();return <div className={className} style={{display:'flex',alignItems:'center',gap:10}}>{brand.companyLogoUrl&&<img src={brand.companyLogoUrl} alt="" style={{width:48,height:48,objectFit:'contain'}}/>}<div><strong>{brand.companyName||'Property Reports'}</strong>{showTagline&&<div style={{fontSize:10}}>Property inspection reporting</div>}</div></div>};\n`);
// The tenant-aware application uses only the reusable editors/documents, never upstream API or cache code.
await replace('components/ReportDocument.tsx',s=>s.replace('within 7 days of the tenant moving into the premises','within 7 days of the start of the tenancy as specified in the residential tenancy agreement'));
await rm(`${target}/App.tsx`,{force:true});
await rm(`${target}/main.tsx`,{force:true});
const statutory=JSON.parse(await readFile('compliance/wa-form1-reference.json','utf8'));
await replace('lib/reportPdf.ts',s=>{
  let lists=0; s=s.replace(/y = drawNumberedList\(pdf, \[[\s\S]*?\n  \], MARGIN_X, y, CONTENT_WIDTH, 6\.2, 2\.65, 0\.85\);/g,match=>{lists++;return lists<=2?'y = drawNumberedList(pdf, '+JSON.stringify(lists===1?statutory.instructions:statutory.notes)+', MARGIN_X, y, CONTENT_WIDTH, 6.2, 2.65, 0.85);':match;});
  if(lists<2)throw new Error('Missing statutory instruction blocks.');
  s=s.replace(/'For further information about tenancy rights[^\n]+',/, JSON.stringify(statutory.contactNotice)+',');
  return s;
});
const catalogue=await readFile(`${target}/data/reportCatalogue.ts`,'utf8');
const definitions={};
for(const block of catalogue.split(/\n  \{\n    type: /).slice(1)) {
  const type=block.match(/^'([^']+)'/)?.[1],label=block.match(/\n    label: '([^']+)'/)?.[1];
  const defaultText=block.match(/defaultAreas:\s*\[([\s\S]*?)\]/)?.[1]||'';
  if(type&&label)definitions[type]={label,category:block.match(/category: '([^']+)'/)?.[1],areas:[...defaultText.matchAll(/'([^']+)'/g)].map(m=>m[1])};
}
if(Object.keys(definitions).length!==25)throw new Error('Unexpected upstream catalogue; review importer.');
await build({entryPoints:[`${target}/data/reportCatalogue.ts`],outfile:'generated/catalogue-module.mjs',bundle:true,platform:'node',format:'esm'});
const catalogueModule=await import(new URL('../generated/catalogue-module.mjs',import.meta.url));
for(const entry of catalogueModule.REPORT_TEMPLATES)definitions[entry.type].disclaimer=entry.disclaimer;
await writeFile('generated/catalogue.json',JSON.stringify(definitions,null,2));
await writeFile('generated/engine-provenance.json',JSON.stringify({source:'info-rbp/Property-Report-Tool',commit:'ed55b4409d7caf668b4cb62c8a27fc79a8d2ce68',rendererSha256:createHash('sha256').update(await readFile(`${target}/lib/reportPdf.ts`)).digest('hex')},null,2));
console.log('Prepared 24 selectable report templates and tenant-neutral renderer.');

await replace('lib/googleDrive.ts',s=>s.replace('https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/drive.file').replace('.setDeveloperKey(apiKey)',".setDeveloperKey(apiKey)\n      .setAppId(import.meta.env.VITE_GOOGLE_APP_ID)\n      .setOrigin(window.location.origin)"));
await replace('components/PhotoManager.tsx',s=>s.replace('const handleDriveImport = async () => {',"const handleDriveImport = async () => {\n    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID || !import.meta.env.VITE_GOOGLE_API_KEY || !import.meta.env.VITE_GOOGLE_APP_ID) { alert('Google Drive import requires the application operator to configure restricted Google Picker credentials. Device uploads remain available.'); return; }"));
await cp('vendor/proinspect/public/licenses','public/licenses',{recursive:true});
await cp('vendor/proinspect/public/THIRD_PARTY_NOTICES.txt','public/THIRD_PARTY_NOTICES.txt');
