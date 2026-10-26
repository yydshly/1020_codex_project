import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {loadMaterials} from '../canal-real/materials.js';
import {buildStationScene} from './scene.js';
import {loadShipyardLighting} from './lighting-config.js';
import {loadStationGI} from './gi.js?v=oak2048-provenance-3';
import {createStationWater} from './water.js';
import {createLocalReflections} from './reflections.js';
import {buildStationVegetation} from './vegetation.js';
import {createStationJourney} from './journey.js?v=aftdeck-ao-2';
import {mountStationExperience} from './experience.js?v=fullscreen-2';

const params=new URLSearchParams(location.search),qa=params.get('qa')==='1',embedded=params.get('embed')==='1',unbaked=params.get('gi')==='0';
if(embedded)document.body.classList.add('embed');
const $=id=>document.getElementById(id),host=$('world'),keys=new Set(),errors=[];
const state={inputRevision:'station-manual-input-2',runtimeRevision:'shipyard-oak2048-aftdeck-2',sceneId:'shipyard-station',setting:'old-dry-dock-and-passenger-station',phase:'initializing',ready:false,disposed:false,error:null,frames:0,time:0,paused:false,visible:!embedded,view:'platform',quality:'work in progress / not accepted'};
let renderer,scene,camera,controls,composer,fxaa,water,journey,experience,reflections,staticScene,vegetation,lighting,materials,lastTime=0,raf=0,pointer=null,hiddenWasPaused=false;
let shots={
 platform:{position:[24,2.1,20],target:[-15,3,-5],fov:55},
 shipyard:{position:[-23,2.3,13],target:[-30,3,0],fov:52},
 hall:{position:[22.8,2.05,17],target:[25.5,2.5,3],fov:52}
};
const direction=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
function status(phase,text,progress){if(state.disposed)return;state.phase=phase;if($('status'))$('status').textContent=text;if($('progress')&&progress!=null)$('progress').value=progress;console.info('STATION_PHASE '+JSON.stringify({phase,at:performance.now(),progress}));}
function fail(error){if(state.disposed)return;state.ready=false;state.error=String(error.stack||error);state.phase='error';errors.push(state.error);cancelAnimationFrame(raf);$('loading')?.classList.remove('done');if($('status'))$('status').textContent='这处场景暂时未能载入，请刷新重试。';console.error(error);}
window.addEventListener('error',event=>errors.push(String(event.error?.stack||event.message)));
window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason?.stack||event.reason)));
async function init(){
 status('materials','正在准备船坞与候船站…',.02);
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:qa});
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.setPixelRatio(qa?1:Math.min(devicePixelRatio||1,1.5));
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.debug.onShaderError=(gl,program,vertex,fragment)=>fail(new Error(['Station shader failure',gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n')));
 host.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','独立的旧船坞与运河车站，拖动观察，WASD移动');
 scene=new THREE.Scene();scene.fog=new THREE.FogExp2('#bac8cc',.0031);camera=new THREE.PerspectiveCamera(54,1,.045,450);RectAreaLightUniformsLib.init();
 [materials,lighting]=await Promise.all([loadMaterials(renderer,p=>status('materials','正在准备旧砖、钢木与石岸…',.04+p*.25)),loadShipyardLighting()]);if(state.disposed)return;
 const l=lighting.lighting;renderer.toneMappingExposure=2**l.viewExposureEV;
 scene.background=lighting.fullHDR;scene.backgroundIntensity=l.backgroundIntensity;scene.backgroundBlurriness=.025;scene.backgroundRotation.y=l.backgroundRotationYRadians;
 const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(lighting.deSunHDR).texture;scene.environmentIntensity=l.environmentIntensity;scene.environmentRotation.y=l.environmentRotationYRadians;pmrem.dispose();
 const sun=new THREE.DirectionalLight();sun.name='Station extracted physical sun';sun.color.fromArray(l.sun.colorLinear);sun.intensity=l.sun.intensity;sun.target.position.fromArray(l.sun.target);sun.position.copy(sun.target.position).addScaledVector(new THREE.Vector3(...l.sun.directionToLight),l.sun.distance);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-62,right:62,top:46,bottom:-46,near:.5,far:180});sun.shadow.normalBias=.035;sun.shadow.bias=-.00006;sun.shadow.radius=2;scene.add(sun,sun.target);
 state.runtimeLighting={sceneId:lighting.sceneId,lightingFingerprint:lighting.lightingFingerprint,environment:'deSunHDR',background:'fullHDR',sunDirection:l.sun.directionToLight};
 status('architecture','正在展开船坞、月台和候船厅…',.35);staticScene=buildStationScene(scene,materials);shots={...shots,...staticScene.shots};
 status('vegetation','正在准备石缝边的植物…',.5);vegetation=await buildStationVegetation(scene,renderer);if(state.disposed)return;
 status('water','正在准备航道与客船…',.62);water=createStationWater({THREE,renderer,scene,camera});
 controls=new OrbitControls(camera,renderer.domElement);controls.disconnect();renderer.domElement.style.touchAction='none';controls.enableRotate=controls.enablePan=controls.enableZoom=false;controls.enableDamping=false;controls.minDistance=.0001;controls.maxDistance=1000;controls.minPolarAngle=.00001;controls.maxPolarAngle=Math.PI-.00001;
 journey=createStationJourney({scene,camera,controls,materials,onPhase:()=>experience?.refresh?.()});
 status('lighting','正在让新空间的光照就位…',.7);
 state.lighting=unbaked?{mode:'unbaked',bound:0,sceneId:'shipyard-station',accepted:false}:await loadStationGI(scene,{url:'./baked-r1/manifest-oak2048.json',exclude:[water.mesh,journey.group,vegetation,staticScene.auxiliaryGroup].filter(Boolean),expectedLighting:lighting,onProgress:p=>status('lighting','正在让新空间的光照就位…',.7+p*.22)});
 if(state.disposed)return;
 if(!unbaked&&state.lighting.mode!=='full-diffuse')throw new Error('The independent station requires its own complete lighting package');
 if(!unbaked){
  const reviewResponse=await fetch(new URL('./visual-review.json',import.meta.url),{cache:'no-store'});if(reviewResponse.ok)state.visualReview=await reviewResponse.json();
  reflections=createLocalReflections({renderer,scene,exclude:[water.mesh,journey.group],enabled:true,streetProbes:true,onProgress:p=>status('reflections','正在整理玻璃与船坞里的倒影…',.92+p*.055)});
  const background=scene.background;try{scene.background=lighting.deSunHDR;reflections.capture();}finally{scene.background=background;}
 }
 const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));composer.addPass(new OutputPass());fxaa=new ShaderPass(FXAAShader);composer.addPass(fxaa);
 resize();setShot(params.get('shot')||'platform',true);if(errors.length)throw new Error(errors.join('\n'));
 state.ready=true;status('ready','风从船坞吹过来。',1);experience=mountStationExperience({api:window.stationWorld});$('loading')?.classList.add('done');raf=requestAnimationFrame(frame);
}
function resize(){if(!renderer||!camera)return;const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();composer?.setSize(width,height);if(fxaa){const ratio=renderer.getPixelRatio();fxaa.material.uniforms.resolution.value.set(1/(width*ratio),1/(height*ratio));}water?.resize(width,height);}
function frame(now){if(state.disposed)return;raf=requestAnimationFrame(frame);if(!state.ready||(!state.visible&&embedded)||(!qa&&document.hidden)){lastTime=0;return;}const dt=Math.min(.075,lastTime?Math.max(0,(now-lastTime)/1000):0);lastTime=now;if(!state.paused)state.time+=dt;
 if(keys.size&&!journey.getState().cameraFollow){const speed=dt*(keys.has('ShiftLeft')?4:1.7);drive({forward:(Number(keys.has('KeyW'))-Number(keys.has('KeyS')))*speed,right:(Number(keys.has('KeyD'))-Number(keys.has('KeyA')))*speed,up:(Number(keys.has('KeyE'))-Number(keys.has('KeyQ')))*speed});}
 journey.update(now);controls.update();const j=journey.getState();water.update(state.time,{position:new THREE.Vector3(...j.boatPosition),direction:new THREE.Vector2(...(j.velocityDir||[0,-1])),speed:state.paused?0:j.speed||0});composer.render(dt);state.frames++;if(state.frames===3)reflections?.observeSamplers();}
