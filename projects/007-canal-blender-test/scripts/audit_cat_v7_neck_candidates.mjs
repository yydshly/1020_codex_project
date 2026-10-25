// CPU-only audit: actual preserved GLB, no GPU or changes to source assets.
import {readFile, writeFile} from 'node:fs/promises';
import {register} from 'node:module';
import {createHash} from 'node:crypto';
const project = new URL('../',import.meta.url), web = new URL('web/',project);
const threeURL = new URL('vendor/three/build/three.module.min.js',web).href;
const addonsURL = new URL('vendor/three/examples/jsm/',web).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};if(s.startsWith('three/addons/'))return{url:${JSON.stringify(addonsURL)}+s.slice(13),shortCircuit:true};return n(s,c);}`),import.meta.url);
const THREE = await import(threeURL);
const {GLTFLoader} = await import(new URL('vendor/three/examples/jsm/loaders/GLTFLoader.js',web));
globalThis.ProgressEvent ??= class ProgressEvent {constructor(type,values){this.type=type;Object.assign(this,values);}};
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(resource,options)=>{const url=resource instanceof URL?resource:new URL(typeof resource==='string'?resource:resource.url);return url.protocol==='file:'?new Response(await readFile(url)):nativeFetch(resource,options);};
GLTFLoader.prototype.loadAsync=async function(url){
  const bytes=await readFile(new URL(url)),size=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+size).toString()),offset=20+size,binSize=bytes.readUInt32LE(offset);
  json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(offset+8,offset+8+binSize).toString('base64');
  delete json.images;delete json.textures;delete json.materials;delete json.samplers;
  for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  const loaded=await this.parseAsync(JSON.stringify(json),'');
  loaded.scene.traverse(node=>{if(node.isMesh)node.material.map=new THREE.Texture();});return loaded;
};

const {createCat}=await import(new URL('cat-v6-face.js',web));
const helper=await readFile(new URL('cat-v7-head-skin.js',web),'utf8');
const variants={current:'smooth(.255,.284,y)',start267:'smooth(.267,.284,y)',wideSloped:'smooth(.267,.284+.035*(1-smooth(.02,.07,along)),y)',wideSloped270:'smooth(.270,.284+.035*(1-smooth(.02,.07,along)),y)',wideSloped300:'smooth(.267,.284+.045*(1-smooth(.02,.085,along)),y)',sloped065:'smooth(.265,.284+.065*(1-smooth(.015,.09,along)),y)',sloped085:'smooth(.265,.284+.085*(1-smooth(.015,.09,along)),y)'};
for(const [label,height] of Object.entries(variants)){
 const moduleSource=helper.replace(/const fullSkullHeight[\s\S]*?const previousHead/,`const skull = ${height}*smooth(-.04,.018,along)*(1-smooth(.075,.105,across));\n    const previousHead`);
 const {prepareHeadSkin}=await import('data:text/javascript,'+encodeURIComponent(moduleSource)+'#'+label);
 const cat=await createCat(THREE);cat.setAttention({enabled:false});cat.setBlink({mode:'open'});cat.update(0,{reset:true,time:0});
 const skin=prepareHeadSkin(THREE,cat.object),mesh=skin.source,head=skin.head;
 const parentInv=head.parent.getWorldQuaternion(new THREE.Quaternion()).invert(),headQ=head.getWorldQuaternion(new THREE.Quaternion());
 head.quaternion.copy(parentInv).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-56*Math.PI/180)).multiply(headQ);
 cat.object.updateMatrixWorld(true);mesh.skeleton.update();
 const g=mesh.geometry,p=g.attributes.position,idx=g.index;const vs=Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i));const ds=vs.map((v,i)=>mesh.applyBoneTransform(i,v.clone()));
 const edges=[],seen=new Set();
 for(let k=0;k<idx.count;k+=3){let ids=[idx.getX(k),idx.getX(k+1),idx.getX(k+2)];for(let j=0;j<3;j++){
 const a=ids[j],b=ids[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;if(seen.has(key))continue;seen.add(key);
 if(vs[a].y<.24||vs[b].y<.24||vs[a].z<.04||vs[b].z<.04)continue;
 const old=vs[a].distanceTo(vs[b]),now=ds[a].distanceTo(ds[b]);if(old<.001)continue;
 edges.push({a,b,ratio:now/old,old,now,original:[vs[a].toArray(),vs[b].toArray()]});
 }}edges.sort((a,b)=>b.ratio-a.ratio);
 console.log(JSON.stringify({label,worst:edges[0],p95:edges[Math.floor(edges.length*.05)].ratio,p99:edges[Math.floor(edges.length*.01)].ratio,stats:skin.stats}));skin.dispose();cat.dispose();
}
