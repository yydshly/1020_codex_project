import * as THREE from 'three';
import {createCompletedFrameQueue} from './raster-frame-queue.js?v=20261026-m8';
import { createRasterTerrain } from './raster-terrain.js?v=20261026-m8';
import { createRasterForest } from './raster-forest.js?v=20261026-m8';
import { createRasterEnvironment, riverCenter, riverWidth } from './raster-water-sky.js?v=20261026-m8';
import { createRasterAtmosphere } from './raster-air.js?v=20261026-m8';
import { createSdfPilot, createBakedSdfMesh, applyPilotClip } from './raster-sdf-mesh.js?v=20261026-m8';
import { createMountainCanopy } from './raster-mountain-canopy.js?v=20261026-m8';
import { createMountainContact } from './raster-mountain-contact.js?v=20261026-m8';
import { createRockNavigation } from './raster-rock-navigation.js?v=20261026-m8';
import { prepareMountainPopulation } from './raster-mountain-ecology.js?v=20261026-m8';
import { createCliffGardens } from './raster-cliff-gardens.js?v=20261026-m8';
import { createRasterExperienceUI } from './raster-experience-ui.js?v=20261026-m8';
import { cullNativeRockTriangles } from './raster-rock-cull.js?v=20261026-m8';
import { applyMorningGrade } from './raster-color-grade.js?v=20261026-m8';
import { createRiparianEcology, applyRiparianGround } from './raster-riparian.js?v=20261026-m8';

const canvas=document.querySelector('#scene'),status=document.querySelector('#status'),load=document.querySelector('#load');
const query=new URLSearchParams(location.search),keys=new Set(),useSurface=query.get('surface')!=='0',useSdf=query.get('sdfPilot')==='1'||useSurface,useMaterial=query.get('material')!=='0';
const preview=query.get('preview')==='1';
const state={sceneId:'lijiang-raster',iteration:'m8',preview,loadTimings:{moduleReady:performance.now()},ready:false,phase:'generating',error:null,time:0,duration:45,paused:true,mode:'flight',frames:0,fps:0,frameMs:0,artAccepted:false,qualityPreset:'smooth',viewPreset:'river',qualityBusy:false};
const QUALITY={smooth:{scale:.75,shadow:2048,reflection:512},clear:{scale:1,shadow:4096,reflection:1024}};
let qualityTransition=Promise.resolve();
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{const error='Raster shader failed: '+gl.getProgramInfoLog(program)+' '+gl.getShaderInfoLog(vertex)+' '+gl.getShaderInfoLog(fragment);state.error=error;console.error(error);};renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFShadowMap;
const scene=new THREE.Scene();scene.environmentIntensity=.04;const camera=new THREE.PerspectiveCamera(58,1,.5,12000);
scene.fog=new THREE.FogExp2(0xb8c9c7,.00022);
let terrain,forest,environment,air,pilot,gardens,riparian,mountainPopulation,mountainCanopy,mountainContact,rockNavigation,experience,generator,pilots=[],terrainClipMaterials=[],disposed=false,last=performance.now(),fpsStart=last,fpsFrames=0,renderRequested=false;
let yaw=0,pitch=0,drag=null,clean=false,lastRasterSignature="";
let strictRendering=false,liveFrameMode='pipelined';
const liveQueue=createCompletedFrameQueue(renderer.getContext(),{maxPending:2,onComplete:sample=>{
  state.frames++;fpsFrames++;state.frameMs=sample.milliseconds;
}});