function setShot(name,immediate=false){if(name==='arrival')name='platform';if(!shots[name])throw new Error('Unknown station viewpoint');if(journey?.getState().cameraFollow)throw new Error('Return to the station before changing viewpoints');const shot=shots[name];state.view=name;camera.position.fromArray(shot.position);controls.target.fromArray(shot.target);camera.fov=shot.fov||54;camera.updateProjectionMatrix();controls.update();return getState();}
function navigationBounds(){const view=state.view==='basin'?'shipyard':state.view,b=staticScene?.navigation?.[view]?.bounds;if(b)return b;return view==='shipyard'?{x:[-42,-20.2],y:[1.65,9],z:[-17,20]}:view==='hall'?{x:[24.9,32.6],y:[1.75,4.8],z:[-.5,12.5]}:{x:[20.1,38.5],y:[1.7,9],z:[-14,30]};}
function drive({forward=0,right:side=0,up:rise=0,yaw=0,pitch=0}={}){if(![forward,side,rise,yaw,pitch].every(Number.isFinite))throw new Error('Camera input must be finite');if(!camera||!controls)return getState();
 const following=journey&&(journey.getState().cameraFollow||journey.getState().cameraLocked);
 if(!following){camera.getWorldDirection(direction);direction.y=0;direction.normalize();right.crossVectors(direction,up).normalize();const previous=camera.position.clone(),next=previous.clone().addScaledVector(direction,forward).addScaledVector(right,side).addScaledVector(up,rise),bounds=navigationBounds();for(const axis of ['x','y','z'])if(bounds[axis])next[axis]=THREE.MathUtils.clamp(next[axis],bounds[axis][0],bounds[axis][1]);
  const solids=staticScene?.navigation?.[state.view]?.solids||staticScene?.navigation?.solids||[];
  for(const solid of solids){const min=Array.isArray(solid.min)?new THREE.Vector3(...solid.min):solid.min,max=Array.isArray(solid.max)?new THREE.Vector3(...solid.max):solid.max;if(!min||!max)continue;const box=new THREE.Box3(min,max),delta=next.clone().sub(previous);if(delta.lengthSq()>1e-10&&!box.containsPoint(previous)){const hit=new THREE.Ray(previous,delta.clone().normalize()).intersectBox(box,new THREE.Vector3());if(hit&&hit.distanceTo(previous)<delta.length())next.copy(previous).addScaledVector(delta,Math.max(0,(hit.distanceTo(previous)-.04)/delta.length()));}}
  const delta=next.clone().sub(previous);camera.position.copy(next);controls.target.add(delta);
 }
 if(yaw||pitch){camera.getWorldDirection(direction);const a=Math.atan2(direction.x,direction.z)+yaw%(Math.PI*2),b=THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(direction.y,-1,1))+pitch,-1.35,1.35),length=THREE.MathUtils.clamp(camera.position.distanceTo(controls.target),1,100);direction.set(Math.sin(a)*Math.cos(b),Math.sin(b),Math.cos(a)*Math.cos(b));controls.target.copy(camera.position).addScaledVector(direction,length);}
 controls.update();return getState();}
