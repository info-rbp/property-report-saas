import { HttpError } from './security.mjs';
import { readVerified, jpegDimensions } from './storage.mjs';
const MAX_RENDER_BYTES=12*1024*1024;
const MAX_PDF_BYTES=16*1024*1024;
function dataUrl(bytes,mime='image/jpeg'){return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;}
export async function renderIssuedPdf(env,row,{testOnly=false}={}) {
  const report=JSON.parse(row.report_data);
  report.id=row.id;report.propertyId=row.property_id;report.status=row.status;report.photos=[];
  // Browser URLs, data URIs, integration destinations and execution assertions are never authoritative.
  delete report.execution;delete report.integrationContext;
  delete report.details.coverPhotoUrl;delete report.details.companyLogoUrl;delete report.details.companyLogoDataUrl;
  const objects=(await env.DB.prepare("SELECT * FROM objects WHERE workspace_id=? AND report_id=? AND kind IN ('photo','cover') ORDER BY created_at,id").bind(row.workspace_id,row.id).all()).results;
  if(objects.length>500||objects.reduce((n,o)=>n+o.bytes,0)>MAX_RENDER_BYTES)throw new HttpError(413,'This report exceeds the verified PDF image budget. Reduce photo sizes or split the report.','render_budget_exceeded');
  for(const object of objects){
    const bytes=new Uint8Array(await (await readVerified(env,object)).arrayBuffer());jpegDimensions(bytes);
    if(object.kind==='cover')report.details.coverPhotoUrl=dataUrl(bytes);
    else {
      const meta=JSON.parse(object.metadata_json),area=report.areas.find(a=>a.id===meta.areaId),item=area?.items.find(i=>i.id===meta.itemId);
      if(!area||(meta.itemId&&!item))throw new HttpError(409,'Photographic evidence is no longer linked to a current report item.');
      report.photos.push({id:object.id,name:meta.name,areaName:area.name,itemId:meta.itemId||undefined,itemName:item?.name,photoIndex:report.photos.length+1,dataUrl:dataUrl(bytes)});
    }
  }
  if(report.details.companyLogoAssetId){
    const asset=await env.DB.prepare('SELECT * FROM workspace_assets WHERE workspace_id=? AND id=?').bind(row.workspace_id,report.details.companyLogoAssetId).first();
    if(!asset)throw new HttpError(409,'The report branding asset is missing.');
    const bytes=new Uint8Array(await (await readVerified(env,{...asset,report_id:'branding'})).arrayBuffer());
    report.details.companyLogoDataUrl=dataUrl(bytes);
  }
  const renderer=await import('../../generated/server-renderer.mjs');
  const issues=renderer.validateReportForFinalization(report);
  if(issues.length)throw new HttpError(400,issues.slice(0,5).map(i=>i.message).join(' '),'report_validation');
  const bytes=await renderer.render(report,testOnly);
  if(bytes.length>MAX_PDF_BYTES)throw new HttpError(413,'The generated PDF exceeds the 16 MB verified limit.');
  if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new HttpError(500,'Renderer did not produce a valid PDF.');
  return bytes;
}
export async function renderExecutedPdf(env,pdfRow,record){
  const original=new Uint8Array(await (await readVerified(env,pdfRow)).arrayBuffer());
  const renderer=await import('../../generated/server-renderer.mjs');
  const bytes=await renderer.execute(original,record);
  if(bytes.length>MAX_PDF_BYTES)throw new HttpError(413,'The executed PDF exceeds the verified limit.');
  return bytes;
}
