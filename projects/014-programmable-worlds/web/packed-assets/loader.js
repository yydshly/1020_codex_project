// Lossless transport only: restore original asset/texture bytes and verify SHA256.
const base=new URL('../',import.meta.url),manifestURL=new URL('./manifest.json',import.meta.url);
let manifestPromise;
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
async function descriptors(){return manifestPromise??=fetch(manifestURL).then(async r=>{if(!r.ok)throw Error('Packed asset manifest HTTP '+r.status);const m=await r.json();return new Map(m.assets.map(x=>[new URL(x.sourceFile.replace(/^web\//,''),base).pathname,x]));});}
async function uncompress(bytes){return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}
export async function readPacked(url){
 const target=new URL(url,base),entry=(await descriptors()).get(target.pathname);
 const source=entry?new URL(entry.packedFile,import.meta.url):target,response=await fetch(source,{cache:'no-store'});
 if(!response.ok)throw Error('Asset HTTP '+response.status+': '+source.pathname);
 const packed=await response.arrayBuffer();if(!entry)return{bytes:packed,packed:false,sourceEncoding:'identity'};
 if(packed.byteLength!==entry.packedBytes||await hash(packed)!==entry.packedSHA256)throw Error('Packed asset integrity mismatch');
 const planes=new Uint8Array(await uncompress(packed));let raw=planes;
 if(entry.codec!=='gzip'){
  const stride=entry.codec.startsWith('shuffle4')?4:8,n=planes.length/stride;
  if(!Number.isInteger(n)||!/^shuffle[48](-delta)?-gzip$/.test(entry.codec))throw Error('Unsupported packed asset codec');
  raw=new Uint8Array(planes.length);const delta=entry.codec.includes('-delta-');
  for(let c=0;c<stride;c++){let previous=0,offset=c*n;for(let i=0;i<n;i++){const v=delta?(previous+planes[offset+i])&255:planes[offset+i];raw[i*stride+c]=v;previous=v;}}
 }
 if(raw.byteLength!==entry.rawBytes||await hash(raw)!==entry.rawSHA256)throw Error('Restored asset integrity mismatch');
 return{bytes:raw.buffer,packed:true,sourceEncoding:entry.sourceEncoding,sourceSHA256:entry.sourceSHA256};
}
export async function readAssetBytes(url){const r=await readPacked(url);if(r.sourceEncoding!=='identity')throw Error('Wrong model encoding');return r.bytes;}
export async function readLightmapBytes(url,expected){const r=await readPacked(url);if(r.packed){if(r.sourceEncoding!=='gzip'||r.sourceSHA256!==expected)throw Error('Wrong source lightmap fingerprint');return r.bytes;}if(await hash(r.bytes)!==expected)throw Error('Lightmap checksum mismatch');return uncompress(r.bytes);}
export async function packedBufferManager(manager,url){const target=new URL(url,base),r=await readPacked(target);if(!r.packed)return manager;
 const blob=URL.createObjectURL(new Blob([r.bytes]));manager.setURLModifier(value=>new URL(value,document.baseURI).pathname===target.pathname?blob:value);manager.onLoad=()=>URL.revokeObjectURL(blob);return manager;
}