function setPose({position,target,fov=54}){if(![position,target].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite))||!Number.isFinite(fov)||fov<25||fov>100)throw new Error('Invalid station camera pose');camera.position.fromArray(position);controls.target.fromArray(target);camera.fov=fov;camera.updateProjectionMatrix();controls.update();return getState();}
function getState(){const r=reflections?.getState(),v=state.visualReview,reviewed=state.ready&&!state.disposed&&state.frames>=3&&!state.error&&!errors.length&&state.lighting?.mode==='full-diffuse'&&v?.status==='accepted'&&v.sceneId===state.sceneId&&v.runtimeRevision===state.runtimeRevision&&v.manifestSha256===state.lighting.manifestSha256&&v.modelSha256===state.lighting.modelSha256&&v.lightingFingerprint===state.lighting.lightingFingerprint&&r?.ready&&r.enabled&&r.streetProbes;if(state.lighting)state.lighting.accepted=!!reviewed;state.quality=reviewed?'reviewed independent station / functional evidence recorded separately':'work in progress / not accepted';return {...state,lighting:state.lighting||null,reflections:r||null,journey:journey?.getState()||null,camera:camera?{position:camera.position.toArray(),target:controls?.target?.toArray()||null,fov:camera.fov}:null,navigation:{view:state.view,bounds:navigationBounds()},auxiliaryGeometry:staticScene?.auxiliaryGroup?{mode:'runtime-lit-far-support',sourceAtlasExcluded:true}:null,errors:[...errors]};}
function pause(value=true){state.paused=!!value;journey?.pause(value);return getState();}
function setVisible(value){const next=!!value;if(next===state.visible)return getState();state.visible=next;lastTime=0;if(!next){keys.clear();pointer=null;hiddenWasPaused=state.paused;pause(true);}else if(!hiddenWasPaused)pause(false);return getState();}
window.stationWorld={getState,setShot,drive,setPose,pause,setVisible,
 setLightingDiagnostic(value){if(!qa)throw new Error("Lighting diagnostics require the hidden QA client");if(!reflections)throw new Error("Station probes unavailable");return reflections.setDiagnostic(value);},
 callBoat(){if(journey.getState().phase!=='idle')journey.reset();setShot('platform',true);state.paused=false;journey.callBoat();return getState();},
 choose(value){if(value==='board')setShot('platform',true);state.paused=false;journey.choose(value);return getState();},
 reset(){journey.reset();state.paused=false;setShot('platform',true);return getState();},
 async exportScene(endpoint){if(!unbaked)throw new Error('Exact station source export requires ?gi=0');const {exportStationScene}=await import('./export.js');return exportStationScene({scene,exclude:[water.mesh,journey.group],shots,endpoint,lighting});},
 dispose(){if(state.disposed)return getState();state.disposed=true;state.ready=false;state.phase='disposed';cancelAnimationFrame(raf);keys.clear();experience?.dispose?.();journey?.dispose?.();reflections?.dispose();water?.dispose();controls?.dispose();composer?.dispose();scene?.traverse(o=>o.geometry?.dispose());renderer?.dispose();renderer?.forceContextLoss();return getState();}
};
host.addEventListener('pointerdown',event=>{if(event.button!==0)return;pointer={id:event.pointerId,x:event.clientX,y:event.clientY};try{host.setPointerCapture(event.pointerId);}catch{}event.preventDefault();});
host.addEventListener('pointermove',event=>{if(!pointer||event.pointerId!==pointer.id)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;pointer.x=event.clientX;pointer.y=event.clientY;drive({yaw:-dx*.003,pitch:-dy*.003});event.preventDefault();});
for(const kind of ['pointerup','pointercancel','lostpointercapture'])host.addEventListener(kind,()=>{pointer=null;});
host.addEventListener('wheel',event=>{drive({forward:-THREE.MathUtils.clamp(event.deltaY/100,-1,1)*.5});event.preventDefault();},{passive:false});
window.addEventListener('resize',resize);window.addEventListener('keydown',event=>{if(event.ctrlKey||event.altKey||event.metaKey||/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))return;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft'].includes(event.code)){keys.add(event.code);event.preventDefault();}if(event.code==='Space'){event.preventDefault();pause(!state.paused);}if(event.code==='KeyR')window.stationWorld.reset();});
window.addEventListener('keyup',event=>keys.delete(event.code));window.addEventListener('blur',()=>{keys.clear();pointer=null;});
window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='worlds-visibility')setVisible(event.data.visible);});
document.addEventListener('visibilitychange',()=>{if(!qa)setVisible(!document.hidden);});
init().catch(fail);
