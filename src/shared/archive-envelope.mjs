// Versioned, authenticated envelopes. Archive operators can retain ciphertext without decryption keys.
const b64=bytes=>Buffer.from(bytes).toString('base64'),bytes=value=>new Uint8Array(Buffer.from(value,'base64'));
const encoder=new TextEncoder();
export async function digest(value){return Buffer.from(await crypto.subtle.digest('SHA-256',value)).toString('hex');}
async function key(secret){if(!/^[a-f0-9]{64}$/i.test(secret||''))throw new Error('A 256-bit archive encryption key is required.');return crypto.subtle.importKey('raw',Buffer.from(secret,'hex'),'AES-GCM',false,['encrypt','decrypt']);}
export async function packArchive(raw,metadata,secret,keyId){
 if(!(raw instanceof Uint8Array)||raw.length>200*1024*1024)throw new Error('Archive payload exceeds the verified size limit.');
 const manifest={version:1,keyId,...metadata,sha256:await digest(raw),bytes:raw.length},aad=encoder.encode(JSON.stringify(manifest)),iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await key(secret),raw);
 return encoder.encode(JSON.stringify({manifest,iv:b64(iv),ciphertext:b64(ciphertext)}));
}
export async function unpackArchive(envelope,secret){
 const e=JSON.parse(new TextDecoder().decode(envelope));if(e.manifest?.version!==1||!Number.isSafeInteger(e.manifest.bytes)||e.manifest.bytes<0||e.manifest.bytes>200*1024*1024)throw new Error('Invalid archive manifest.');
 const raw=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(e.iv),additionalData:encoder.encode(JSON.stringify(e.manifest))},await key(secret),bytes(e.ciphertext)));
 if(raw.length!==e.manifest.bytes||await digest(raw)!==e.manifest.sha256)throw new Error('Archive content hash mismatch.');return {bytes:raw,manifest:e.manifest};
}
export async function signArchive(secret,timestamp,path,hash){if(!/^[a-f0-9]{64}$/i.test(secret||''))throw new Error('A separate archive upload authentication key is required.');const k=await crypto.subtle.importKey('raw',Buffer.from(secret,'hex'),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',k,encoder.encode(`${timestamp}\nPUT\n${path}\n${hash}`)));}
export async function verifyArchive(secret,timestamp,path,hash,signature){try{const k=await crypto.subtle.importKey('raw',Buffer.from(secret,'hex'),{name:'HMAC',hash:'SHA-256'},false,['verify']);return crypto.subtle.verify('HMAC',k,bytes(signature),encoder.encode(`${timestamp}\nPUT\n${path}\n${hash}`));}catch{return false;}}
