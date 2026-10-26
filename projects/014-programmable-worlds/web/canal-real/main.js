import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {loadMaterials} from './materials.js';
import {buildArchitecture} from './architecture.js';
import {buildVegetation} from './vegetation.js';
import {buildInterior} from './interior.js';
import {createCanalWater} from './water.js?v=underwater-clip-3';
import {loadBakedLighting} from './gi.js?v=r5-fingerprint-fixed-model-2';
import {loadR5Lighting} from './lighting-config.js?v=r5-cloudbreak-final-1';
import {loadShopAssets} from './shop-assets.js';
import {buildDistantTown} from './distant-town.js';
import {createStoryWorld} from './story-world.js?v=hud-fitted-paper-ink-4';
import {createTour} from './tour.js';
import {createLocalReflections} from './local-reflections.js?v=street-and-glazing-probes-3';
import {createNavigation} from './navigation.js?v=physical-window-bridge-4';
import {createAuxiliaryGround} from './auxiliary-ground.js?v=courtyard-boundary-2';

const params=new URLSearchParams(location.search),qa=params.get('qa')==='1',embedded=params.get('embed')==='1';
const experience=['window','story'].includes(params.get('experience'))?params.get('experience'):'benchmark';
if(embedded)document.body.classList.add('embed');
const $=id=>document.getElementById(id),host=$('world'),keys=new Set();
const state={sceneId:'canal-street',ready:false,phase:'initializing',error:null,time:0,paused:false,frames:0,view:'window',experience,visible:!embedded,choice:null,storyTime:0,disposed:false,lastFrameMs:0,quality:'benchmark / not accepted'};
const shots={
 window:{position:[-11.7,2.45,13.7],target:[7.3,1.7,-4.7],fov:52,title:'沿着水，留一盏灯。',chapter:'01 / 窗边',description:'雨后的空气很静。对岸的书店刚刚点灯。'},
 quay:{position:[6.8,1.86,8.8],target:[8.3,3.9,-7.8],fov:54,title:'走进雨留下的光。',chapter:'02 / 河岸',description:'石阶、潮湿的砖缝、伸到水边的叶子。'},
 shop:{position:[4.8,1.8,5.1],target:[10.9,2.0,6.4],fov:48,title:'今天，也有人在等一封信。',chapter:'03 / 对岸的店',description:'窗后的灯照着书脊。水面仍映着没有散尽的云。'},
 story:{position:[4.65,1.55,10.2],target:[1.2,.2,3.4],fov:50,title:'一封没有写地址的信。',chapter:'04 / 来信',description:'小船从桥下驶来。你可以决定它下一段旅程。'}
};
let renderer,scene,camera,controls,composer,gtao,fxaa,water,boat,narrative,tour,experienceUi,localReflections,navigation,auxiliaryGround,lastTime=0,raf=0,transition=null,tourActive=false,hiddenTourWasPlaying=false,choiceElapsed=0;
const errors=[];
window.addEventListener('error',event=>errors.push(String(event.error?.stack||event.message)));
window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason?.stack||event.reason)));
function status(phase,text,progress){if(state.disposed)return;state.phase=phase;$('status').textContent=text;if(progress!=null)$('progress').value=progress;console.info('CANAL_PHASE '+JSON.stringify({phase,at:performance.now(),progress}));}
function failScene(error){
 if(state.disposed)return;
 state.ready=false;state.phase='error';state.error=String(error.stack||error);errors.push(state.error);
 cancelAnimationFrame(raf);tour?.pause();experienceUi?.dispose?.();
 $('loading').classList.remove('done');$('loading').querySelector('h1').textContent='场景暂时未能载入。';
 $('status').textContent='请刷新重试。';$('progress').hidden=true;
 console.error(error);
}
function updateQualityReview(){
 const reflections=localReflections?.getState(),reviewed=state.ready&&state.frames>=3&&!state.error&&!state.disposed&&state.lighting?.giSet==='r5'&&state.lighting?.mode==='full-diffuse'&&state.runtimeLighting?.lightingFingerprint==='80836c3f6f8529ef088136e9628e75e100a820760c3c27c148ade87356a01b34'&&reflections?.ready&&reflections.enabled&&reflections.streetProbes&&reflections.diagnostic==='combined';
 state.quality=reviewed?'reviewed / R5 actual runtime':'benchmark / not accepted';
 if(state.lighting){state.lighting.accepted=!!reviewed;state.lighting.reviewRecord=reviewed?'notes/visual-acceptance-r5.md':null;}
}

