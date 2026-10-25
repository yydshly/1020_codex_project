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


const glb=new URL('models/cat-v3-rig.glb',web),loaded=await new GLTFLoader().loadAsync(glb.href);let mesh;loaded.scene.traverse(n=>{if(n.isSkinnedMesh&&!mesh)mesh=n;});
const p=mesh.geometry.attributes.position,sw=mesh.geometry.attributes.skinWeight,si=mesh.geometry.attributes.skinIndex,names=mesh.skeleton.bones.map(b=>b.name),ids={left:[names.indexOf('hind_left_upper'),names.indexOf('hind_left_lower')],right:[names.indexOf('hind_right_upper'),names.indexOf('hind_right_lower')]};
const buffer=new ArrayBuffer(16+p.count*4),view=new DataView(buffer),ratios=new Float32Array(buffer,16,p.count);view.setUint32(0,0x30485243,true);view.setUint32(4,1,true);view.setUint32(8,p.count,true);
let count=0,ambiguous=0;for(let i=0;i<p.count;i++){const side={};for(const key of ['left','right']){let upper=0,lower=0;for(let s=0;s<4;s++){const b=si.getComponent(i,s),w=sw.getComponent(i,s);if(b===ids[key][0])upper+=w;if(b===ids[key][1])lower+=w;}if(upper+lower>1e-8)side[key]=upper/(upper+lower);}if(Object.keys(side).length>1)ambiguous++;else if('left'in side){ratios[i]=1+side.left;count++;}else if('right'in side){ratios[i]=-(1+side.right);count++;}}
const sha=data=>createHash('sha256').update(data).digest('hex'),bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength),meta={format:'CHR0-v1; Float32 signed (1 + upper/(upper+lower)): positive left, negative right, zero no source hind influence',vertices:p.count,sourceAssetSHA256:sha(await readFile(glb)),positionSHA256:sha(bytes(p.array)),binarySHA256:sha(new Uint8Array(buffer)),encodedVertices:count,ambiguousVertices:ambiguous};
await writeFile(new URL('models/cat-v10-hind-ratios.bin',web),new Uint8Array(buffer));await writeFile(new URL('models/cat-v10-hind-ratios.json',web),JSON.stringify(meta,null,2)+'\n');console.log(JSON.stringify(meta));
