import { generateReportPdf } from '../../generated/reporting/lib/reportPdf';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ReportData } from '../../generated/reporting/types/report';
export async function render(report:ReportData, testOnly=false):Promise<Uint8Array> {
  const blob=await generateReportPdf(report);
  const bytes=new Uint8Array(await blob.arrayBuffer());
  if(!testOnly)return bytes;
  const pdf=await PDFDocument.load(bytes),font=await pdf.embedFont(StandardFonts.HelveticaBold);
  for(const page of pdf.getPages())page.drawText('TEST COPY - NOT ISSUED',{x:20,y:page.getHeight()-10,size:6,font,color:rgb(.65,0,0)});
  return pdf.save();
}
export async function execute(original:Uint8Array, record:any):Promise<Uint8Array> {
  const pdf=await PDFDocument.load(original),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  let page=pdf.addPage([595.28,841.89]),y=797;
  const line=(value:string,size=9,strong=false)=>{
    const safe=String(value).replace(/[^\x20-\x7e\u00a0-\u00ff]/g,'?');
    const words=safe.split(/\s+/);let row='';
    for(const word of words){if((strong?bold:font).widthOfTextAtSize(row+' '+word,size)>510&&row){if(y<50){page=pdf.addPage([595.28,841.89]);y=797;}page.drawText(row,{x:40,y,size,font:strong?bold:font});y-=size+5;row=word;}else row+=(row?' ':'')+word;}
    if(y<50){page=pdf.addPage([595.28,841.89]);y=797;}page.drawText(row,{x:40,y,size,font:strong?bold:font});y-=size+7;
  };
  line('Execution record',18,true);
  line('The issued report contents are retained. Requested signature/text overlays appear on their mapped pages; all complete values are recorded below.');
  line('Request: '+record.id);line('Issued PDF SHA-256: '+record.pdfSha256);line('Completed: '+record.completedAt);
  for(const signer of record.signers){
    if(y<180){page=pdf.addPage([595.28,841.89]);y=797;}
    line(signer.name+' - '+signer.roleLabel,12,true);line('Email: '+signer.email);line('Signed name: '+signer.signedName);line('Recorded at: '+signer.signedAt);line('Consent: '+signer.consentText);line('Signature record SHA-256: '+signer.signatureHash);
    if(signer.signatureImage){const image=await pdf.embedPng(signer.signatureImage);const box=image.scaleToFit(220,65);page.drawImage(image,{x:40,y:y-box.height,width:box.width,height:box.height});y-=box.height+12;}
    if(signer.commentary)line('Commentary: '+signer.commentary);
    for(const field of signer.fields||[]){
      line(field.label+': '+field.value);
      if(field.pageNumber){
        if(field.pageNumber>pdf.getPageCount()-1)throw new Error('Mapped signature page is unavailable.');
        const target=pdf.getPage(field.pageNumber-1),size=target.getSize();
        const x=size.width*field.xPercent/100,top=size.height*(1-field.yPercent/100),width=size.width*field.widthPercent/100;
        if(field.fieldType==='signature'&&signer.signatureImage){const image=await pdf.embedPng(signer.signatureImage);const box=image.scaleToFit(width,Math.min(50,top-20));target.drawImage(image,{x,y:top-box.height,width:box.width,height:box.height});}
        else {const text=String(field.value||'').replace(/[^\x20-\x7e\u00a0-\u00ff]/g,'?');const fsize=9;const shown=font.widthOfTextAtSize(text,fsize)<=width?text:'See execution record';target.drawText(shown,{x,y:top-12,size:Math.min(fsize,width/Math.max(1,font.widthOfTextAtSize(shown,1))),font});}
      }
    }
  }
  return pdf.save();
}
export { validateReportForFinalization } from '../../generated/reporting/lib/reportValidation';

export async function validateSignaturePng(data:string):Promise<void>{
  if(!data)return;
  const p=await PDFDocument.create();await p.embedPng(data);
}
export async function pdfPageCount(bytes:Uint8Array):Promise<number>{return (await PDFDocument.load(bytes)).getPageCount();}
