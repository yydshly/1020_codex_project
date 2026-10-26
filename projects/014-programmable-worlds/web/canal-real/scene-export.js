import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';

// Export the actual runtime geometry, transforms and material UV0. The alpha
// maps are composed into glTF's base-color alpha so Blender sees real leaves.
export async function exportScene({scene,exclude,shots,endpoint,metadataOverrides={},sceneLabel='Exact canal benchmark geometry'}){
 const output=new THREE.Scene();output.name=sceneLabel;
 scene.updateMatrixWorld(true);
 for(const child of scene.children)if(!exclude.includes(child))output.add(child.clone(true));
 const masks=new Map();
 output.traverse(object=>{if(!object.isMesh)return;const convert=material=>{
  if(!material.alphaMap||!material.map)return material;
  if(masks.has(material))return masks.get(material);
  const color=material.map.image,alpha=material.alphaMap.image,canvas=document.createElement('canvas');canvas.width=color.width;canvas.height=color.height;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(color,0,0);const pixels=c.getImageData(0,0,canvas.width,canvas.height);
  const ac=document.createElement('canvas');ac.width=canvas.width;ac.height=canvas.height;const a=ac.getContext('2d',{willReadFrequently:true});a.drawImage(alpha,0,0,ac.width,ac.height);const mask=a.getImageData(0,0,ac.width,ac.height);
  for(let i=0;i<pixels.data.length;i+=4)pixels.data[i+3]=mask.data[i+1];c.putImageData(pixels,0,0);
  const mapped=material.clone();mapped.map=new THREE.CanvasTexture(canvas);mapped.map.colorSpace=THREE.SRGBColorSpace;mapped.alphaMap=null;mapped.alphaTest=.48;mapped.transparent=false;mapped.name=material.name; masks.set(material,mapped);return mapped;
 };object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);});
 const lights=[],areas=[];
 scene.traverse(object=>{if(!object.isLight)return;const position=object.getWorldPosition(new THREE.Vector3()).toArray(),quaternion=object.getWorldQuaternion(new THREE.Quaternion());const target=new THREE.Vector3(0,0,-1).applyQuaternion(quaternion).add(new THREE.Vector3(...position)).toArray();const data={name:object.name,type:object.type,position,quaternion:quaternion.toArray(),target,colorRGBlinear:object.color.toArray(),intensity:object.intensity};if(object.isRectAreaLight){data.width=object.width;data.height=object.height;areas.push(data);}else if(object.isDirectionalLight){data.target=object.target.getWorldPosition(new THREE.Vector3()).toArray();lights.push(data);}else lights.push(data);});
 const metadata={schema:'canal-real-source-v1',units:'metres',coordinateSystem:'glTF Y-up',exportedAt:new Date().toISOString(),cameras:Object.fromEntries(Object.entries(shots).map(([key,value])=>[key,{position:value.position,target:value.target,fov:value.fov,width:1426,height:864,near:.045,far:220}])),environment:{path:'web/canal-real/assets/kloofendal_overcast_puresky/kloofendal_overcast_puresky_2k.hdr',intensity:.9},sun:lights.find(l=>l.type==='DirectionalLight'),lights,rectAreaLights:areas,excluded:['Realtime water','Drifting letter boat','Sky background'],opaqueMaterialNames:[...new Set((()=>{const names=[];output.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(!m.transparent&&!m.transmission&&!/tree_small|periwinkle/.test(m.name))names.push(m.name);});return names;})())]};
 Object.assign(metadata,metadataOverrides);
 const exporter=new GLTFExporter();const glb=await exporter.parseAsync(output,{binary:true,onlyVisible:true,trs:false,maxTextureSize:2048});
 const meta=await fetch(endpoint+'/metadata',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(metadata)});if(!meta.ok)throw new Error('Metadata export failed '+meta.status);
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:glb});if(!response.ok)throw new Error('Geometry export failed '+response.status);return response.json();
}
