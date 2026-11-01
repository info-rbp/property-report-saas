// Device storage is opt-in, encrypted and partitioned by user AND workspace.
// The encryption key lives in sessionStorage, not alongside persisted data.
const DATABASE='property-reports-offline-v2', STORE='encrypted', PREFIX='pr-offline-v2:';
const encode=bytes=>btoa(Array.from(new Uint8Array(bytes),x=>String.fromCharCode(x)).join(''));
const decode=value=>Uint8Array.from(atob(value),x=>x.charCodeAt(0));
export const offlineScope=(user,workspace)=>`${user}:${workspace}`;
export async function encryptRecord(key,payload,scope){const iv=crypto.getRandomValues(new Uint8Array(12));return {iv:encode(iv),cipher:encode(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(scope)},key,new TextEncoder().encode(JSON.stringify(payload))))};}
export async function decryptRecord(key,record,scope){return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(record.iv),additionalData:new TextEncoder().encode(scope)},key,decode(record.cipher))));}
async function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DATABASE,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function database(mode,operation){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),r=operation(tx.objectStore(STORE));let value;r.onsuccess=()=>value=r.result;tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export class OfflineVault{
  constructor(user,workspace,expiresAt){this.scope=offlineScope(user,workspace);this.expiresAt=Math.min(expiresAt*1000,Date.now()+8*3600000);this.keyName=PREFIX+this.scope;}
  enabled(){return !!sessionStorage.getItem(this.keyName)&&this.expiresAt>Date.now();}
  async key(create=false){let raw=sessionStorage.getItem(this.keyName);if(!raw&&create){raw=encode(crypto.getRandomValues(new Uint8Array(32)));sessionStorage.setItem(this.keyName,raw);}if(!raw||this.expiresAt<Date.now())throw new Error('Offline access is unavailable or expired. Reconnect and sign in.');return crypto.subtle.importKey('raw',decode(raw),'AES-GCM',false,['encrypt','decrypt']);}
  async enable(){await this.key(true);await this.purgeExpired();}
  async save(reportId,value){const text=JSON.stringify(value);if(text.length>48*1024*1024)throw new Error('Offline allowance reached. Reconnect and synchronise before adding more photographs.');const encrypted=await encryptRecord(await this.key(),value,this.scope);await database('readwrite',store=>store.put({id:`${this.scope}:${reportId}`,scope:this.scope,expiresAt:this.expiresAt,...encrypted}));}
  async load(reportId){const row=await database('readonly',s=>s.get(`${this.scope}:${reportId}`));if(!row)return null;if(row.expiresAt<Date.now()){await this.remove(reportId);return null;}try{return await decryptRecord(await this.key(),row,this.scope);}catch{await this.remove(reportId);throw new Error('The saved draft is unavailable in this signed-in session.');}}
  async remove(reportId){await database('readwrite',s=>s.delete(`${this.scope}:${reportId}`));}
  async purgeExpired(){const rows=await database('readonly',s=>s.getAll());for(const row of rows)if(row.expiresAt<Date.now())await database('readwrite',s=>s.delete(row.id));}
}
export async function clearOffline(){for(const name of Object.keys(sessionStorage))if(name.startsWith(PREFIX)||name==='pr-editor-context')sessionStorage.removeItem(name);await database('readwrite',s=>s.clear());}
export async function serializePhoto(blob,metadata){return {id:crypto.randomUUID(),data:encode(await blob.arrayBuffer()),metadata};}
export const deserializePhoto=photo=>new Blob([decode(photo.data)],{type:'image/jpeg'});
