import fs from 'node:fs';
import {register} from 'node:module';
const root=new URL('../',import.meta.url),threeURL=new URL('web/vendor/three/build/three.module.min.js',root).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`),import.meta.url);
const THREE=await import(threeURL),{GLTFLoader}=await import(new URL('web/vendor/three/examples/jsm/loaders/GLTFLoader.js',root));
const b=fs.readFileSync(new URL('web/models/space-10.glb',root)),g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
g.scene.updateMatrixWorld(true);const terrain=[];g.scene.traverse(o=>{if(o.isMesh&&['ROAM01_Surface__soil','ROAM01_Surface__EXT_B02_DampMineralGround'].includes(o.name))terrain.push(o);});
const width=680,height=871,camera=new THREE.PerspectiveCamera(52,width/height,.08,430);camera.position.set(-18,3.8,-25.2);camera.lookAt(-33,3,-46);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
const rows=[],ray=new THREE.Raycaster();
for(const py of[450,500,580,650,730,820])for(const px of[100,340,580]){ray.setFromCamera(new THREE.Vector2(2*px/width-1,1-2*py/height),camera);const hit=ray.intersectObjects(terrain)[0];if(!hit){rows.push({px,py,hit:null});continue;}const p=hit.point,x=p.x,y=-p.z,qx=Math.abs(x)-36,qy=Math.abs(y+8.75)-35.25,d=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0),t=Math.max(0,Math.min(1,d/2.8));rows.push({px,py,object:hit.object.name,blender:[x,y,p.y],developedSignedDistance:d,extraReceiverWeight:t*t*(3-2*t)});}
const report={camera:{position:camera.position.toArray(),target:[-33,3,-46],fov:52,width,height},rows};
const out=new URL('artifacts/scene-space-11/north-view-ground-rays.json',root);fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