canvas.addEventListener('webglcontextlost',event=>{state.contextLoss={statusMessage:event.statusMessage||'',time:performance.now(),frame:state.frames};if(disposed)return;state.error='WebGL context lost'+(event.statusMessage?': '+event.statusMessage:'');state.phase='error';state.suspended=true;state.rendering=false;document.querySelector('#load-title').textContent='渲染中断';document.querySelector('#load-detail').textContent='图形上下文已丢失，请重新载入此场景。';load.hidden=false;load.style.display='grid';});
let disposal=null;
function markLoad(name){state.loadTimings[name]=performance.now();}
function updateGroundCover(prewarm=false){if(prewarm&&mountainCanopy?.prewarm)mountainCanopy.prewarm(camera);else mountainCanopy?.update?.(camera);if(prewarm)mountainContact?.prewarm?.(camera);else mountainContact?.update?.(camera);if(prewarm&&riparian?.prewarm)riparian.prewarm(camera);else riparian?.update?.(camera);}
function drainHiddenFrames(){liveQueue.drain().then(()=>{state.rendering=strictRendering;}).catch(error=>{if(!disposed){state.error=String(error);state.phase='error';}});}
function setHostVisibility(value){state.hostSuspended=!value;last=performance.now();fpsStart=last;fpsFrames=0;keys.clear();drag=null;if(!value)drainHiddenFrames();}
addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='worlds-visibility')setHostVisibility(event.data.visible===true);});
document.addEventListener('visibilitychange',()=>{state.documentSuspended=document.hidden;last=performance.now();keys.clear();drag=null;if(document.hidden)drainHiddenFrames();});
const CINE=[[0,-13.1824,36,1350,380,92,450,58],[8,-4.4702,48,1280,420,120,180,58],[18,14.7384,76,1050,500,125,-100,58],[29,-5,54,830,530,75,-320,58],[38,-33,28,690,525,22,-440,58],[45,-50,16,650,520,0,-480,58]];
function spline(t,column){
  const n=CINE.length,d=[],m=[];for(let i=0;i<n-1;i++)d[i]=(CINE[i+1][column]-CINE[i][column])/(CINE[i+1][0]-CINE[i][0]);
  m[0]=0;m[n-1]=0;for(let i=1;i<n-1;i++){if(d[i-1]*d[i]<=0)m[i]=0;else{const a=CINE[i][0]-CINE[i-1][0],b=CINE[i+1][0]-CINE[i][0];m[i]=3*(a+b)/((2*b+a)/d[i-1]+(b+2*a)/d[i]);}}
  let i=0;while(i<n-2&&t>CINE[i+1][0])i++;const h=CINE[i+1][0]-CINE[i][0],u=THREE.MathUtils.clamp((t-CINE[i][0])/h,0,1),u2=u*u,u3=u2*u;
  return(2*u3-3*u2+1)*CINE[i][column]+(u3-2*u2+u)*h*m[i]+(-2*u3+3*u2)*CINE[i+1][column]+(u3-u2)*h*m[i+1];
}
function flight(t){camera.position.set(spline(t,1),spline(t,2),spline(t,3));camera.up.set(0,1,0);camera.fov=spline(t,7);camera.updateProjectionMatrix();camera.lookAt(camera.aspect<.85?new THREE.Vector3(575,0,-170):new THREE.Vector3(spline(t,4),spline(t,5),spline(t,6)));}
function resize(){if(state.capturing)return;const w=Math.max(2,innerWidth),h=Math.max(2,innerHeight);const scale=QUALITY[state.qualityPreset].scale;renderer.setSize(Math.max(2,Math.round(w*scale)),Math.max(2,Math.round(h*scale)),false);camera.aspect=w/h;camera.updateProjectionMatrix();if(state.mode==='flight')flight(state.time);}
addEventListener('resize',resize);resize();flight(0);
function updateUI(){document.querySelector('#time').textContent=state.time.toFixed(1)+' / 45.0';document.querySelector('#seek').value=state.time;document.querySelector('#play').textContent=state.paused?'播放航拍':'暂停';document.querySelector('#mode').textContent=state.mode==='flight'?'自由驾驶 C':'返回航拍 C';status.textContent=state.ready?state.lightingBusy?'正在更新岩壁光照…':state.idle?'静止视角':`${state.fps.toFixed(1)} FPS · ${state.mode==='flight'?'航拍':'WASD / Q E'}`:state.phase;}
function seek(t){state.viewPreset=null;state.time=THREE.MathUtils.clamp(Number(t)||0,0,45);state.paused=true;state.idle=false;state.mode='flight';flight(state.time);updateUI();return getState();}
function toggleMode(){state.viewPreset=null;state.mode=state.mode==='flight'?'free':'flight';if(state.mode==='free'){const e=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');pitch=e.x;yaw=e.y;}else flight(state.time);updateUI();}
function setViewPreset(name){const views={river:0,bay:10,mountains:25,reflection:45};if(!(name in views))throw new RangeError('Unknown view preset');if(state.capturing||disposed)return getState();keys.clear();drag=null;seek(views[name]);state.viewPreset=name;lastRasterSignature='';return getState();}
function applyQualityResources(){const quality=QUALITY[state.qualityPreset];if(sunlight.shadow.mapSize.x!==quality.shadow){sunlight.shadow.map?.dispose();sunlight.shadow.mapPass?.dispose();sunlight.shadow.map=null;sunlight.shadow.mapPass=null;sunlight.shadow.mapSize.set(quality.shadow,quality.shadow);}sunlight.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;environment?.setReflectionSize(quality.reflection);shadowKey='';lastRasterSignature='';state.idle=false;}
function setQualityPreset(name){if(!(name in QUALITY))return Promise.reject(new RangeError('Unknown quality preset'));qualityTransition=qualityTransition.then(async()=>{if(state.capturing||disposed||name===state.qualityPreset)return getState();const held=state.suspended;state.suspended=true;state.qualityBusy=true;keys.clear();drag=null;try{await liveQueue.drain();while(strictRendering)await new Promise(r=>setTimeout(r,2));if(disposed)return getState();state.qualityPreset=name;applyQualityResources();resize();return getState();}finally{state.suspended=held;state.qualityBusy=false;last=performance.now();}});return qualityTransition;}
function setClean(value){clean=value;document.body.classList.toggle('clean',value);return clean;}
document.querySelector('#seek').oninput=e=>seek(e.target.value);
document.querySelector('#play').onclick=()=>{if(state.time===45)seek(0);state.paused=!state.paused;updateUI();};
document.querySelector('#replay').onclick=()=>{seek(0);state.paused=false;updateUI();};document.querySelector('#mode').onclick=toggleMode;
document.querySelector('#hide').onclick=()=>setClean(!clean);document.querySelector('#settings-button').onclick=()=>{document.querySelector('#settings').hidden=!document.querySelector('#settings').hidden;};
document.querySelector('#sun').oninput=e=>{environment?.updateSky?.({sunElevation:Number(e.target.value),sunEl:Number(e.target.value)});updateLight();};
document.querySelector('#sun').onchange=()=>refreshNativeLighting().catch(error=>{state.error=error.message;updateUI();});
document.querySelector('#fog').oninput=e=>{scene.fog.density=Number(e.target.value);air?.update(state.time,{density:Number(e.target.value)});};document.querySelector('#exposure').oninput=e=>renderer.toneMappingExposure=Number(e.target.value);
document.querySelector('#waves').oninput=e=>environment?.updateSky?.({waveStrength:Number(e.target.value)},{refreshLighting:false});
document.querySelector('#wave-speed').oninput=e=>environment?.updateSky?.({waveSpeed:Number(e.target.value)},{refreshLighting:false});
document.querySelector('#reflection').oninput=e=>environment?.updateSky?.({reflectionStrength:Number(e.target.value)},{refreshLighting:false});
document.querySelector('#mist-height').oninput=e=>air?.update(state.time,{mistHeight:Number(e.target.value)});
document.querySelector('#mist-density').oninput=e=>air?.update(state.time,{mistDensity:Number(e.target.value)});
addEventListener('keydown',e=>{if(state.capturing)return;if(/INPUT|TEXTAREA/.test(e.target.tagName))return;const k=e.key.toLowerCase();if(k==='h')return;keys.add(k);if([' ','c','r'].includes(k))e.preventDefault();if(k==='c')toggleMode();if(k==='r'){seek(0);state.paused=false;}if(k===' ')document.querySelector('#play').click();});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>keys.clear());
canvas.addEventListener('pointerdown',e=>{if(!state.ready)return;if(clean&&state.mode==='flight'){setClean(false);return;}if(state.capturing||state.mode!=='free')return;drag={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw-=(e.clientX-drag.x)*.003;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-drag.y)*.003,-1.45,1.45);drag.x=e.clientX;drag.y=e.clientY;camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));});
canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
function freeMove(dt){
  if(!['w','s','a','d','q','e'].some(key=>keys.has(key)))return;
  state.viewPreset=null;const previous=camera.position.clone(),desired=previous.clone(),speed=(keys.has('shift')?80:28)*dt;
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion),right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
  if(keys.has('w'))desired.addScaledVector(forward,speed);if(keys.has('s'))desired.addScaledVector(forward,-speed);
  if(keys.has('a'))desired.addScaledVector(right,-speed);if(keys.has('d'))desired.addScaledVector(right,speed);
  if(keys.has('q'))desired.y-=speed;if(keys.has('e'))desired.y+=speed;
  camera.position.copy(rockNavigation?rockNavigation.resolve(previous,desired):desired);
}