async function init(){
 const giSet=params.get('giSet');
 if(giSet!==null&&!['r4','r5'].includes(giSet))throw new Error('Unknown fixed lighting candidate');
 const giManifest=giSet==='r5'?'./baked-r5/manifest.json':giSet==='r4'?'./baked-r4/manifest.json':'./baked/manifest.json';
 if(giSet==='r5'&&params.get('gi')==='0')throw new Error('R5 radiance requires its matching full-diffuse GI');
 if(experience!=='benchmark'&&params.get('gi')==='0')throw new Error('A public canal experience requires complete baked lighting');
 status('materials','正在准备街道与窗边…',.02);
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:qa});
 renderer.debug.checkShaderErrors=true;
 renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{const detail=['WebGL shader compile/link failed',gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n');failScene(new Error(detail));};
 renderer.setPixelRatio(qa?1:Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.domElement.setAttribute('aria-label','可驾驶的三维运河');host.append(renderer.domElement);
 scene=new THREE.Scene();scene.fog=new THREE.FogExp2('#a5b2ad',.0045);camera=new THREE.PerspectiveCamera(52,1,.045,220);
 RectAreaLightUniformsLib.init();
 const [m,lightingAsset,shopAssets]=await Promise.all([loadMaterials(renderer,p=>status('materials','正在准备街道与窗边…',.05+p*.3)),giSet==='r5'?loadR5Lighting():new HDRLoader().loadAsync('assets/kloofendal_overcast_puresky/kloofendal_overcast_puresky_2k.hdr'),loadShopAssets(renderer)]);
 if(state.disposed)return;
 const r5=giSet==='r5'?lightingAsset:null,hdr=r5?r5.fullHDR:lightingAsset,ibl=r5?r5.deSunHDR:hdr;
 hdr.mapping=THREE.EquirectangularReflectionMapping;scene.background=hdr;scene.backgroundIntensity=1;scene.backgroundBlurriness=.03;
 const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();scene.environment=pmrem.fromEquirectangular(ibl).texture;scene.environmentIntensity=.9;pmrem.dispose();
 const sun=new THREE.DirectionalLight('#ffefd7',2.2);sun.position.set(-18,28,20);sun.target.position.set(3,0,-2);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-28,right:28,top:27,bottom:-27,near:.5,far:90});sun.shadow.normalBias=.035;sun.shadow.bias=-.00006;sun.shadow.radius=3;scene.add(sun,sun.target);
 if(r5){const l=r5.lighting;scene.environmentIntensity=l.environmentIntensity;scene.backgroundIntensity=l.backgroundIntensity;scene.environmentRotation.y=l.environmentRotationYRadians;scene.backgroundRotation.y=l.backgroundRotationYRadians;renderer.toneMappingExposure=2**l.viewExposureEV;sun.color.fromArray(l.sun.colorLinear);sun.intensity=l.sun.intensity;sun.target.position.fromArray(l.sun.target);sun.position.copy(sun.target.position).addScaledVector(new THREE.Vector3(...l.sun.directionToLight),l.sun.distance);state.runtimeLighting={revision:l.revision,lightingFingerprint:r5.lightingFingerprint,environment:'deSunHDR',background:'fullHDR',probeBackground:'deSunHDR',environmentRotationY:l.environmentRotationYRadians,backgroundRotationY:l.backgroundRotationYRadians,sun:{position:sun.position.toArray(),target:sun.target.position.toArray(),intensity:sun.intensity,colorLinear:sun.color.toArray()}};}
 status('architecture','正在铺开石岸与街巷…',.4);
 buildArchitecture(scene,m,{shopAssets});buildInterior(scene,m,{shopAssets});
 buildDistantTown(scene,m);
 const bed=new THREE.Mesh(new THREE.PlaneGeometry(8.25,144,12,160),m.stone);bed.rotation.x=-Math.PI/2;bed.position.set(0,-1.52,-5);bed.receiveShadow=true;scene.add(bed);
 // Actual rough bottom provides depth to the water's Beer-Lambert absorption.
 const bedPos=bed.geometry.attributes.position,bedUv=bed.geometry.attributes.uv;for(let i=0;i<bedPos.count;i++){bedPos.setZ(i,Math.sin(bedPos.getX(i)*.81+bedPos.getY(i)*.6)*.07);bedUv.setXY(i,bedPos.getX(i),bedPos.getY(i));}
 bed.geometry.computeVertexNormals();
 status('vegetation','正在准备河岸的树与草…',.55);const vegetation=await buildVegetation(scene,renderer);
 if(state.disposed)return;
 status('water','正在准备水面与倒影…',.8);
 water=createCanalWater({THREE,renderer,scene,camera});scene.add(water.mesh);
 narrative=createStoryWorld({scene,camera,materials:m});boat=narrative.boat;
 status('lighting','正在让灯光和场景就位…',.86);
 state.lighting=params.get('gi')==='0'?{mode:'unbaked',bound:0,accepted:false}:await loadBakedLighting(scene,{url:giManifest,expectedLighting:r5,exclude:[water.mesh,narrative.group,vegetation],onProgress:p=>status('lighting','正在让灯光和场景就位…',.86+p*.1)});
 state.lighting.giSet=giSet||'legacy';
 if(state.disposed)return;
 if(experience!=='benchmark'&&state.lighting.mode!=='full-diffuse')throw new Error('Complete canal lighting is unavailable');
 if(state.lighting.mode==='full-diffuse'){
  auxiliaryGround=createAuxiliaryGround({scene,materials:m});state.auxiliaryGeometry=auxiliaryGround.getState();
  const scale=state.lighting.lightingCalibration?.practicalScale??1;if(!Number.isFinite(scale)||scale<0||scale>4)throw new Error('Invalid GI practical calibration');
  scene.traverse(o=>{if(o.isPointLight||o.isRectAreaLight||o.isSpotLight){o.userData.baseIntensity=o.intensity;o.intensity*=scale;}});state.lighting.appliedPracticalScale=scale;
  localReflections=createLocalReflections({renderer,scene,exclude:[water.mesh,narrative.group],enabled:params.get('probes')==='1',streetProbes:params.get('streetProbes')==='1',diagnostic:params.get('lightingDebug')||'combined',onProgress:p=>status('reflections','正在整理街道与窗内的倒影…',.96+p*.025)});
  const visibleBackground=scene.background;
  try{if(r5)scene.background=r5.deSunHDR;localReflections.capture();}finally{scene.background=visibleBackground;}
 }
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.screenSpacePanning=true;controls.minDistance=.25;controls.maxDistance=65;controls.maxPolarAngle=Math.PI*.95;controls.enablePan=true;
 tour=createTour({camera,controls,onCaption:caption=>{$('title').textContent=caption.title;$('chapter').textContent=caption.chapter;$('description').textContent=caption.description;}});
 navigation=createNavigation({camera,controls,canvas:renderer.domElement,getContext:()=>({experience,view:state.view,tourPlaying:tour.getState().playing}),onManual:()=>{transition=null;hiddenTourWasPlaying=false;tour.pause();}});
 controls.addEventListener('start',()=>{transition=null;tour.pause();});
 const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));
 gtao=new GTAOPass(scene,camera,1,1);gtao.enabled=state.lighting.mode!=='full-diffuse';gtao.blendIntensity=.65;gtao.updateGtaoMaterial({radius:.55,distanceExponent:1.3,thickness:.2,scale:1,samples:16});gtao.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:5,radiusExponent:2,rings:2,samples:16});composer.addPass(gtao);
 composer.addPass(new OutputPass());fxaa=new ShaderPass(FXAAShader);composer.addPass(fxaa);
 resize();setShot(params.get('shot')||'window',true);
 if(experience==='story'){state.view='story';tour.restart({play:false});tourActive=true;$('choice').hidden=true;}
 if(state.error)throw new Error(state.error);
 state.ready=true;status('ready','场景已载入。',1);
 if(experience!=='benchmark'){const {mountExperience}=await import('./experience-ui.js?v=shared-setting-scope-3');if(state.disposed)return;experienceUi=mountExperience({experience,api:window.canalReal});}
 $('loading').classList.add('done');requestAnimationFrame(frame);
}
function resize(){if(!renderer||!camera)return;const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();composer?.setSize(width,height);const ratio=renderer.getPixelRatio();fxaa?.material.uniforms.resolution.value.set(1/(width*ratio),1/(height*ratio));water?.resize(width,height);}
function setShot(name,immediate=false){
 if(!shots[name])throw new Error('Unknown view '+name);
 navigation?.reset();tour?.pause();tourActive=false;const s=shots[name];state.view=name;
 const from=camera.position.clone(),to=new THREE.Vector3(...s.position),inRoom=p=>p.x<-9.1&&p.x>=-14.6&&p.z>=7.6&&p.z<=15.4;
 const leaving=inRoom(from)&&!inRoom(to),entering=!inRoom(from)&&inRoom(to);
 const path=[from];
 // The fixed observation buttons pass through the actual open part of the
 // window. A straight room-to-quay interpolation crossed the solid jamb.
 if(leaving)path.push(new THREE.Vector3(-9.75,2.7,11.5),new THREE.Vector3(-8.65,2.7,11.5));
 if(entering)path.push(new THREE.Vector3(-8.65,2.7,11.5),new THREE.Vector3(-9.75,2.7,11.5));
 path.push(to);const lengths=path.slice(1).map((point,index)=>point.distanceTo(path[index]));
 transition={from,to,path,lengths,totalLength:lengths.reduce((sum,length)=>sum+length,0),targetFrom:controls.target.clone(),target:new THREE.Vector3(...s.target),start:performance.now(),duration:leaving||entering?2400:1800};
 if(immediate){camera.position.copy(to);controls.target.copy(transition.target);transition=null;}
 camera.fov=s.fov;camera.updateProjectionMatrix();controls.update();navigation?.configure();
 $('title').textContent=s.title;$('chapter').textContent=s.chapter;$('description').textContent=s.description;
 document.querySelectorAll('[data-shot]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.shot===name)));
 state.storyTime=0;state.choice=null;choiceElapsed=0;narrative?.reset();$('choice').hidden=name!=='story'||experience==='story';return getState();
}
function frame(now){if(state.disposed)return;raf=requestAnimationFrame(frame);if(!state.ready||(!state.visible&&embedded)||(!qa&&document.hidden))return;const begin=performance.now(),realDt=Math.max(0,Math.min(2,lastTime?(now-lastTime)/1000:0)),dt=Math.min(.05,realDt);lastTime=now;
 if(!state.paused){state.time+=dt;if(state.view==='story'&&!tourActive)state.storyTime+=realDt;if(state.choice)choiceElapsed+=realDt;}
 if(transition){
  const t=THREE.MathUtils.clamp((now-transition.start)/transition.duration,0,1),ease=t*t*(3-2*t);
  let distance=ease*transition.totalLength;
  for(let i=0;i<transition.lengths.length;i++){const length=transition.lengths[i];if(distance<=length||i===transition.lengths.length-1){camera.position.lerpVectors(transition.path[i],transition.path[i+1],length?THREE.MathUtils.clamp(distance/length,0,1):1);break;}distance-=length;}
  controls.target.lerpVectors(transition.targetFrom,transition.target,ease);if(t===1)transition=null;
 }
 moveKeys(dt);if(tourActive){tour.update(now);state.storyTime=tour.getState().elapsed;}navigation?.configure();controls.update();
 narrative.update({time:state.time,elapsed:state.storyTime,choiceElapsed,delta:realDt,paused:state.paused,now});
 const boatSpeed=state.paused?0:state.choice==='read'?.22:state.choice==='drift'?.62:state.view==='story'&&(!tourActive||tour.getState().playing)?.18:0;
 water.update(state.time,{position:narrative.boat.position,speed:boatSpeed});composer.render(dt);if(state.frames===2)localReflections?.observeSamplers();state.frames++;state.lastFrameMs=performance.now()-begin;
}
function moveKeys(dt){if(!keys.size)return;const speed=dt*(keys.has('ShiftLeft')?4:1.8);navigation.translate({forward:(Number(keys.has('KeyW'))-Number(keys.has('KeyS')))*speed,right:(Number(keys.has('KeyD'))-Number(keys.has('KeyA')))*speed,up:(Number(keys.has('KeyE'))-Number(keys.has('KeyQ')))*speed});}
function startTour(){if(!state.ready)throw new Error('Scene not ready');if(tour.getState().ended||state.choice)return restartTour();navigation.reset();state.paused=false;state.view='story';tourActive=true;transition=null;tour.play();return getState();}
function pauseTour(value=true){hiddenTourWasPlaying=false;if(!value)return startTour();tour.pause();state.paused=true;return getState();}
function restartTour(){navigation.reset();state.paused=false;state.choice=null;choiceElapsed=0;state.storyTime=0;state.view='story';transition=null;narrative.reset();tourActive=true;tour.restart();$('choice').hidden=true;return getState();}
function choose(value){if(!['read','drift'].includes(value))throw new Error('Unknown choice');tour?.pause();tourActive=false;state.choice=value;choiceElapsed=0;state.paused=false;narrative.choose(value);$('choice').hidden=true;$('title').textContent=value==='read'?'原来，有人记得这扇窗。':'它会遇见下一位等信的人。';$('description').textContent=value==='read'?'“雨停以后，记得打开窗。”':'水流把故事继续送向桥外。';return getState();}
function getState(){updateQualityReview();return{...state,navigation:navigation?.getState()||null,reflections:localReflections?.getState()||null,tour:tour?{...tour.getState(),active:tourActive}:null,dynamic:narrative?.getState()||null,camera:camera?{position:camera.position.toArray(),target:controls?.target.toArray(),fov:camera.fov}:null,renderer:renderer?{width:renderer.domElement.width,height:renderer.domElement.height,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}:null,errors:[...errors]};}
function setVisible(value){state.visible=!!value;lastTime=0;if(!value){keys.clear();navigation?.cancelInput();}if(!value&&tour?.getState().playing){hiddenTourWasPlaying=true;tour.pause();}else if(value&&hiddenTourWasPlaying&&(qa||!document.hidden)){hiddenTourWasPlaying=false;tour.play();}return getState();}
window.canalReal={getState,setShot,startTour,pauseTour,restartTour,choose,
 pause(value=true){state.paused=!!value;if(tourActive){if(value)tour.pause();else if(!tour.getState().ended)tour.play();}return getState();},
 seekTour(seconds){navigation.reset();state.choice=null;choiceElapsed=0;narrative.reset();state.view='story';tourActive=true;transition=null;tour.seek(seconds);state.storyTime=seconds;return getState();},
 setPose({position,target,fov=camera.fov}){if(![position,target].every(v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=250))||!Number.isFinite(fov)||fov<25||fov>100)throw new Error('Invalid camera pose');navigation.reset({explicitPose:true});tour.pause();transition=null;camera.position.fromArray(position);controls.target.fromArray(target);camera.fov=fov;camera.updateProjectionMatrix();controls.update();navigation.configure();return getState();},
 setTime(time){if(!Number.isFinite(time))throw new Error('Invalid time');state.time=time;return getState();},
 setLightingDiagnostic(mode){if(!localReflections)throw new Error('Lighting diagnostics require the baked scene');localReflections.setDiagnostic(mode);return getState();},
 async exportScene(endpoint){if(state.lighting?.mode==='full-diffuse')throw new Error('Source geometry export requires ?gi=0');if(!/^http:\/\/127\.0\.0\.1:8798\/export\/[a-f0-9]{48}$/.test(endpoint))throw new Error('Invalid local export endpoint');const {exportScene}=await import('./scene-export.js');return exportScene({scene,exclude:[water.mesh,narrative.group],shots,endpoint});},
 drive({forward=0,right=0,up=0,yaw=0,pitch=0}={}){navigation.translate({forward,right,up});if(yaw||pitch)navigation.look({yaw,pitch});return getState();},
 setVisible,dispose(){state.disposed=true;state.ready=false;state.phase='disposed';keys.clear();cancelAnimationFrame(raf);tour?.pause();experienceUi?.dispose?.();navigation?.dispose();controls?.dispose();localReflections?.dispose();water?.dispose();auxiliaryGround?.dispose();composer?.dispose();scene?.traverse(o=>{o.geometry?.dispose();});renderer?.dispose();renderer?.forceContextLoss();return getState();}};
