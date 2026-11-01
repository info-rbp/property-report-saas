export class ApiError extends Error{status:number;code?:string;constructor(status:number,data:any){super(data.error||`Request failed (${status}).`);this.status=status;this.code=data.code;}}
export async function call(path:string,workspace:string,options:RequestInit={},json?:unknown):Promise<any>{
 const headers=new Headers(options.headers);if(workspace)headers.set('X-Workspace-Id',workspace);
 if(json!==undefined){headers.set('Content-Type','application/json');options.body=JSON.stringify(json);}
 const response=await fetch(path,{...options,headers,credentials:'same-origin'});
 if(!response.ok)throw new ApiError(response.status,await response.json().catch(()=>({})));
 return response.headers.get('content-type')?.includes('application/json')?response.json():response.blob();
}
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