const sunlight=new THREE.DirectionalLight(0xffe6c9,2.7);sunlight.castShadow=true;sunlight.shadow.mapSize.set(QUALITY[state.qualityPreset].shadow,QUALITY[state.qualityPreset].shadow);sunlight.shadow.bias=-.00015;sunlight.shadow.normalBias=.75;sunlight.shadow.radius=2;sunlight.shadow.camera.near=1;sunlight.shadow.camera.far=2800;sunlight.shadow.camera.left=-900;sunlight.shadow.camera.right=900;sunlight.shadow.camera.top=900;sunlight.shadow.camera.bottom=-900;scene.add(sunlight,sunlight.target);scene.add(new THREE.HemisphereLight(0xb9d4dc,0x3d4b32,.7));
let shadowKey='',shadowTime=-1;function updateLight(){const dir=environment?.sunDirection||new THREE.Vector3(-.9,.309,-.1),anchor=new THREE.Vector3(Math.round(camera.position.x/8)*8,0,Math.round(camera.position.z/8)*8),key=[anchor.x,anchor.z,dir.x,dir.y,dir.z,mountainCanopy?.getStats?.().generation,forest?.stats.mainViewCastTriangles].join(',');if(key!==shadowKey||Math.abs(state.time-shadowTime)>.25){sunlight.position.copy(anchor).addScaledVector(dir,1500);sunlight.target.position.copy(anchor);sunlight.target.updateMatrixWorld();renderer.shadowMap.needsUpdate=true;shadowKey=key;shadowTime=state.time;}air?.update(state.time,{sunDirection:dir});}
let requestedLighting=0,lightingJob=null;
async function refreshNativeLighting(){
  if(state.materialOnly){forest?.setSunDirection(environment.sunDirection);state.lightingRevision=(state.lightingRevision||0)+1;state.idle=false;lastRasterSignature='';return;}if(!useSurface)return;
  const producer=generator?.contentWindow;
  if(!producer?.lijiangNativeBakeSurface||!producer?.lijiangNativeBakeRadiance)throw new Error('当前QA缓存不能重新生成光照，请用完整场景加载。');
  requestedLighting++;
  if(lightingJob)return lightingJob;
  lightingJob=(async()=>{
    state.lightingBusy=true;updateUI();
    try{let applied=-1;while(!disposed&&applied!==requestedLighting){
      const version=requestedLighting,sunDirection=environment.sunDirection.toArray();
      const updates=[];
      for(const p of pilots.length?pilots:[pilot]){
        const positions=p.mesh.geometry.attributes.position.array;
        const surface=await producer.lijiangNativeBakeSurface(positions,{sunDirection,maxBatchPixels:60000,specializeVegetation:true});
        updates.push({p,surface});
      }
      const radiance=await producer.lijiangNativeBakeRadiance({sunDirection});
      if(disposed)return;
      // Apply both fields together so the main cliff and surrounding slopes
      // never show two different generations of lighting.
      for(const {p,surface}of updates){
        const colors=new Float32Array(surface.colors.buffer,surface.colors.byteOffset,surface.colors.length);
        p.mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      }
      terrain.setRadiance(radiance);forest.setSunDirection(environment.sunDirection);
      state.lightingRevision=version;state.idle=false;lastRasterSignature='';applied=version;
    }}finally{state.lightingBusy=false;lightingJob=null;updateUI();}
  })();
  return lightingJob;
}
async function generatedFields(){
  if(query.get('qa')==='1'&&query.get('qaFields')==='1'){
    const base='http://127.0.0.1:8799/',meta=await fetch(base+'manifest.json').then(r=>{if(!r.ok)throw new Error('QA generated-field cache missing');return r.json();});
    const fields={rect:meta.rect,resolution:meta.resolution,provenance:{...meta.provenance,qaGeneratedFieldCache:true,engineSHA256:meta.engineSHA256}};
    for(const[k,info]of Object.entries(meta.fields)){const bytes=await fetch(base+info.file).then(r=>r.arrayBuffer());if(bytes.byteLength!==info.byteLength)throw new Error('QA field byte count mismatch');const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(digest!==info.sha256)throw new Error('QA field digest mismatch');const data=info.type==='Float64Array'?new Float64Array(bytes):new Float32Array(bytes);if(k==='trees'||k==='bushes'){fields[k]=Array.from({length:info.count},(_,i)=>({x:data[i*6],y:data[i*6+1],z:data[i*6+2],radius:data[i*6+3],species:data[i*6+4],seed:data[i*6+5]}));}else fields[k]={...info,data};}
    if(useSdf){const info=await fetch(base+'sdf-pilot.json').then(r=>{if(!r.ok)throw new Error('Actual native SDF pilot cache missing');return r.json();});const bytes=await fetch(base+info.file).then(r=>r.arrayBuffer());const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(bytes.byteLength!==info.byteLength||digest!==info.sha256)throw new Error('Actual native SDF pilot bytes failed verification');fields.sdfPilot={field:new Float32Array(bytes),metadata:info.metadata};if(useSurface){if(!info.surface)throw new Error('Native surface-radiance cache missing');const raw=await fetch(base+info.surface.file).then(r=>r.arrayBuffer());const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(x=>x.toString(16).padStart(2,'0')).join('');if(raw.byteLength!==info.surface.byteLength||sha!==info.surface.sha256)throw new Error('Native HDR surface bytes mismatch');fields.sdfPilot.colors=new Float32Array(raw);fields.sdfPilot.colorMetadata=info.surface.metadata;}}
    if(useSurface&&meta.rocksManifest){
      const manifest=await fetch(base+meta.rocksManifest.file).then(r=>r.json());
      if(manifest.bundleId!==meta.bundleId)throw new Error('Procedural rock/terrain bundle mismatch');
      fields.rocks=[];
      for(const rock of manifest.rocks){
        const meshData={};
        for(const [name,info]of Object.entries(rock.meshData)){
          const bytes=await fetch(base+info.file).then(r=>r.arrayBuffer());
          const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
          if(bytes.byteLength!==info.byteLength||sha!==info.sha256)throw new Error('Native rock mesh bytes mismatch');
          meshData[name]=info.type==='Uint32Array'?new Uint32Array(bytes):info.type==='Uint16Array'?new Uint16Array(bytes):new Float32Array(bytes);
        }
        fields.rocks.push({...rock,meshData});
      }
    }
    return fields;
  }
  generator=document.createElement('iframe');generator.id='generator';generator.src=(preview?'./engine-preview.html':'./engine.html')+'?fieldsonly=1&embed=1&qa=1&revision=20261026-m8'+(useSdf?'&sdfpilot=1&sdfres='+encodeURIComponent(query.get('sdfres')||'384'):'')+(useSurface?'&surfacebake=1&radiancebake=1&surfaceSpec=1&rocks=1'+(useMaterial?'&materialOnly=1':''):'');document.body.append(generator);
  const start=performance.now();
  while(!disposed&&performance.now()-start<900000){
    const w=generator.contentWindow;if(w?.lijiangM3Generation)state.generation=JSON.parse(JSON.stringify(w.lijiangM3Generation));
    if(w?.lijiangGeneratedFields&&(!useSdf||w.lijiangGeneratedFields.sdfPilot)){
      const generated=w.lijiangGeneratedFields;
      if(w.lijiangNativePeakSpec)generated.peakSpec=w.lijiangNativePeakSpec.map(p=>Array.from(p));
      if(w.lijiangNativeGroupSpec)generated.groupSpec=JSON.parse(JSON.stringify(w.lijiangNativeGroupSpec));
      if(w.lijiangM6SharedLattice)generated.sharedLattice=JSON.parse(JSON.stringify(w.lijiangM6SharedLattice));
      return generated;
    }
    const text=w?.document?.getElementById('loadtxt')?.textContent;if(text?.startsWith('Error:'))throw new Error(text);
    if(text)document.querySelector('#load-detail').textContent=text;
    await new Promise(r=>setTimeout(r,250));
  }
  throw new Error('Procedural field generation timeout');
}
async function init(){
  const fields=await generatedFields();if(disposed)return;
  if(preview){
    if(!Array.isArray(fields.peakSpec)||fields.peakSpec.length>5)throw new Error('Local preview requires the genuine 3–5 peak generator subset');
    const peaks=fields.peakSpec,bounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
    for(const [x,z,,rx,rz] of peaks){const radius=Math.max(rx,rz)*1.32+250;bounds.minX=Math.min(bounds.minX,x-radius);bounds.maxX=Math.max(bounds.maxX,x+radius);bounds.minZ=Math.min(bounds.minZ,z-radius);bounds.maxZ=Math.max(bounds.maxZ,z+radius);}
    const inside=p=>p.x>=bounds.minX&&p.x<=bounds.maxX&&p.z>=bounds.minZ&&p.z<=bounds.maxZ;
    const originalTrees=fields.trees.length,originalBushes=fields.bushes.length;
    fields.trees=fields.trees.filter(inside);fields.bushes=fields.bushes.filter(inside);
    state.previewScope={bounds,peakCount:peaks.length,peaks:peaks.map(p=>Array.from(p)),originalTrees,originalBushes,retainedTrees:fields.trees.length,retainedBushes:fields.bushes.length,method:'Same production generator and vegetation algorithms on a limited peak subset; population outside the displayed study region is excluded only in preview.'};
    document.querySelector('#toolbar strong').textContent='山群样板 · 局部预览';
    state.mode='free';state.paused=true;
    camera.position.set(-80,110,650);camera.fov=58;camera.updateProjectionMatrix();camera.lookAt(peaks[0][0],130,peaks[0][1]);
    const initialEuler=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');yaw=initialEuler.y;pitch=initialEuler.x;
  }
  markLoad("fieldsReady");state.generation=fields.generationTimings||state.generation;window.lijiangRasterFields=fields;state.materialOnly=!!fields.radiance?.metadata?.materialOnly;state.provenance={...fields.provenance,fieldProducer:fields.provenance.renderer,renderer:'raster-meshes-and-planar-reflection'};state.phase='building terrain';document.querySelector('#load-title').textContent='正在构建岩壁与分层森林';
  terrain=createRasterTerrain({THREE,...fields,camera});scene.add(terrain.group);markLoad("terrainReady");
  if(fields.rocks?.length){
    for(const rock of fields.rocks){
      const centre=rock.metadata.centre,axes=rock.metadata.clipEllipse;
      const prior=pilots.filter(p=>Math.hypot(p.clipSpec.centre[0]-centre[0],p.clipSpec.centre[1]-centre[1])<Math.max(...p.clipSpec.ellipse)+Math.max(...axes));
      const culled=cullNativeRockTriangles({...rock,exclusions:prior.map(p=>p.clipSpec)});
      const item=createBakedSdfMesh({THREE,...rock,meshData:culled.meshData,exclusions:prior.map(p=>p.clipUniforms)});item.culling=culled.stats;pilots.push(item);scene.add(item.group);
    }
    pilot=pilots[0];const uniforms=pilots.map(p=>p.clipUniforms);
    applyPilotClip(terrain.material,{clipUniforms:uniforms,inside:false});
    const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),distance=new THREE.MeshDistanceMaterial();
    for(const m of [depth,distance])applyPilotClip(m,{clipUniforms:uniforms,inside:false});
    terrainClipMaterials=[depth,distance];terrain.group.traverse(o=>{if(o.isMesh){o.customDepthMaterial=depth;o.customDistanceMaterial=distance;}});
    state.rocks={count:pilots.length,authoredPeakCount:fields.peakSpec?.length||pilots.length,connectionPatches:fields.rocks.filter(r=>r.connectionPatch).length,seamTriangles:pilots.reduce((n,p)=>n+(p.seams?.addedTriangles||0),0),vertices:pilots.reduce((n,p)=>n+p.mesh.geometry.attributes.position.count,0),triangles:pilots.reduce((n,p)=>n+p.mesh.geometry.index.count/3,0),culling:pilots.map(p=>p.culling)};
    if(fields.sdfPilot)fields.sdfPilot.field=null;state.sdfPilot=pilot.getStats();
  }else if(fields.sdfPilot){pilot=createSdfPilot({THREE,...fields.sdfPilot,material:terrain.material});if(fields.sdfPilot.colors){const p=pilot.mesh.geometry.getAttribute('position').array,sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(p.buffer,p.byteOffset,p.byteLength)))].map(x=>x.toString(16).padStart(2,'0')).join('');if(sha!==fields.sdfPilot.colorMetadata.positionsSHA256)throw new Error('MC surface-color vertex ordering mismatch');}scene.add(pilot.group);applyPilotClip(terrain.material,{clipUniforms:pilot.clipUniforms,inside:false});const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),distance=new THREE.MeshDistanceMaterial();for(const m of [depth,distance])applyPilotClip(m,{clipUniforms:pilot.clipUniforms,inside:false});terrainClipMaterials=[depth,distance];terrain.group.traverse(o=>{if(o.isMesh){o.customDepthMaterial=depth;o.customDistanceMaterial=distance;}});fields.sdfPilot.field=null;state.sdfPilot=pilot.getStats();}
  rockNavigation=createRockNavigation({THREE,pilots:pilots.length?pilots:pilot?[pilot]:[],terrain});
  if(useSurface){applyMorningGrade(terrain.material);for(const p of pilots.length?pilots:pilot?[pilot]:[])applyMorningGrade(p.mesh.material);}
  // Signed-field rock patches include their flat alluvial foot. Give that
  // shared ground the exact same soil material as the adjacent paged terrain.
  for(const p of pilots.length?pilots:pilot?[pilot]:[])terrain.applyGroundDetail(p.mesh.material);
  applyRiparianGround(terrain.material);
  for(const p of pilots.length?pilots:pilot?[pilot]:[])applyRiparianGround(p.mesh.material);
  await new Promise(r=>setTimeout(r,0));if(disposed)return;
  state.phase='placing mountain forest';document.querySelector('#load-title').textContent='正在让树林沿山坡与岩缝生长';
  mountainPopulation=await prepareMountainPopulation({THREE,pilots:pilots.length?pilots:pilot?[pilot]:[],terrain,trees:fields.trees,bushes:fields.bushes,peaks:fields.peakSpec});
  window.lijiangMountainEcology=mountainPopulation;markLoad('mountainPopulationReady');
  forest=createRasterForest({THREE,trees:mountainPopulation.trees,bushes:mountainPopulation.bushes.filter(p=>!p.cliffScrub),rect:fields.rect,terrain,camera,mountainCanopyOwns:true});scene.add(forest.group);markLoad("forestReady");
  const composed=forest.getPopulation?.();if(composed){fields.composedTrees=composed.filter(p=>!p.bush);fields.composedBushes=composed.filter(p=>p.bush);}
  environment=await createRasterEnvironment({THREE,renderer,scene,camera,rect:fields.rect,terrain,reflectionSize:QUALITY[state.qualityPreset].reflection});if(environment.group)scene.add(environment.group);else{if(environment.water)scene.add(environment.water);if(environment.sky)scene.add(environment.sky);}if(environment.environmentMap)scene.environment=environment.environmentMap;
  mountainCanopy=createMountainCanopy({THREE,records:[...forest.getPopulation(),...mountainPopulation.bushes.filter(p=>p.cliffScrub)],camera,maxTriangles:6000000,maxDetailTriangles:2400000});scene.add(mountainCanopy.group);mountainCanopy.prewarm(camera);markLoad('mountainCanopyReady');
  mountainContact=createMountainContact({THREE,records:mountainPopulation.getContactPaths(),camera});scene.add(mountainContact.group);mountainContact.prewarm(camera);markLoad('mountainContactReady');
  if(pilot&&query.get('gardens')!=='0')gardens=createCliffGardens({THREE,pilot,terrain,sunDirection:environment.sunDirection});
  riparian=createRiparianEcology({THREE,terrain,riverCenter,riverWidth,trees:fields.composedTrees||fields.trees,bushes:fields.composedBushes||fields.bushes,camera});scene.add(riparian.group);markLoad("riparianReady");updateGroundCover(true);
  if(!useSurface||state.materialOnly){await generator?.contentWindow?.lijiangNativeReleaseFields?.();generator?.remove();generator=null;}
  if(query.get('layer')==='terrain')forest.group.visible=false;if(query.get('layer')==='land'){forest.group.visible=false;environment.water.visible=false;}terrain.updateLOD(camera);forest.setSunDirection(environment.sunDirection);forest.prewarm(camera,0);if(query.get('air')!=='0'){air=createRasterAtmosphere({THREE,scene,camera,sunDirection:environment.sunDirection,density:.00022,mistHeight:70,mistDensity:2.3});air.attachObject(terrain.group);air.attachObject(forest.group);air.attach(forest.materials);air.attach(mountainCanopy.materials);air.attach(mountainContact.materials);air.attach(riparian.materials);if(pilots.length)pilots.forEach(p=>air.attachObject(p.group));else if(pilot)air.attachObject(pilot.group);air.attach(environment.water.material,{worldVarying:'vRiverWorld'});}markLoad('scenePrepared');updateLight();await renderer.compileAsync(scene,camera);markLoad('shadersReady');renderer.render(scene,camera);await gpuComplete();markLoad('firstFrameCompleted');
  markLoad('firstInteractive');state.loadTimings.fullSceneReady=state.loadTimings.firstInteractive;state.loadTimings.firstInteractiveIsFullScene=true;state.ready=true;state.phase='ready';state.frames++;load.hidden=true;load.style.display='none';document.querySelectorAll('button,input').forEach(x=>x.disabled=false);setupExperience();window.dispatchEvent(new Event('lijiang-ready'));updateUI();last=performance.now();requestAnimationFrame(tick);
}
function setupExperience(){
  experience=createRasterExperienceUI({renderer,canvas,getState,setViewPreset,setQualityPreset,showTouchPads:false,
    async captureSnapshot(){
      if(lightingJob)await lightingJob;await qualityTransition;
      return{time:state.time,mode:state.mode,paused:state.paused,suspended:!!state.suspended,
        position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),yaw,pitch,
        width:canvas.width,height:canvas.height,viewportWidth:innerWidth,viewportHeight:innerHeight,pixelRatio:renderer.getPixelRatio(),aspect:camera.aspect,fov:camera.fov,
        qualityPreset:state.qualityPreset,viewPreset:state.viewPreset,clean,settingsOpen:!document.querySelector('#settings').hidden};
    },
    pause(value){state.paused=!!value;state.idle=false;},
    suspend(value){state.suspended=!!value;state.idle=false;},
    onCaptureLock(value){state.capturing=!!value;keys.clear();drag=null;if(value)document.querySelector('#settings').hidden=true;},
    resizeForCapture(width,height){state.qualityPreset='clear';applyQualityResources();renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();environment.beforeRender();},
    async prepareFrame(t){seek(t);terrain.updateLOD(camera,{maxUpdates:Infinity});forest.prewarm(camera,t);await renderAt(t);},
    async restoreSnapshot(saved){
      const resized=innerWidth!==saved.viewportWidth||innerHeight!==saved.viewportHeight;state.qualityPreset=saved.qualityPreset;state.viewPreset=saved.viewPreset;applyQualityResources();const scale=QUALITY[state.qualityPreset].scale;renderer.setPixelRatio(saved.pixelRatio);renderer.setSize(resized?Math.round(innerWidth*scale):saved.width/saved.pixelRatio,resized?Math.round(innerHeight*scale):saved.height/saved.pixelRatio,false);
      state.time=saved.time;state.mode=saved.mode;state.paused=true;state.suspended=true;
      yaw=saved.yaw;pitch=saved.pitch;camera.aspect=resized?innerWidth/innerHeight:saved.aspect;camera.fov=saved.fov;camera.updateProjectionMatrix();
      camera.position.fromArray(saved.position);camera.quaternion.fromArray(saved.quaternion);camera.updateMatrixWorld(true);
      terrain.updateLOD(camera,{maxUpdates:Infinity});forest.prewarm(camera,state.time);updateGroundCover(true);environment.update(state.time);environment.beforeRender();updateLight();
      await liveQueue.drain();strictRendering=true;state.rendering=true;try{renderer.render(scene,camera);await gpuComplete();state.frames++;}finally{strictRendering=false;state.rendering=false;}
      setClean(saved.clean);document.querySelector('#settings').hidden=!saved.settingsOpen;updateUI();
    },
    resume(saved){state.paused=saved.paused;state.suspended=saved.suspended;state.idle=false;lastRasterSignature='';last=performance.now();fpsStart=last;fpsFrames=0;updateUI();},
    setMode(mode){if(state.mode!==mode)toggleMode();},
    move(delta){
      if(state.capturing||state.qualityBusy||disposed)return;
      state.viewPreset=null;const previous=camera.position.clone();yaw+=delta.yaw||0;pitch=THREE.MathUtils.clamp(pitch+(delta.pitch||0),-1.45,1.45);
      camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));
      camera.position.addScaledVector(new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion),delta.forward||0);
      camera.position.addScaledVector(new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),delta.right||0);
      camera.position.y+=delta.up||0;
      camera.position.copy(rockNavigation.resolve(previous,camera.position));
      state.idle=false;
    },setClean,
  });
}
async function gpuComplete(){const gl=renderer.getContext();if(gl.isContextLost())throw new Error('Raster context lost');const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!sync)throw new Error('Raster GPU fence could not be created');gl.flush();const start=performance.now();try{for(;;){const result=gl.clientWaitSync(sync,0,0);if(result===gl.ALREADY_SIGNALED||result===gl.CONDITION_SATISFIED)return;if(result===gl.WAIT_FAILED||gl.isContextLost())throw new Error('Raster GPU completion failed: '+JSON.stringify({waitFailed:result===gl.WAIT_FAILED,contextLost:gl.isContextLost(),glError:gl.getError(),elapsedMs:performance.now()-start}));if(performance.now()-start>60000)throw new Error('Raster GPU frame exceeded 60 seconds');await new Promise(r=>setTimeout(r,2));}}finally{gl.deleteSync(sync);}}
async function strictCurrentRender(time){
  while(strictRendering)await new Promise(r=>setTimeout(r,2));
  strictRendering=true;state.rendering=true;
  try{
    await liveQueue.drain();if(time!==undefined)seek(time);state.idle=false;
    terrain?.updateLOD(camera);forest?.updateLOD(camera,state.time);updateGroundCover(true);environment?.update(state.time);environment?.beforeRender?.();updateLight();
    renderer.render(scene,camera);await gpuComplete();state.frames++;
  }finally{strictRendering=false;state.rendering=liveQueue.getState().pending>0;}
  return getState();
}
async function renderAt(t){return strictCurrentRender(t);}
async function renderCurrent(){return strictCurrentRender();}
async function tick(now){if(disposed)return;liveQueue.poll();state.rendering=strictRendering||liveQueue.getState().pending>0;if(state.suspended||state.hostSuspended||state.documentSuspended||strictRendering){last=now;requestAnimationFrame(t=>tick(t).catch(error=>{state.rendering=false;state.error=String(error);state.phase='error';}));return;}const elapsed=Math.max(0,(now-last)/1000),dt=Math.min(.06,elapsed);last=now;if(!state.paused&&state.mode==='flight'){state.time=Math.min(45,state.time+elapsed);if(state.time===45)state.paused=true;}if(state.mode==='flight')flight(state.time);else freeMove(dt);terrain.updateLOD(camera);forest.updateLOD(camera,state.time);updateGroundCover();environment.update(state.time);environment.beforeRender?.();updateLight();const signature=JSON.stringify([state.time,...camera.position.toArray(),...camera.quaternion.toArray(),camera.aspect,canvas.width,canvas.height,renderer.toneMappingExposure,scene.fog.density,environment.getState().settings,air?.getState().mistHeight,air?.getState().mistDensity,state.lightingRevision,terrain.getStats().geometryBuilds,forest.stats.submittedTriangles,forest.stats.mainViewCastTriangles,riparian?.getStats?.().generation,mountainCanopy?.getStats?.().generation,mountainContact?.getStats?.().builds,mountainContact?.getStats?.().submittedTriangles]);if(state.paused&&signature===lastRasterSignature&&!forest.stats.pending&&!riparian?.getStats?.().pending&&!mountainContact?.getStats?.().pending){state.idle=true;updateUI();requestAnimationFrame(t=>tick(t).catch(error=>{state.rendering=false;state.error=String(error);state.phase='error';state.rendering=false;}));return;}if(state.idle){fpsFrames=0;fpsStart=now;}state.idle=false;if(liveFrameMode==='serial'){const start=performance.now();strictRendering=true;state.rendering=true;try{renderer.render(scene,camera);await gpuComplete();state.frames++;fpsFrames++;state.frameMs=performance.now()-start;lastRasterSignature=signature;}finally{strictRendering=false;state.rendering=false;}}else if(liveQueue.canSubmit()){const start=performance.now();renderer.render(scene,camera);liveQueue.submit(start);state.rendering=true;lastRasterSignature=signature;}if(now-fpsStart>1000){state.fps=fpsFrames*1000/(now-fpsStart);fpsFrames=0;fpsStart=now;updateUI();}requestAnimationFrame(t=>tick(t).catch(error=>{state.rendering=false;state.error=String(error.stack||error);state.phase='error';console.error(error);}));}
function getState(){return{...state,quality:{...QUALITY[state.qualityPreset]},liveFrameMode,frameQueue:liveQueue.getState(),uiHidden:clean,export:experience?.getState(),width:canvas.width,height:canvas.height,camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray()},terrain:terrain?.getStats?.(),forest:forest?{...forest.stats}:null,air:air?.getState(),environment:environment?.getState(),gardens:gardens?.getStats(),mountainEcology:mountainPopulation?.stats,mountainCanopy:mountainCanopy?.getStats?.(),mountainContact:mountainContact?.getStats?.(),navigation:rockNavigation?.getStats?.(),riparian:riparian?.getStats(),externalAssets:0};}
function dispose(){if(disposal)return disposal;disposed=true;state.ready=false;state.phase='disposing';disposal=(async()=>{keys.clear();await qualityTransition.catch(()=>{});await experience?.dispose();await liveQueue.drain();state.rendering=strictRendering;while(state.rendering)await new Promise(r=>setTimeout(r,5));if(lightingJob)await lightingJob.catch(()=>{});await generator?.contentWindow?.lijiangNativeReleaseFields?.();generator?.remove();generator=null;air?.dispose();environment?.dispose();rockNavigation?.dispose();mountainContact?.dispose();mountainCanopy?.dispose();forest?.dispose();mountainPopulation?.dispose?.();gardens?.dispose();riparian?.dispose();if(pilots.length)pilots.forEach(p=>p.dispose());else pilot?.dispose();terrain?.dispose();terrainClipMaterials.forEach(m=>m.dispose());liveQueue.dispose();renderer.dispose();renderer.forceContextLoss();state.ready=false;state.phase='disposed';})();return disposal;}
window.lijiangRaster=Object.freeze({getState,setViewPreset,setQualityPreset,export:{start:()=>experience.start(),cancel:()=>experience.cancel(),getState:()=>experience.getState(),getResult:()=>experience.getResult()},getNavigation:()=>rockNavigation,refreshNativeLighting,async setEnvironment(settings){if(!environment||disposed)throw new Error('Scene is not ready');environment.updateSky(settings);if(Number.isFinite(settings.sunElevation))document.querySelector('#sun').value=settings.sunElevation;updateLight();await refreshNativeLighting();lastRasterSignature='';state.idle=false;return getState();},seek,prepareView(t){seek(t);terrain?.updateLOD(camera,{maxUpdates:Infinity});forest?.prewarm(camera,state.time);updateGroundCover(true);return getState();},suspend(value=true){state.suspended=!!value;state.idle=false;return getState();},pause(value=true){state.paused=!!value;state.idle=false;updateUI();return getState();},toggleMode,setClean,renderAt,renderCurrent,async setLiveFrameMode(value){if(!['serial','pipelined'].includes(value))throw new RangeError('Unknown live frame mode');const held=state.suspended;state.suspended=true;await liveQueue.drain();while(strictRendering)await new Promise(r=>setTimeout(r,2));liveFrameMode=value;state.suspended=held;state.rendering=false;state.idle=false;lastRasterSignature='';return getState();},setHorizonWoodVariant(value){if(!mountainCanopy?.setHorizonWoodVariant)throw new Error('Horizon optimization not ready');const result=mountainCanopy.setHorizonWoodVariant(value);renderer.shadowMap.needsUpdate=true;lastRasterSignature='';state.idle=false;return result;},dispose,renderer,scene,camera});
window.lijiangWorld=window.lijiangRaster;
init().catch(error=>{state.error=String(error.stack||error);state.phase='error';document.querySelector('#load-title').textContent='候选渲染失败';document.querySelector('#load-detail').textContent=error.message;console.error(error);});