window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin)return;if(e.data?.type==='worlds-visibility')window.canalReal.setVisible(e.data.visible);});
window.addEventListener('resize',resize);window.addEventListener('keydown',e=>{if(e.ctrlKey||e.altKey||e.metaKey||/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))return;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft'].includes(e.code)){keys.add(e.code);e.preventDefault();}if(e.code==='KeyR'){if(experience==='story')restartTour();else setShot(state.view);}});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();navigation?.cancelInput();});
document.addEventListener('visibilitychange',()=>{if(qa)return;if(document.hidden&&tour?.getState().playing){hiddenTourWasPlaying=true;tour.pause();}else if(!document.hidden&&hiddenTourWasPlaying&&state.visible){hiddenTourWasPlaying=false;tour.play();lastTime=0;}});
if(experience==='benchmark'){document.querySelectorAll('[data-shot]').forEach(button=>button.addEventListener('click',()=>setShot(button.dataset.shot)));document.querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.choice)));$('pause').addEventListener('click',()=>{window.canalReal.pause(!state.paused);$('pause').textContent=state.paused?'继续水流':'暂停水流';});$('reset').addEventListener('click',()=>setShot(state.view));}
$('fullscreen').addEventListener('click',()=>document.fullscreenElement?document.exitFullscreen():$('app').requestFullscreen());
init().catch(failScene);
