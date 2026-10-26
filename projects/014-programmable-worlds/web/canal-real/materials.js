import * as THREE from 'three';

const noise=`float cHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123);}float cNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(cHash(i),cHash(i+vec3(1,0,0)),f.x),mix(cHash(i+vec3(0,1,0)),cHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(cHash(i+vec3(0,0,1)),cHash(i+vec3(1,0,1)),f.x),mix(cHash(i+vec3(0,1,1)),cHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`;

// All UVs in the architecture are metres. Measured scan dimensions come from
// the Poly Haven source API, recorded in assets/manifest.json.
export async function loadMaterials(renderer,onProgress=()=>{}){
 const loader=new THREE.TextureLoader(),anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());let loaded=0;
 const specs=[['brick','worn_brick_wall',2],['paving','cobblestone_01',2.4],['stone','stone_wall_02',2],['wood','wood_peeling_paint_weathered',.762],['slateScan','roof_slates_02',3],['wallPlaster','worn_cracked_plaster',1.8],['oakScan','wood_table_001',1.5]];
 const result={};
 await Promise.all(specs.map(async([key,id,metres])=>{
  const maps=await Promise.all(['diff','nor_gl','rough'].map(async(kind)=>{
   const texture=await loader.loadAsync(new URL(`./assets/${id}/${id}_${kind}_2k.jpg`,import.meta.url).href);
   texture.colorSpace=kind==='diff'?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.setScalar(1/metres);texture.anisotropy=anisotropy;loaded++;onProgress(loaded/21);return texture;
  }));
  result[key]=new THREE.MeshPhysicalMaterial({map:maps[0],normalMap:maps[1],roughnessMap:maps[2],roughness:.95,normalScale:new THREE.Vector2(.8,.8),color:0xffffff,metalness:0});
  result[key].name=`Poly Haven CC0 ${id}, measured ${metres}m`;result[key].userData.metresPerRepeat=metres;
 }));
 result.brick=weather(result.brick,.16);result.stone=weather(result.stone,.4);result.paving=weather(result.paving,.6,true);
 result.brickWarm=weather(result.brick.clone(),.16);result.brickWarm.color.set('#b89a85');
 result.brickDark=weather(result.brick.clone(),.16);result.brickDark.color.set('#8f8175');
 result.stonePale=weather(result.stone.clone(),.4);result.stonePale.color.set('#c2bbab');
 result.greenWood=result.wood.clone();result.greenWood.color.set('#64796a');result.greenWood.roughness=.73;
 result.blueWood=result.wood.clone();result.blueWood.color.set('#637979');result.blueWood.roughness=.76;
 result.oak=result.oakScan;result.oak.roughness=.65;result.oak.normalScale.setScalar(.5);
 result.mortar=new THREE.MeshStandardMaterial({color:'#797a6c',roughness:1});
 result.metal=new THREE.MeshStandardMaterial({color:'#393e3a',roughness:.4,metalness:.8});
 result.zinc=new THREE.MeshStandardMaterial({color:'#656d6a',roughness:.48,metalness:.8});
 result.slate=result.slateScan;result.slate.color.set('#9ca9ac');result.slate.roughness=.85;
 result.glass=new THREE.MeshPhysicalMaterial({color:'#f5fbff',roughness:.025,metalness:0,transmission:.98,thickness:.008,ior:1.5,transparent:false,opacity:1,depthWrite:true,envMapIntensity:1});
 result.glass.userData.thinArchitecturalGlass=true;
 clearThinTransmission(result.glass);
 result.plaster=result.wallPlaster;result.plaster.color.set('#e0ded3');result.plaster.normalScale.setScalar(.18);
 // Preserve the scan's fine surface variation without turning a near plaster
 // reveal into a visibly repeating, high-contrast field of pebbles.
 result.plaster.map=normalizeAlbedo(result.plaster.map,.64,.23);
 result.interior=new THREE.MeshStandardMaterial({color:'#776c57',roughness:.9});
 result.fabric=new THREE.MeshStandardMaterial({color:'#a8a693',roughness:1,side:THREE.DoubleSide});
 result.paper=new THREE.MeshStandardMaterial({color:'#d4c7a6',roughness:.95});
 result.lamp=new THREE.MeshStandardMaterial({color:'#fff0c1',emissive:'#ffbf68',emissiveIntensity:3.5,roughness:.6});
 result.soil=new THREE.MeshStandardMaterial({color:'#3e4030',roughness:1});
 result.books=['#625147','#626b63','#8a7759','#5c625b','#79614d','#4b5450','#86755b','#735b4f'].map(color=>new THREE.MeshStandardMaterial({color,roughness:.93}));
 for(const [name,material]of Object.entries(result)){if(material?.isMaterial)material.name='Canal/'+name;else if(Array.isArray(material))material.forEach((m,i)=>m.name='Canal/'+name+'/'+i);}
 return result;
}
function clearThinTransmission(material){
 const original='return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );',replacement='return textureLod( transmissionSamplerMap, fragCoord.xy, 0.0 );';
 const source=THREE.ShaderChunk.transmission_pars_fragment;if(!source.includes(original))throw new Error('Pinned thin transmission chunk changed');
 material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_pars_fragment>',source.replace(original,replacement));};
 material.customProgramCacheKey=()=> 'canal-sharp-thin-glass-v1';
}
function normalizeAlbedo(source,mean,detail){
 const image=source.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
 const linear=v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4),srgb=v=>v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055;
 for(let i=0;i<pixels.data.length;i+=4)for(let c=0;c<3;c++)pixels.data[i+c]=Math.round(255*srgb(mean*(1-detail)+linear(pixels.data[i+c]/255)*detail));
 ctx.putImageData(pixels,0,0);const texture=source.clone();texture.image=canvas;texture.needsUpdate=true;texture.name=source.name+' / low-contrast plaster albedo';return texture;
}
function weather(material,amount,wet=false){
 material.onBeforeCompile=s=>{
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 cWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\ncWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
  s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 cWorld;\n${noise}`)
  .replace('#include <color_fragment>',`#include <color_fragment>
   float broad=cNoise(cWorld*.47)*.55+cNoise(cWorld*2.6)*.3+cNoise(cWorld*11.3)*.15;
   float damp=(1.-smoothstep(.1,2.5,cWorld.y))*(.2+.8*broad);
   float streak=cNoise(vec3(cWorld.x*7.,cWorld.y*.14,cWorld.z*7.));
   diffuseColor.rgb*=mix(vec3(1.),vec3(.36,.43,.32),damp*${amount.toFixed(2)});
   diffuseColor.rgb*=.85+.25*broad;
   ${wet?'diffuseColor.rgb*=.72+.20*smoothstep(.35,.6,broad);':''}`)
  .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\n${wet?'roughnessFactor=mix(.16,roughnessFactor,smoothstep(.25,.58,broad));':'roughnessFactor=mix(roughnessFactor,.52,damp*.3);'}`);
 };
 material.customProgramCacheKey=()=>`canal-measured-weather-v1-${amount}-${wet}`;
 return material;
}
