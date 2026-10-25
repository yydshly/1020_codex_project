// SPDX-License-Identifier: GPL-3.0-only
// Independent procedural ocean renderer. No historical atlas runtime or assets.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildBathymetry} from './terrain.js?v=10';
import {validateCameraState} from './core/camera-state.mjs';
import {createHydrothermalPlume} from './rendering/hydrothermal-plume.mjs?v=3';
import {createVentLife,createSpongeColony} from './rendering/benthic-life.mjs?v=2';
import {planExpeditionShot} from './rendering/shot-camera.mjs?v=8';
import {createResearchVessel,createWaterColumn,createSeabedContext,createSamplingEquipment} from './rendering/expedition-context.mjs?v=7';
import {createRovLightShaft} from './rendering/ocean-water.mjs?v=3';
import {createLearningWorld} from './rendering/learning-world.mjs?v=5';
import {createRovSystem} from './rendering/rov-system.mjs?v=1';
import {createPilotController} from './core/pilot-core.mjs?v=2';
import {createCollisionWorld} from './rendering/collision-world.mjs?v=2';
import {ROV_COLLISION_PROFILE,ROV_BODY_RADIUS,snapshotSolidColliders} from './rendering/collision-assets.mjs?v=2';
import {createEnvironmentCues} from './rendering/environment-cues.mjs?v=6';
import {createCueLabels} from './rendering/cue-labels.mjs?v=5';
import {computeCueLayout} from './rendering/cue-layout.mjs?v=1';
import {createCueLens} from './rendering/cue-lens.mjs?v=5';

const SIZE = 620;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function randomFrom(seed) {
  let n = seed | 0;
  return () => { n |= 0; n = n + 0x6d2b79f5 | 0; let t = Math.imul(n ^ n >>> 15, 1 | n); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/**
 * A rendering adapter: application state and scientific content stay outside it.
 * normalized position [u,v] -> seabed x/z; height is procedural teaching terrain.
 */
export function createOceanScene({container, onSelect = () => {}, onReady = () => {}, onError = () => {}, onCameraChange = () => {}}) {
  if (!container) throw new TypeError('Ocean scene requires a container');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({antialias:true, alpha:false, powerPreference:'high-performance'});
  } catch (error) {
    onError(error);
    return {setMission(){}, update(){}, setLayer(){}, setCamera(){}, setPresentation(){}, focusEntity(){}, resetCamera(){},setDirectorEnabled(){},setDirectorFrame(){},setContextLabels(){},setLearningStep(){},setEquipmentDemoTime(){},getLearningState:()=>({kind:null,step:0,stepsCount:0}),setSamplingProgress(){},getEnvironmentState:()=>({phase:'seabed',depth:0,baseDepth:0}), getCameraState:()=>({position:[325,475,410],target:[0,-18,0],mode:'overview'}),restoreCameraState:validateCameraState,destroy(){}, getStats:()=>({webgl:false,error:String(error.message || error)})};
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x041b2b, 1);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label','三维海底科考场景。拖动旋转，滚轮缩放；点击科考站查看记录。');
  canvas.setAttribute('role','img');
  canvas.tabIndex=0;
  Object.assign(canvas.style,{display:'block',width:'100%',height:'100%',touchAction:'none',position:'absolute',inset:'0'});
  container.append(canvas);
  const overlay = document.createElement('div');
  overlay.className = 'ocean-scene-labels';
  Object.assign(overlay.style,{position:'absolute',inset:'0',pointerEvents:'none',overflow:'hidden',zIndex:'2'});
  container.append(overlay);
  const contextOverlay=document.createElement('div');contextOverlay.className='ocean-context-labels';Object.assign(contextOverlay.style,{position:'absolute',inset:'0',pointerEvents:'none',overflow:'hidden',zIndex:'3'});container.append(contextOverlay);
  const contextNodes={};for(const name of ['vehicle','subject','vessel','tether']){const element=document.createElement('span');element.className=`ocean-context-label context-${name}`;Object.assign(element.style,{position:'absolute',display:'none',pointerEvents:'none',padding:'6px 9px',borderLeft:'2px solid #d7bf83',background:'#0a2938d9',color:'#ece6d1',font:'11px/1.5 ui-sans-serif,system-ui,sans-serif',borderRadius:'2px',transform:'translate(-50%,-100%)',whiteSpace:'nowrap',boxShadow:'0 3px 12px #03182240'});contextOverlay.append(element);contextNodes[name]=element;}
  const learningOverlay=document.createElement('div'),learningNodes=new Map();learningOverlay.className='ocean-learning-labels';Object.assign(learningOverlay.style,{position:'absolute',inset:'0',pointerEvents:'none',overflow:'hidden',zIndex:'3',display:'none'});container.append(learningOverlay);
  const roverLabel=document.createElement('span');roverLabel.className='ocean-rover-label';roverLabel.textContent='◆ ROV 观测位';
  Object.assign(roverLabel.style,{position:'absolute',pointerEvents:'none',color:'#ffe0a2',font:'600 10px/1.4 ui-sans-serif,system-ui,sans-serif',letterSpacing:'.04em',textShadow:'0 1px 4px #061a25',transform:'translate(-50%,-100%)',zIndex:'5',whiteSpace:'nowrap'});overlay.append(roverLabel);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c2c3b);
  scene.fog = new THREE.FogExp2(0x183e4b, .00085);
  // Low-contrast studio reflections reveal metal edges without introducing a
  // visible sky or pretending that deep water is lit by a surface panorama.
  const reflectionScene=new THREE.Scene();reflectionScene.background=new THREE.Color(0x263d48);
  const reflectionWall=new THREE.Mesh(new THREE.BoxGeometry(160,160,160),new THREE.MeshBasicMaterial({color:0x21343d,side:THREE.BackSide}));reflectionScene.add(reflectionWall);
  for(const [x,y,z,sx,sy,color] of [[-50,35,-20,28,90,0x9ebfc8],[20,70,0,65,45,0xcbd9d3],[65,10,25,18,70,0x547c8b]]){
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(sx,sy),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));panel.position.set(x,y,z);panel.lookAt(0,0,0);reflectionScene.add(panel);
  }
  const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(reflectionScene,.02);pmrem.dispose();scene.environment=environment.texture;scene.environmentIntensity=.48;
  reflectionScene.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
  const camera = new THREE.PerspectiveCamera(46, 1, .5, 2500);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .07;
  controls.minDistance = 48;
  controls.maxDistance = 1040;
  controls.maxPolarAngle = 1.16;
  controls.minPolarAngle = .12;
  controls.screenSpacePanning = false;
  controls.cursor.set(0,-25,0);controls.maxTargetRadius=650;
  controls.target.set(0,-30,0);
  camera.position.set(520,420,580);
  const hemisphere = new THREE.HemisphereLight(0xadced7,0x354b4b,1.4);scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xc9e2e6,3.05);
  key.position.set(-290,380,170);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-470;key.shadow.camera.right=470;key.shadow.camera.top=470;key.shadow.camera.bottom=-470;key.shadow.camera.near=20;key.shadow.camera.far=1100;key.shadow.bias=-.00015;key.shadow.normalBias=.28;key.shadow.radius=3;scene.add(key);
  const rim = new THREE.DirectionalLight(0x629ca8,.55);
  rim.position.set(260,110,-320); scene.add(rim);
  const selectionLight=new THREE.PointLight(0xc5e8e4,460,150,2);selectionLight.visible=false;scene.add(selectionLight);
  const seabedGroup = new THREE.Group(); scene.add(seabedGroup);
  const routeGroup = new THREE.Group(); scene.add(routeGroup);
  const propGroup = new THREE.Group(); scene.add(propGroup);
  const effectsGroup = new THREE.Group(); scene.add(effectsGroup);
  const vehicleGroup = new THREE.Group(); scene.add(vehicleGroup);
  const ambientGroup = new THREE.Group(); scene.add(ambientGroup);
  const contextGroup=new THREE.Group();scene.add(contextGroup);
  const overheadGroup=new THREE.Group();overheadGroup.visible=false;scene.add(overheadGroup);
  const oceanGroup=new THREE.Group();scene.add(oceanGroup);
  const learningWorld=createLearningWorld();scene.add(learningWorld.group);
  const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),new THREE.MeshBasicMaterial({color:0x031725}));
  groundPlane.rotation.x = -Math.PI/2; groundPlane.position.y = -700; scene.add(groundPlane);

  let mission = null, currentView = null, telemetry = null, destroyed = false, ready = false;
  let width = 1, height = 1, cameraMode = 'overview', transition = null, lastStamp = 0, elapsed = 0;
  let heightAt = () => -25, rover = null, roverAdapter=null, activeRoute = null, completeRoute = [], tether = null, halo = null;
  let stationLabels = [], pickables = [], plumeSystems = [], propAnimations = [], propLights = [];
  let ambientParticles = null, fanRotors = [], renderFrame = 0,labelRefresh=0,contextLabelRefresh=0,lastHoverStamp=0,roverBounds=null;
  let selectedEntityId = null, presentation='survey', terrainAdapter=null, vehicleLights=[], routeUniforms=[], needsInitialPose=true;
  let userAdjustedCamera=false, cameraDirty=false, stableCameraFrames=0;
  let contextAdapter=null,waterColumn=null,vesselAdapter=null,surfaceSite=null,contextLabelsEnabled=false;
  let directorActive=false,directorFrame=null,directorEntry=null,directorSaved=null,lastDirectorVisualTime=null;
  let pilotController=null,pilotActive=false,pilotCamera='chase',pilotStart=null,pilotLook={yaw:0,pitch:-.08};
  let environmentCues=null,environmentCueFrame=null,cueLabelRefresh=0;
  let cueFocus=null,cueProjection=false,cueLayoutCache=null;
  let bodyWorld=null,scriptedWorld=null,cameraWorld=null,pilotRecovery=null,pilotRecoveryDelta=new THREE.Vector3(),cameraCut=true,lastSafeCamera=null,lastSafeVehicle=null,scriptedCutPending=true;
  const centreBounds={minX:-580+ROV_BODY_RADIUS,maxX:580-ROV_BODY_RADIUS,minZ:-580+ROV_BODY_RADIUS,maxZ:580-ROV_BODY_RADIUS};
  const cameraProfile={min:{x:-3,y:-3,z:-3},max:{x:3,y:3,z:3}};
  const vehicleCameraWorld=createCollisionWorld({heightAt:()=>-10000,bounds:{minX:-10000,maxX:10000,minZ:-10000,maxZ:10000},ceiling:10000,colliders:[ROV_COLLISION_PROFILE]});
  const samplingEquipment=new Map(),entityRoots=new Map();
  const lastCameraPosition=new THREE.Vector3(),lastCameraTarget=new THREE.Vector3();
  const visibility = {route:true,labels:true,terrain:true,plumes:true};
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const projected = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const worldPosition = new THREE.Vector3();
  const previousRoverPosition = new THREE.Vector3();
  let pointerDown = null,pointerTravel=0;
  const particleCanvas=document.createElement('canvas');particleCanvas.width=64;particleCanvas.height=64;
  const particleContext=particleCanvas.getContext('2d');
  const falloff=particleContext.createRadialGradient(32,32,1,32,32,31);
  falloff.addColorStop(0,'rgba(255,255,255,1)');falloff.addColorStop(.2,'rgba(255,255,255,.8)');falloff.addColorStop(.65,'rgba(255,255,255,.24)');falloff.addColorStop(1,'rgba(255,255,255,0)');
  particleContext.fillStyle=falloff;particleContext.fillRect(0,0,64,64);
  const particleTexture=new THREE.CanvasTexture(particleCanvas);
  const cueLabels=createCueLabels({container,camera,getSize:()=>({width,height}),isOccluded:point=>terrainOccludes(point),getViewerPosition:()=>rover?.position||camera.position});
  const cueLens=createCueLens({container,getSize:()=>({width,height}),heightAt:(x,z)=>heightAt(x,z),getEntityRoot:id=>entityRoots.get(id),getEntity:id=>mission?.entities.find(entity=>entity.id===id)});

  function mesh(geometry, material, parent, x=0, y=0, z=0) {
    const object = new THREE.Mesh(geometry, material);object.castShadow=true;object.receiveShadow=true; object.position.set(x,y,z); parent.add(object); return object;
  }
  function material(color, extra={}) { return new THREE.MeshStandardMaterial({color,roughness:.82,metalness:.08,...extra}); }
  function segment(a,b,radius,mat,parent) {
    const delta = new THREE.Vector3().subVectors(b,a);
    const object = mesh(new THREE.CylinderGeometry(radius,radius,delta.length(),6),mat,parent);
    object.position.copy(a).add(b).multiplyScalar(.5);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()); return object;
  }
  function toWorld(position, lift=0) {
    const x = (position[0]-.5)*SIZE, z = (position[1]-.5)*SIZE;
    return new THREE.Vector3(x,heightAt(x,z)+lift,z);
  }
  function vehicleLocation(sample){
    const location=toWorld(sample.position);location.x+=22;location.z+=26;
    location.y=heightAt(location.x,location.z)+21;
    location.y+=clamp(((mission.baseDepth||2600)-(sample.depth||mission.baseDepth||2600))*.025,-3,25);
    return location;
  }
  function stagedVehicleLocation(){
    const bottom=vehicleLocation(telemetry||{position:mission.entities[0].position,depth:mission.baseDepth});
    if(!directorActive||!surfaceSite)return bottom;
    const motion=directorFrame?.motionFraming??directorFrame?.framing;
    if(motion==='departure'){
      // Clear the seafloor vertically before crossing the relief. The last leg
      // is outside the stern, at the same verified launch/recovery station.
      const p=directorFrame.progress,above=bottom.clone();above.y=surfaceSite.position.y-62;
      const below=surfaceSite.deployment.clone();below.y=above.y;const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
      if(p<.42)return bottom.clone().lerp(above,ease(p/.42));
      if(p<.80)return above.lerp(below,ease((p-.42)/.38));
      return below.lerp(surfaceSite.deployment,ease((p-.80)/.20));
    }
    if(motion!=='establishing')return bottom;
    const p=directorFrame.progress,start=surfaceSite.deployment.clone(),t=clamp((p-.25)/.60,0,1);
    start.y-=Math.min(1,p/.25)*6;
    // First descend outside the stern, then travel underneath the keel. A
    // diagonal from the deck to the seabed cuts through the vessel's stern.
    const belowKeel=start.clone();belowKeel.y=surfaceSite.position.y-62;
    if(t<.18){const d=t/.18;return start.lerp(belowKeel,d*d*(3-2*d));}
    const travel=(t-.18)/.82;return belowKeel.lerp(bottom,travel*travel*(3-2*travel));
  }
  function getEnvironmentState(){
    const baseDepth=mission?.baseDepth||2600,water=surfaceSite?.position.y||430;
    const stateAt=position=>{const floor=heightAt(position.x,position.z),ratio=clamp((water-position.y)/Math.max(180,water-floor),0,1),clearance=position.y-floor;return {phase:position.y>=water-.2?'surface':clearance>155?'descent':'seabed',depth:Math.round(baseDepth*ratio),baseDepth,clearance};};
    const cameraState=stateAt(camera.position),vehicle=stateAt(rover?.position||camera.position);
    return {...cameraState,camera:cameraState,vehicle,diagram:directorActive&&learningWorld.isActive(),viewMode:pilotActive?pilotCamera:cameraMode};
  }
  function updateWaterEnvironment(){
    const water=surfaceSite?.position.y||430,under=clamp((water-camera.position.y+1)/14,0,1),deep=clamp((water-camera.position.y)/220,0,1);
    const sky=new THREE.Color(0x91b6c9),waterBlue=new THREE.Color(0x155b79),abyss=new THREE.Color(0x041d31),fogDeep=new THREE.Color(0x0b3d53);
    scene.background.copy(sky).lerp(waterBlue,under).lerp(abyss,under*deep);
    scene.fog.color.copy(sky).lerp(new THREE.Color(0x216d89),under).lerp(fogDeep,under*deep);
    scene.fog.density=THREE.MathUtils.lerp(.00042,.00275+.0017*deep,under);
    hemisphere.color.set(under>.5?0x83bfd1:0xc3dfeb);hemisphere.groundColor.set(under>.5?0x123b4b:0x466a73);hemisphere.intensity=THREE.MathUtils.lerp(1.9,1.02,under);
    key.color.set(under>.5?0x99cad7:0xffefd8);key.intensity=THREE.MathUtils.lerp(3.25,1.65,under);key.position.set(-650,950,400);key.shadow.camera.far=1750;
    rim.intensity=THREE.MathUtils.lerp(.45,.24,under);scene.environmentIntensity=THREE.MathUtils.lerp(.72,.38,under);
    if(mission?.terrain==='canyon'&&under>.5){scene.fog.density*=.72;hemisphere.intensity*=1.25;key.intensity*=1.16;}
    if(!directorActive&&presentation==='survey'&&under>.5){scene.fog.density=.00115;hemisphere.intensity=1.3;key.intensity=2.05;}
    waterColumn?.setAbsorptionColour(scene.background);
  }
  function disposeChildren(group) {
    const geometries = new Set(), materials = new Set();
    group.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry); if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});
    group.clear(); geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose());
  }

  function buildTerrain(data) {
    const terrain=buildBathymetry(data);terrainAdapter=terrain;heightAt=terrain.heightAt;seabedGroup.add(terrain.group);
  }

  function buildVehicle(){
    roverAdapter=createRovSystem();rover=roverAdapter.group;rover.scale.setScalar(.85);vehicleGroup.add(rover);fanRotors=roverAdapter.fanRotors;
    for(const mount of roverAdapter.lightMounts){const spotlight=new THREE.SpotLight(0xfff0d1,1700,175,.43,.78,1.8);spotlight.position.copy(mount);const target=new THREE.Object3D();vehicleGroup.add(target);spotlight.target=target;rover.add(spotlight);const beam=createRovLightShaft();vehicleGroup.add(beam);vehicleLights.push({light:spotlight,target,beam});}
    const tetherGeometry=new THREE.BufferGeometry();tetherGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(35*3),3));
    tether=new THREE.Line(tetherGeometry,new THREE.LineBasicMaterial({color:0x6f929c,transparent:true,opacity:.22,depthWrite:false}));vehicleGroup.add(tether);
    const ring=mesh(new THREE.RingGeometry(8.5,9.0,48),new THREE.MeshBasicMaterial({color:0x74d9d4,transparent:true,opacity:.1,side:THREE.DoubleSide,depthWrite:false}),vehicleGroup);ring.rotation.x=-Math.PI/2;ring.visible=false;halo=ring;
    rover.updateWorldMatrix(true,true);roverBounds=new THREE.Box3().setFromObject(rover).applyMatrix4(rover.matrixWorld.clone().invert());
  }

  function buildChimneys(group,rng){
    const rock=material(0x364c4a,{roughness:.94,metalness:0}),crust=material(0x536b66,{roughness:.96,metalness:0});
    const shell=material(0xffffff,{vertexColors:true,roughness:.89,metalness:0});
    const darkMineral=new THREE.Color(0x2a3f43),paleMineral=new THREE.Color(0x71877d),mineralColor=new THREE.Color();
    const heights=[34,23,18,12,9];
    for(let i=0;i<heights.length;i++){
      const x=i===0?0:(rng()-.5)*24,z=i===0?0:(rng()-.5)*18,h=heights[i]+rng()*4,r=2.4+rng()*2;
      const geo=new THREE.CylinderGeometry(r*.46,r,h,17,22,true),p=geo.attributes.position,colors=new Float32Array(p.count*3);
      for(let j=0;j<p.count;j++){
        const y=p.getY(j),t=(y+h/2)/h,theta=Math.atan2(p.getZ(j),p.getX(j));
        const crustiness=1+.19*Math.sin(theta*5+t*17)+.1*Math.sin(theta*11-t*31)+.09*Math.sin(theta*17+t*43);
        p.setXYZ(j,p.getX(j)*crustiness+Math.sin(t*4+i)*t*2,p.getY(j),p.getZ(j)*crustiness+Math.sin(t*3+i)*t*1.7);
        mineralColor.copy(darkMineral).lerp(paleMineral,clamp(.13+t*.5+Math.sin(theta*3+t*12)*.15,0,.8));colors[j*3]=mineralColor.r;colors[j*3+1]=mineralColor.g;colors[j*3+2]=mineralColor.b;
      }
      geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.computeVertexNormals();mesh(geo,shell,group,x,h/2,z);
      for(let j=0;j<12;j++){
        const y=2+rng()*(h-5),angle=rng()*6.28,rad=r*(1-y/h*.53);
        const lump=mesh(new THREE.IcosahedronGeometry(.22+rng()*.55,1),rng()>.58?crust:rock,group,x+Math.cos(angle)*rad,y,z+Math.sin(angle)*rad);lump.scale.y=.45+rng()*.8;
      }
      const lip=mesh(new THREE.TorusGeometry(r*.45,.28,5,17),crust,group,x+Math.sin(4+i)*2,h,z+Math.sin(3+i)*1.7);lip.rotation.x=Math.PI/2;
      const plume=createHydrothermalPlume({origin:[x+Math.sin(4+i)*2,z+Math.sin(3+i)*1.7],height:h,texture:particleTexture,random:rng,primary:i===0});plume.object.position.copy(group.position);plume.object.scale.copy(group.scale);effectsGroup.add(plume.object);plumeSystems.push(plume);
    }
    const tubeMat=material(0xb2aaa0,{roughness:1}),tipMat=material(0x995e4f,{roughness:1});
    for(let i=0;i<46;i++){const angle=rng()*6.28,rad=6+rng()*18,x=Math.cos(angle)*rad,z=Math.sin(angle)*rad,h=1+rng()*3;mesh(new THREE.CylinderGeometry(.16,.27,h,5),tubeMat,group,x,h/2,z);mesh(new THREE.SphereGeometry(.24,5,4),tipMat,group,x,h,z);}
  }

  function buildCorals(group,rng){
    const branches=[],polyps=[];
    function branch(start,direction,length,radius,depth,tint){
      const end=start.clone().addScaledVector(direction,length);branches.push({start,end,radius,tint});
      if(depth===0){polyps.push({position:end,radius:.22+rng()*.22,tint});return;}
      const count=depth===3?3:2;
      for(let k=0;k<count;k++){
        const spread=(k-(count-1)/2)*(.5+rng()*.2),twist=(rng()-.5)*.35;
        const next=direction.clone().applyAxisAngle(new THREE.Vector3(0,0,1),spread).applyAxisAngle(new THREE.Vector3(0,1,0),twist);next.y=Math.max(.22,next.y);next.normalize();
        branch(end,next,length*(.59+rng()*.15),radius*.63,depth-1,tint);
      }
    }
    for(let i=0;i<11;i++){
      const angle=rng()*6.28,radius=3+rng()*14,root=new THREE.Vector3(Math.cos(angle)*radius,.3,Math.sin(angle)*radius);
      const direction=new THREE.Vector3((rng()-.5)*.35,1,(rng()-.5)*.18).normalize();
      branch(root,direction,4+rng()*7,.4+rng()*.22,3,rng());
    }
    const stemMat=material(0xffffff,{roughness:.87,metalness:0});
    const stems=new THREE.InstancedMesh(new THREE.CylinderGeometry(.7,1,1,7),stemMat,branches.length);stems.castShadow=true;stems.receiveShadow=true;
    const transform=new THREE.Object3D(),axis=new THREE.Vector3(0,1,0),direction=new THREE.Vector3(),color=new THREE.Color(),aColor=new THREE.Color(0x92b4b3),bColor=new THREE.Color(0xd6c5ad);
    branches.forEach((item,i)=>{direction.subVectors(item.end,item.start);transform.position.copy(item.start).add(item.end).multiplyScalar(.5);transform.quaternion.setFromUnitVectors(axis,direction.clone().normalize());transform.scale.set(item.radius,direction.length(),item.radius);transform.updateMatrix();stems.setMatrixAt(i,transform.matrix);color.copy(aColor).lerp(bColor,item.tint);stems.setColorAt(i,color);});group.add(stems);
    const buds=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),material(0xe2d8bf,{roughness:.78,metalness:0}),polyps.length);buds.castShadow=true;
    polyps.forEach((item,i)=>{transform.position.copy(item.position);transform.quaternion.identity();transform.scale.setScalar(item.radius);transform.updateMatrix();buds.setMatrixAt(i,transform.matrix);});group.add(buds);
    const spongeMat=material(0xb4c7b4,{roughness:.92,metalness:0});
    for(let i=0;i<7;i++){
      const h=3+rng()*4,geo=new THREE.CylinderGeometry(1.1,1.6,h,12,6,true),positions=geo.attributes.position;
      for(let j=0;j<positions.count;j++){const y=positions.getY(j),angle=Math.atan2(positions.getZ(j),positions.getX(j)),bulge=1+.1*Math.sin(angle*5+y);positions.setX(j,positions.getX(j)*bulge);positions.setZ(j,positions.getZ(j)*bulge);}
      geo.computeVertexNormals();const sponge=mesh(geo,spongeMat,group,(rng()-.5)*27,h/2,(rng()-.5)*25);sponge.rotation.z=(rng()-.5)*.2;
    }
  }

  function buildLander(group){
    const metal=material(0x87a5ac,{metalness:.65,roughness:.45}),yellow=material(0xe0b652),dark=material(0x1c353f);
    for(const x of [-7,7])for(const z of [-7,7]){
      segment(new THREE.Vector3(x,0,z),new THREE.Vector3(x*.7,11,z*.7),.55,metal,group);
      mesh(new THREE.BoxGeometry(4,.7,4),dark,group,x,.4,z);
    }
    mesh(new THREE.BoxGeometry(13,2,13),yellow,group,0,10,0);
    mesh(new THREE.BoxGeometry(8,5,8),dark,group,0,5,0);
    for(let i=0;i<5;i++)mesh(new THREE.CylinderGeometry(.9,.9,5,8),metal,group,-4+i*2,7,-5.5);
    segment(new THREE.Vector3(0,11,0),new THREE.Vector3(0,23,0),.35,metal,group);
    mesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial({color:0x5debd6}),group,0,23,0);
  }
  function buildRidge(group,rng){
    const rock=material(mission?.terrain==='canyon'?0x819292:0x39464a,{roughness:1,metalness:0});
    for(let i=0;i<5;i++){
      const slab=mesh(new THREE.IcosahedronGeometry(3+rng()*4,2),rock,group,(rng()-.5)*22,1.4,(rng()-.5)*18);slab.scale.set(1.6,.23,1);slab.rotation.y=rng()*3;
    }
    const marker=material(0x9ea8a0,{metalness:.45,roughness:.6});
    segment(new THREE.Vector3(0,0,0),new THREE.Vector3(0,6,0),.18,marker,group);mesh(new THREE.SphereGeometry(.45,8,6),new THREE.MeshBasicMaterial({color:0xa8d2bc}),group,0,6,0);
  }

  function buildWreck(group){
    const rust=material(0x647477,{roughness:.98});
    mesh(new THREE.BoxGeometry(32,1,13),rust,group,0,1,0);
    for(let x=-14;x<=14;x+=4){
      const arch=new THREE.Mesh(new THREE.TorusGeometry(6,.4,5,12,Math.PI),rust);arch.rotation.y=Math.PI/2;arch.rotation.z=Math.PI/2;arch.position.set(x,1,0);group.add(arch);
    }
    segment(new THREE.Vector3(-10,1,0),new THREE.Vector3(-8,14,3),.6,rust,group);
  }
  function buildSampling(group,entity){const equipment=createSamplingEquipment({type:entity.appearance||'water-sampler'});group.add(equipment);samplingEquipment.set(entity.id,equipment);}
  function setSamplingProgress({entityId,progress}={}){if(typeof entityId!=='string'||!Number.isFinite(progress))throw new TypeError('采水动作需要实体与 0–1 进度');const equipment=samplingEquipment.get(entityId);if(!equipment?.userData.setSamplingProgress)return false;equipment.userData.setSamplingProgress(clamp(progress,0,1));return true;}
  function getLearningState(){return learningWorld.getState();}
  function setLearningStep(value){learningWorld.setStep(value);if(directorActive){applyDirectorCamera();updateLearningLabels();}}
  function setEquipmentDemoTime(value){learningWorld.setDemoTime(value);}
  function buildRecoveryBeacon(group){
    const alloy=material(0x93b0ae,{roughness:.5,metalness:.45}),yellow=material(0xc7a34b),dark=material(0x243f45);
    for(let i=0;i<3;i++){const a=i*2.094;segment(new THREE.Vector3(Math.cos(a)*7,0,Math.sin(a)*7),new THREE.Vector3(0,12,0),.5,alloy,group);mesh(new THREE.BoxGeometry(3,.6,3),dark,group,Math.cos(a)*7,.3,Math.sin(a)*7);}
    mesh(new THREE.CylinderGeometry(3,3,8,18),yellow,group,0,12,0);segment(new THREE.Vector3(0,15,0),new THREE.Vector3(0,29,0),.32,alloy,group);mesh(new THREE.SphereGeometry(1.2,12,8),material(0x88dfcf,{emissive:0x4bafa2,emissiveIntensity:1.2}),group,0,29,0);
    const ring=mesh(new THREE.TorusGeometry(4,.5,7,24),alloy,group,0,17,0);ring.rotation.x=Math.PI/2;
  }

  function createStation(entity,index,rng){
    const group=new THREE.Group();group.position.copy(toWorld(entity.position));group.scale.setScalar(entity.kind==='vent'?1.25:entity.kind==='coral'?.85:.75);group.userData.entityId=entity.id;propGroup.add(group);
    entityRoots.set(entity.id,group);
    if(entity.kind==='vent')buildChimneys(group,rng);
    else if(['tube-worms','sponges'].includes(entity.appearance)){
      const groundHeight=(x,z)=>(heightAt(group.position.x+x*group.scale.x,group.position.z+z*group.scale.z)-group.position.y)/group.scale.y;
      group.add((entity.appearance==='tube-worms'?createVentLife:createSpongeColony)({random:rng,groundHeight}));
    }
    else if(entity.kind==='coral')buildCorals(group,rng);
    else if(entity.appearance==='recovery-beacon')buildRecoveryBeacon(group);
    else if(entity.kind==='lander')buildLander(group);
    else if(entity.kind==='wreck')buildWreck(group);
    else if(entity.kind==='sampling')buildSampling(group,entity);
    else buildRidge(group,rng);
    group.traverse(object=>{if(object.isMesh){object.userData.entityId=entity.id;pickables.push(object);}});
    const marker=mesh(new THREE.RingGeometry(7,7.35,36),new THREE.MeshBasicMaterial({color:0x6bd0d2,transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false}),propGroup);
    marker.rotation.x=-Math.PI/2;marker.position.copy(group.position);marker.position.y+=.8;
    const label=document.createElement('button');label.type='button';label.className='ocean-station-label';
    label.setAttribute('aria-label',`查看${entity.label}`);label.setAttribute('aria-pressed','false');
    Object.assign(label.style,{position:'absolute',left:'0',top:'0',transform:'translate(-50%,-100%)',pointerEvents:'auto',border:'1px solid transparent',borderRadius:'3px',padding:'3px 5px',background:'rgba(8,25,30,.23)',color:'#dce5d6',font:'11px/1.45 ui-sans-serif,system-ui,sans-serif',whiteSpace:'nowrap',cursor:'pointer',boxShadow:'none',textShadow:'0 1px 3px #07151b,0 0 5px #07151b',transition:'background .18s,border-color .18s,color .18s',maxWidth:'180px',overflow:'hidden',textOverflow:'ellipsis'});
    const number=document.createElement('span');number.textContent=String(index+1).padStart(2,'0');Object.assign(number.style,{color:'#6be4d8',fontSize:'9px',marginRight:'7px',fontFamily:'monospace'});
    label.append(number,document.createTextNode(entity.label));
    label.addEventListener('click',e=>{e.stopPropagation();onSelect(entity.id);});
    label.addEventListener('pointerdown',e=>e.stopPropagation());
    overlay.append(label);
    const labelPosition=group.position.clone();labelPosition.y+=(entity.kind==='vent'?47:entity.kind==='ridge'?12:22)*group.scale.y;
    stationLabels.push({entity,button:label,position:labelPosition,marker});
  }

  function buildRoute(data){
    completeRoute=[];
    const adaptRouteMaterial=mat=>{
      const uniforms={uRouteDive:{value:0},uRouteFocus:{value:new THREE.Vector3()}};routeUniforms.push(uniforms);
      mat.depthWrite=false;
      mat.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms);
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRoutePosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRoutePosition = position;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRoutePosition;uniform float uRouteDive;uniform vec3 uRouteFocus;').replace('#include <fog_fragment>','#include <fog_fragment>\nfloat localRoute=1.0-smoothstep(25.0,95.0,distance(vRoutePosition,uRouteFocus));gl_FragColor.a*=mix(1.0,localRoute*.7,uRouteDive);');
      };
      mat.customProgramCacheKey=()=> 'observation-route-v1';return mat;
    };
    const frames=data.frames?.length ? data.frames : data.events.map(e=>({time:e.time,position:data.entities.find(p=>p.id===e.entityId).position}));
    for(let i=0;i<frames.length-1;i++){
      const a=frames[i],b=frames[i+1];
      for(let n=0;n<22;n++){
        const t=n/22,pos=[a.position[0]+(b.position[0]-a.position[0])*t,a.position[1]+(b.position[1]-a.position[1])*t];
        completeRoute.push({time:a.time+(b.time-a.time)*t,point:toWorld(pos,9)});
      }
    }
    if(frames.length)completeRoute.push({time:frames.at(-1).time,point:toWorld(frames.at(-1).position,9)});
    const routeGeometry=new THREE.BufferGeometry().setFromPoints(completeRoute.map(p=>p.point));
    const route=new THREE.Line(routeGeometry,adaptRouteMaterial(new THREE.LineDashedMaterial({color:0x9cbdc1,transparent:true,opacity:.6,dashSize:5,gapSize:6})));route.computeLineDistances();routeGroup.add(route);
    const activeGeometry=new THREE.BufferGeometry();activeGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array((completeRoute.length+3)*3),3));activeGeometry.setDrawRange(0,0);
    activeRoute=new THREE.Line(activeGeometry,adaptRouteMaterial(new THREE.LineBasicMaterial({color:0xffdc96,transparent:true,opacity:1,depthTest:false})));activeRoute.renderOrder=4;routeGroup.add(activeRoute);
  }

  function buildAmbient(data){
    const rng=randomFrom((data.seed || 1)+424);
    const count=reducedMotion?75:210,positions=new Float32Array(count*3);
    for(let i=0;i<count;i++){positions[i*3]=(rng()-.5)*850;positions[i*3+1]=-100+rng()*380;positions[i*3+2]=(rng()-.5)*850;}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    ambientParticles=new THREE.Points(geometry,new THREE.PointsMaterial({size:1.7,map:particleTexture,color:0x8fbac4,transparent:true,opacity:.25,sizeAttenuation:true,depthWrite:false}));ambientGroup.add(ambientParticles);

  }

  function setMission(data){
    if(destroyed)return;
    environmentCueFrame=null;cueFocus=null;cueProjection=false;cueLayoutCache=null;cueLabels.clear();cueLens.clear();entityRoots.clear();environmentCues?.group.removeFromParent();environmentCues?.destroy();environmentCues=null;
    pilotController?.destroy();pilotController=null;pilotActive=false;bodyWorld=null;cameraWorld=null;lastSafeCamera=null;lastSafeVehicle=null;cameraCut=true;pilotRecovery=null;pilotRecoveryDelta.set(0,0,0);
    mission=data;currentView=null;telemetry=null;selectedEntityId=null;ready=false;selectionLight.visible=false;needsInitialPose=true;userAdjustedCamera=false;cameraDirty=false;
    directorActive=false;directorFrame=null;directorEntry=null;lastDirectorVisualTime=null;controls.enabled=true;canvas.setAttribute('aria-label','三维海底科考场景。拖动旋转，滚轮缩放；点击科考站查看记录。');camera.fov=46;camera.clearViewOffset();camera.updateProjectionMatrix();
    learningWorld.reset();learningOverlay.style.display='none';samplingEquipment.clear();
    for(const group of [seabedGroup,routeGroup,propGroup,effectsGroup,vehicleGroup,ambientGroup,contextGroup,overheadGroup,oceanGroup])disposeChildren(group);
    stationLabels.forEach(item=>item.button.remove());stationLabels=[];pickables=[];plumeSystems=[];propAnimations=[];propLights=[];fanRotors=[];vehicleLights=[];routeUniforms=[];
    buildTerrain(data);buildVehicle();buildRoute(data);buildAmbient(data);
    const rng=randomFrom((data.seed || 1)+71);data.entities.forEach((entity,i)=>createStation(entity,i,rng));
    contextAdapter=createSeabedContext({entities:data.entities,toWorld,heightAt,texture:particleTexture,random:randomFrom((data.seed||1)+808)});contextGroup.add(contextAdapter.group);
    const landing=toWorld(data.entities[0].position),surfacePosition=[landing.x-78,430,landing.z+32],vessel=createResearchVessel({position:surfacePosition});vesselAdapter=vessel;surfaceSite={position:new THREE.Vector3(...surfacePosition),anchor:vessel.anchor,deployment:vessel.deployment};overheadGroup.add(vessel.group);
    waterColumn=createWaterColumn({surface:surfacePosition,texture:particleTexture,random:rng});oceanGroup.add(waterColumn.group);overheadGroup.visible=false;
    // Per mesh/instance bounds keep the empty space between separate rocks and
    // stations navigable. Effects, labels and the water are deliberately absent.
    const colliders=[...snapshotSolidColliders(propGroup,{filter:object=>!samplingEquipment.has(object.userData.entityId)}),...snapshotSolidColliders(contextGroup)];
    // Hinged lids and the trigger travel <2 world units from this snapshot.
    // Pad each sampler part, retaining the space between separate stations.
    for(const equipment of samplingEquipment.values())colliders.push(...snapshotSolidColliders(equipment,{padding:2}));
    // Include the rotating radar's full reach even while the vessel is hidden
    // in the deep-water view. These are conservative, per-mesh solid bounds.
    const boatVisible=overheadGroup.visible;overheadGroup.visible=true;
    colliders.push(...snapshotSolidColliders(overheadGroup,{padding:6}));overheadGroup.visible=boatVisible;
    const terrainGeometries=[];seabedGroup.traverse(o=>{if(o.isMesh&&o.geometry.attributes.position.count<100000)terrainGeometries.push({positions:o.geometry.attributes.position.array,index:o.geometry.index?.array});});
    bodyWorld=createCollisionWorld({heightAt,bounds:{minX:-580,maxX:580,minZ:-580,maxZ:580},ceiling:414,colliders});
    scriptedWorld=createCollisionWorld({heightAt,bounds:{minX:-580,maxX:580,minZ:-580,maxZ:580},ceiling:480,colliders});scriptedCutPending=true;
    cameraWorld=createCollisionWorld({heightAt,bounds:{minX:-1900,maxX:1900,minZ:-1900,maxZ:1900},ceiling:1800,colliders,terrainGeometries});
    const first=data.frames?.[0] || {position:data.entities[0].position,depth:data.baseDepth};
    rover.position.copy(vehicleLocation(first));previousRoverPosition.copy(rover.position);
    const terrainMeshes=[];seabedGroup.traverse(object=>{if(object.isMesh)terrainMeshes.push(object);});
    environmentCues=createEnvironmentCues({heightAt,toWorld,entities:data.entities,missionId:data.id,texture:particleTexture,terrainMeshes});scene.add(environmentCues.group);
    const initial=bodyWorld.resolveRestoredPose({position:rover.position,heading:0},ROV_COLLISION_PROFILE,{centreBounds,maxPushout:64});
    if(!initial.valid)throw new Error('无法找到安全的潜器起点');
    rover.position.copy(initial.position);lastSafeVehicle={position:{...initial.position},heading:initial.heading};
    pilotController=createPilotController({bounds:{minX:-580,maxX:580,minZ:-580,maxZ:580},minClearance:18,ceiling:414,heightAt,bodyRadius:ROV_BODY_RADIUS,terrainEnvelope:({x,z,heading})=>bodyWorld.minimumYAt(x,z,heading,ROV_COLLISION_PROFILE),isPoseBlocked:pose=>bodyWorld.isBlockedBySolids(pose,ROV_COLLISION_PROFILE),startPose:{position:{...initial.position},heading:initial.heading}});
    pilotController.setEnabled(false);
    telemetry=first;setCamera('overview');applyVisibility();
  }

  function applyVisibility(){
    // The authored film always shows the complete work site. Keep the user's
    // free-exploration choices intact so leaving the film restores them.
    const learning=directorActive&&learningWorld.isActive();
    routeGroup.visible=!learning&&(directorActive||visibility.route);
    seabedGroup.visible=!learning&&(directorActive||visibility.terrain);
    effectsGroup.visible=!learning&&(directorActive||visibility.plumes);
    ambientGroup.visible=!learning&&(directorActive||visibility.plumes);
    propGroup.visible=!learning;vehicleGroup.visible=!learning;oceanGroup.visible=!learning;groundPlane.visible=!learning;
    if(learning)overheadGroup.visible=false;
    if(contextAdapter)contextAdapter.dust.visible=directorActive||visibility.plumes;contextGroup.visible=!learning&&(directorActive||visibility.terrain);
    selectionLight.visible=!learning&&Boolean(currentView?.activeEntity);
    overlay.style.display=visibility.labels&&!directorActive?'block':'none';
    contextOverlay.style.display=contextLabelsEnabled&&!learning?'block':'none';learningOverlay.style.display=learning?'block':'none';
  }
  function update(view,nextTelemetry){
    if(destroyed || !mission)return;
    if(!view.state?.playing&&view.state?.time!==currentView?.state?.time&&!directorActive)scriptedCutPending=true;
    currentView=view;telemetry=nextTelemetry || telemetry;
    if(needsInitialPose&&telemetry&&rover){rover.position.copy(vehicleLocation(telemetry));previousRoverPosition.copy(rover.position);needsInitialPose=false;}
    selectedEntityId=view.activeEntity?.id || null;
    selectionLight.visible=Boolean(view.activeEntity);
    if(view.activeEntity){selectionLight.position.copy(toWorld(view.activeEntity.position,46));selectionLight.position.x-=18;selectionLight.position.z+=16;}
    if(view.state?.visibleLayers){visibility.route=view.state.visibleLayers.route;visibility.labels=view.state.visibleLayers.labels;applyVisibility();}
    for(const item of stationLabels){
      const active=item.entity.id===selectedEntityId;
      item.button.setAttribute('aria-pressed',String(active));
      item.button.style.background=active?'rgba(24,55,57,.92)':'rgba(8,25,30,.23)';
      item.button.style.borderColor=active?'#d9c290':'transparent';
      item.button.style.color=active?'#fff3d7':'#dce5d6';item.button.style.zIndex=active?'4':'1';
      item.marker.material.opacity=active?.25:.08;item.marker.material.color.set(active?0xffdda0:0xb3c8b9);
    }
    if(activeRoute){
      const points=completeRoute.filter(p=>p.time<=view.state.time).map(p=>p.point);
      if(telemetry?.position)points.push(toWorld(telemetry.position,9));
      const attribute=activeRoute.geometry.attributes.position;
      points.forEach((point,i)=>attribute.setXYZ(i,point.x,point.y,point.z));attribute.needsUpdate=true;activeRoute.geometry.setDrawRange(0,points.length);activeRoute.geometry.computeBoundingSphere();
    }
  }
  function setLayer(name,visible){if(!(name in visibility))return;visibility[name]=Boolean(visible);applyVisibility();}
  function setPresentation(mode){if(!['survey','dive'].includes(mode))throw new TypeError('呈现模式须为 survey 或 dive');presentation=mode;terrainAdapter?.setPresentation(mode,camera.position.distanceTo(controls.target));}
  function setContextLabels(enabled){contextLabelsEnabled=Boolean(enabled);contextOverlay.style.display=contextLabelsEnabled&&!learningWorld.isActive()?'block':'none';}
  function setDirectorEnabled(enabled){
    cameraCut=true;
    if(enabled)setEnvironmentCue(null);
    if(enabled&&pilotActive)setPilotEnabled(false);
    enabled=Boolean(enabled);if(enabled===directorActive)return;
    canvas.setAttribute('aria-label',enabled?'三维科考导演画面；使用下方播放、章节和镜头控制':'三维海底科考场景。拖动旋转，滚轮缩放；点击科考站查看记录。');
    if(enabled){directorSaved={presentation,cameraMode};directorActive=true;directorFrame=null;directorEntry=null;lastDirectorVisualTime=null;transition=null;controls.enabled=false;controls.enableDamping=false;cameraDirty=false;presentation='dive';}
    else{
      directorActive=false;directorFrame=null;directorEntry=null;lastDirectorVisualTime=null;overheadGroup.visible=false;learningWorld.reset();camera.fov=46;camera.clearViewOffset();camera.updateProjectionMatrix();cameraMode='overview';controls.enabled=true;controls.enableDamping=false;setControlLimits('overview');
      if(controls.target.y>heightAt(controls.target.x,controls.target.z)+160&&currentView?.activeEntity)focusEntity(currentView.activeEntity.id,true);
      else{clearSightline(camera.position,controls.target);controls.update();}
      controls.enableDamping=true;presentation=directorSaved?.presentation||'dive';directorSaved=null;userAdjustedCamera=true;cameraDirty=true;stableCameraFrames=0;
    }
    applyVisibility();
  }
  function setDirectorFrame(frame){
    if(!frame||typeof frame.entityId!=='string'||!Number.isFinite(frame.progress)||frame.progress<0||frame.progress>1)throw new TypeError('导演镜头需要实体与 0–1 进度');
    if(!mission?.entities.some(entity=>entity.id===frame.entityId))throw new TypeError('导演镜头引用未知站点');
    if(!directorActive)setDirectorEnabled(true);
    const wasLearning=learningWorld.isActive(),key=frame.shotId||frame.id||`${frame.entityId}/${frame.framing}`;
    // A different observation station is an editorial time cut, not a filmed
    // transit through the intervening relief. Keep launch/recovery continuous;
    // changing only the lens at one station must not change the vehicle action.
    const motion=frame.motionFraming??frame.framing,stationCut=directorFrame&&directorFrame.entityId!==frame.entityId&&!['establish','establishing','departure'].includes(motion);
    if(frame.jump||stationCut){directorEntry=null;cameraCut=true;scriptedCutPending=true;}
    else if(directorFrame?.key!==key)directorEntry={position:camera.position.clone(),target:controls.target.clone(),fov:camera.fov};
    directorFrame={...frame,key,framing:frame.framing==='establish'?'establishing':frame.framing||'approach',duration:Number.isFinite(frame.duration)&&frame.duration>0?frame.duration:12};
    learningWorld.update(directorFrame);if(wasLearning!==learningWorld.isActive()){directorEntry=null;cameraCut=true;scriptedCutPending=true;}applyVisibility();
    applyDirectorCamera();
  }
  function applyDirectorCamera(){
    if(!directorActive||!directorFrame||!surfaceSite)return;
    if(learningWorld.isActive()){
      const planned=learningWorld.cameraFrame(camera.aspect);camera.position.copy(planned.position);controls.target.copy(planned.target);camera.lookAt(planned.target);camera.fov=planned.fov;
      camera.setViewOffset(width,height,width>=700?140:0,height*(width>=700?.105:.055),width,height);camera.updateProjectionMatrix();overheadGroup.visible=false;cameraMode='overview';return;
    }
    const entity=mission.entities.find(item=>item.id===directorFrame.entityId);if(!entity)return;
    const subject=toWorld(entity.position),vehicle=rover.position.clone();
    const argumentsForShot={framing:directorFrame.framing,progress:directorFrame.progress,subject:subject.toArray(),vehicle:vehicle.toArray(),surface:surfaceSite.position.toArray(),aspect:camera.aspect,isVent:entity.kind==='vent',entityKind:entity.kind};
    const planned={...planExpeditionShot(argumentsForShot)},position=new THREE.Vector3(...planned.position),target=new THREE.Vector3(...planned.target);
    const landscapeView=mission.terrain==='canyon'&&['c-wall','c-channel','c-sand'].includes(entity.id)&&!['establishing','departure','detail','compare'].includes(directorFrame.framing)?terrainAdapter?.getStationView(entity.id):null;
    if(landscapeView){position.fromArray(landscapeView.position);target.fromArray(landscapeView.target);const offset=position.clone().sub(target).applyAxisAngle(new THREE.Vector3(0,1,0),(directorFrame.progress-.5)*.14);position.copy(target).add(offset);planned.fov=landscapeView.fov;}
    const samplingCompare=entity.kind==='sampling'&&directorFrame.framing==='compare';
    const samplerCenter=subject.clone().add(new THREE.Vector3(0,4.5,0)),samplerBase=subject.clone().add(new THREE.Vector3(0,1.7,0));
    if(samplingCompare){
      const canonicalVehicle=vehicleLocation({position:entity.position,depth:entity.depth}),ending=planExpeditionShot({...argumentsForShot,progress:1,vehicle:canonicalVehicle.toArray()}),endTarget=new THREE.Vector3(...ending.target),endOffset=new THREE.Vector3(...ending.position).sub(endTarget),axis=new THREE.Vector3(0,1,0);
      const candidates=[0,.55,-.55,1.1,-1.1,Math.PI].map((angle,index)=>{
        const raw=endTarget.clone().add(endOffset.clone().applyAxisAngle(axis,angle)),safe=ensureVisiblePoints(raw.clone(),[samplerBase,samplerCenter]);
        return {angle,score:(safe.y-raw.y)*2+index*.7};
      });candidates.sort((a,b)=>a.score-b.score);
      position.sub(target).applyAxisAngle(axis,candidates[0].angle).add(target);ensureVisiblePoints(position,[samplerBase,samplerCenter]);
    }
    const incoming=Math.min(1,directorFrame.progress*directorFrame.duration/1.25),blend=incoming*incoming*(3-2*incoming);
    if(directorEntry&&incoming<1){position.lerpVectors(directorEntry.position,position,blend);target.lerpVectors(directorEntry.target,target,blend);position.y+=Math.sin(blend*Math.PI)*Math.min(65,directorEntry.position.distanceTo(position)*.1);}
    clearSightline(position,target);if(samplingCompare)ensureVisiblePoints(position,[samplerBase,samplerCenter]);camera.position.copy(position);controls.target.copy(target);camera.lookAt(target);camera.fov=directorEntry&&incoming<1?THREE.MathUtils.lerp(directorEntry.fov,planned.fov,blend):planned.fov;
    // Reserve the lower quarter for captions; move the optic axis upward
    // instead of lifting the subject or distorting the world geometry.
    const mobileSampling=width<600&&['sample-near','sample-far'].includes(directorFrame.learning);
    camera.setViewOffset(width,height,width>=700&&directorFrame.learning==='mission'?140:0,height*(mobileSampling?.025:width<600?.14:.10),width,height);camera.updateProjectionMatrix();
    overheadGroup.visible=['establishing','departure'].includes(directorFrame.framing)&&camera.position.y>surfaceSite.position.y-80;cameraMode='overview';
  }
  function updateContextLabels(){
    for(const element of Object.values(contextNodes))element.style.display='none';if(!contextLabelsEnabled||!mission||!rover||learningWorld.isActive())return;
    const entity=mission.entities.find(item=>item.id===(directorFrame?.entityId||selectedEntityId));
    const used=directorActive?[]:[{x:0,y:0,w:Math.min(310,width*.8),h:210}],bottomSafe=height-(directorActive?(width<600?260:230):205);
    if(directorActive)used.push({x:width-230,y:70,w:230,h:200});
    const place=(name,text,point)=>{const projected=point.clone().project(camera);if(projected.z<-1||projected.z>1)return;const x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height;if(x<10||x>width-10||y<95||y>bottomSafe)return;const element=contextNodes[name];element.textContent=text;element.style.display='block';const box=element.getBoundingClientRect(),w=box.width||150,h=box.height||29;
      for(const [dx,dy] of [[0,0],[60,-22],[-60,-22],[0,30]]){const r={x:clamp(x+dx,w/2+12,width-w/2-12)-w/2,y:y+dy-h,w,h};if(r.y<95||r.y+h>bottomSafe||used.some(b=>r.x<b.x+b.w+8&&r.x+w+8>b.x&&r.y<b.y+b.h+8&&r.y+h+8>b.y))continue;element.style.left=`${r.x+w/2}px`;element.style.top=`${r.y+h}px`;used.push(r);return;}element.style.display='none';};
    if(overheadGroup.visible&&surfaceSite){place('vessel','水面科考母船 · 布放与回收',surfaceSite.position.clone().add(new THREE.Vector3(0,42,0)));const mid=rover.position.clone().lerp(surfaceSite.anchor,.63);place('tether','脐带缆 · 供电与通信',mid);}
    if(camera.position.distanceTo(rover.position)<500&&!terrainOccludes(rover.position))place('vehicle','ROV · 相机、灯光与采样臂',rover.position.clone().add(new THREE.Vector3(0,16,0)));
    if(entity){const type=entity.kind==='vent'?'矿物烟囱 · 热液羽流':entity.appearance==='tube-worms'?'管虫群落 · 喷口外缘':entity.appearance==='sponges'?'杯状海绵 · 峡谷生态':entity.appearance==='recovery-beacon'?'回收信标 · 返航定位':entity.kind==='coral'?'冷水珊瑚 · 枝状群落':entity.appearance==='sediment-corer'?'沉积取样器 · 背景对照':entity.kind==='sampling'?'水体采样架 · 记录环境':entity.kind==='lander'?'近底平台 · 航次基准站':mission.terrain==='canyon'?'峡谷岩壁 · 层状台阶':'玄武岩裂隙 · 火山地形';place('subject',type,toWorld(entity.position,entity.kind==='vent'?53:23));}
  }
  function updateLearningLabels(){
    for(const node of learningNodes.values())node.style.display='none';if(!directorActive||!learningWorld.isActive())return;
    const occupied=[],phone=width<700,topSafe=phone?238:98,bottomSafe=height-(phone?228:222),rightSafe=phone?width-8:width-282;
    for(const label of [...learningWorld.getLabels()].reverse()){
      let node=learningNodes.get(label.id);if(!node){node=document.createElement('span');Object.assign(node.style,{position:'absolute',padding:'4px 7px',borderLeft:'2px solid #c8bd8a',background:'#0b2630e8',color:'#edf0d9',font:`${phone?10:11}px/1.5 ui-sans-serif,system-ui,sans-serif`,borderRadius:'2px',whiteSpace:'nowrap',boxShadow:'0 2px 9px #02121b30'});learningOverlay.append(node);learningNodes.set(label.id,node);}node.textContent=label.text;
      const point=label.position.clone().project(camera);if(point.z<-1||point.z>1)continue;const x=(point.x*.5+.5)*width,y=(-point.y*.5+.5)*height;node.style.display='block';const box=node.getBoundingClientRect(),w=box.width||130,h=box.height||27;
      let placed=false;for(const [dx,dy] of [[0,-10],[0,14],[-28,-24],[28,-24],[0,38]]){const r={x:clamp(x+dx-w/2,8,Math.max(8,rightSafe-w)),y:y+dy-h,w,h};if(r.y<topSafe||r.y+h>bottomSafe||occupied.some(b=>r.x<b.x+b.w+5&&r.x+w+5>b.x&&r.y<b.y+b.h+4&&r.y+h+4>b.y))continue;node.style.left=`${r.x}px`;node.style.top=`${r.y}px`;occupied.push(r);placed=true;break;}if(!placed)node.style.display='none';
    }
  }
  function getPilotState(){
    if(!pilotController)return {enabled:false,camera:pilotCamera};
    const state=pilotController.getState(),nearest=mission?.entities.map(entity=>({id:entity.id,label:entity.label,distance:Math.hypot(state.position.x-(entity.position[0]-.5)*SIZE,state.position.z-(entity.position[1]-.5)*SIZE,state.position.y-heightAt((entity.position[0]-.5)*SIZE,(entity.position[1]-.5)*SIZE))})).sort((a,b)=>a.distance-b.distance)[0];
    const distance=camera.position.distanceTo(rover.position),remote=Boolean(cueFocus?.active)||pilotCamera==='orbit'&&(distance>170||controls.target.distanceTo(rover.position)>95);
    return {...state,enabled:pilotActive,camera:pilotCamera,nearest,bodyRadius:ROV_BODY_RADIUS,recovery:pilotRecovery,viewpoint:{mode:remote?'remote':'vehicle',subjectLabel:cueFocus?.active?cueFocus.label:'自由镜头观察区',cameraDistance:Math.round(distance),canRestore:Boolean(cueFocus?.saved),returnsOnDrive:Boolean(cueFocus?.active),vehiclePhase:getEnvironmentState().vehicle.phase}};
  }
  function setEnvironmentCue(frame){
    if(directorActive||!pilotActive||!frame){environmentCueFrame=null;environmentCues?.setCue(null);cueLabels.clear();cueLens.clear();selectionLight.intensity=460;if(currentView?.activeEntity){selectionLight.position.copy(toWorld(currentView.activeEntity.position,46));selectionLight.position.x-=18;selectionLight.position.z+=16;}overlay.style.opacity='1';contextOverlay.style.opacity='1';return;}
    const changed=environmentCueFrame?.id!==frame.id;environmentCueFrame=frame;environmentCues?.setCue(frame);cueLabels.setCue(frame);overlay.style.opacity='.38';contextOverlay.style.opacity='.28';if(changed)cueLabelRefresh=0;
  }
  function getCueLayout(force=false){
    const now=performance.now();if(!force&&cueLayoutCache&&now-cueLayoutCache.time<140)return cueLayoutCache.layout;
    const base=container.getBoundingClientRect(),occupied=[];
    for(const selector of ['#environment-guide','#pilot-console','.scene-toolbar','.environment-cue-lens']){const node=document.querySelector(selector);if(!node||node.hidden||!node.getClientRects().length)continue;const r=node.getBoundingClientRect();occupied.push({x:r.x-base.x,y:r.y-base.y,w:r.width,h:r.height});}
    const layout=computeCueLayout({width,height,occupied});cueLayoutCache={time:now,layout};return layout;
  }
  function getEnvironmentCueStatus(){return {id:environmentCueFrame?.id||null,kind:environmentCueFrame?.kind||null,elapsed:environmentCueFrame?.elapsed||0,targets:cueLabels.getStatus(),focus:{active:Boolean(cueFocus?.active),canRestore:Boolean(cueFocus?.saved),label:cueFocus?.label||''},viewpoint:getPilotState().viewpoint,observation:cueLens.getStatus()};}
  function dismissCueFocus(){if(cueFocus)cueFocus.active=false;}
  function focusEnvironmentCue(){
    if(!pilotActive||!environmentCueFrame||!environmentCues)return {ok:false,reason:'请先选择一段环境讲解。'};
    const layout=getCueLayout(true);camera.updateMatrixWorld(true);environmentCues.update({elapsed:environmentCueFrame.elapsed,viewerPosition:rover.position,camera,focusRegions:layout.regions});
    const targets=environmentCues.getTargets(),primary=targets.find(t=>t.primary)||targets[0];if(!primary)return {ok:false,reason:'当前视线内没有这个对象，可换个方向再查看。'};
    const point=(primary.focusPosition||primary.position).clone(),normal=(primary.normal||primary.surfaceNormal)?.clone?.(),kind=primary.kind||environmentCueFrame.kind;
    const saved=cueFocus?.saved||{position:camera.position.clone(),target:controls.target.clone(),rover:rover.position.clone(),mode:pilotCamera,fov:camera.fov,projection:cueProjection};
    const direction=normal||camera.position.clone().sub(point).normalize(),candidates=[],meshes=[];seabedGroup.traverse(o=>{if(o.isMesh)meshes.push(o);});const ray=new THREE.Raycaster();
    const fieldOfView=kind==='biology'?(width<=520?60:48):54,region=layout.focus,tangent=Math.tan(THREE.MathUtils.degToRad(fieldOfView/2));
    const fit=kind==='biology'?Math.max(64,(primary.focusHalfSize||22)*1.12/Math.max(.035,Math.min(tangent*camera.aspect*region.w/width,tangent*region.h/height))):52;
    for(const reach of [fit,fit*1.2,fit*1.5,Math.max(165,fit*1.8)])for(const angle of [0,.55,-.55,1.1,-1.1,Math.PI]){
      const offset=direction.clone().applyAxisAngle(new THREE.Vector3(0,1,0),angle);offset.y=Math.max(offset.y,kind==='wall'?.12:.42);offset.normalize().multiplyScalar(reach);
      const requested=point.clone().add(offset),safe=cameraWorld.resolveRestoredPose({position:requested,heading:0},cameraProfile,{maxPushout:12,maxLocalLift:12});if(!safe.valid)continue;
      const position=new THREE.Vector3().copy(safe.position),toward=point.clone().sub(position),distance=toward.length();if(distance<24||distance>520)continue;
      ray.set(position,toward.normalize());ray.far=Math.max(0,distance-.8);if(ray.intersectObjects(meshes,false).length)continue;
      const h=-rover.rotation.y,c=Math.cos(h),s=Math.sin(h),dx=position.x-rover.position.x,dz=position.z-rover.position.z;
      if(vehicleCameraWorld.isBlockedBySolids({position:{x:c*dx+s*dz,y:position.y-rover.position.y,z:-s*dx+c*dz},heading:0},cameraProfile))continue;
      candidates.push({position,score:Math.abs(angle)*25+position.distanceTo(requested)*2+Math.abs(reach-64)*.3});
    }
    candidates.sort((a,b)=>a.score-b.score);if(!candidates.length)return {ok:false,reason:'这里没有安全的近景视角，请先稍微转动镜头。'};
    setPilotCamera('orbit');cueFocus={active:true,saved,label:primary.label};cueProjection=true;transition=null;controls.enableDamping=false;
    camera.fov=fieldOfView;camera.position.copy(candidates[0].position);controls.target.copy(point);controls.update();cameraCut=true;applyPilotCamera();protectCamera();controls.enableDamping=true;cameraDirty=true;stableCameraFrames=0;
    return {ok:true,label:primary.label};
  }
  function restoreEnvironmentCueCamera(){
    if(!pilotActive||!cueFocus?.saved)return {ok:false,reason:'还没有需要恢复的镜头。'};
    const saved=cueFocus.saved,shift=saved.mode==='chase'?rover.position.clone().sub(saved.rover):new THREE.Vector3();cueFocus=null;cueProjection=saved.projection;
    setPilotCamera(saved.mode);if(saved.mode!=='cockpit'){controls.enableDamping=false;camera.position.copy(saved.position).add(shift);controls.target.copy(saved.target).add(shift);camera.fov=saved.fov;controls.update();cameraCut=true;applyPilotCamera();protectCamera();controls.enableDamping=true;}
    cameraDirty=true;return {ok:true};
  }
  function setPilotEnabled(enabled,{pose=null,camera:mode='chase'}={}){
    if(!pilotController||!rover)return false;
    if(enabled){
      if(directorActive)setDirectorEnabled(false);
      transition=null;learningWorld.reset();camera.clearViewOffset();presentation='dive';
      const position={x:rover.position.x,y:rover.position.y,z:rover.position.z};
      const subject=currentView?.activeEntity?toWorld(currentView.activeEntity.position):null;
      const requested=pose||{position,heading:subject?Math.atan2(subject.x-position.x,position.z-subject.z):-rover.rotation.y};
      const previous=pilotController.getState(),fallbackPose={position:{...previous.position},heading:previous.heading};
      const candidate={position:{...requested.position,y:Math.min(414,requested.position.y)},heading:requested.heading};
      let safe=bodyWorld.resolveRestoredPose(candidate,ROV_COLLISION_PROFILE,{centreBounds,maxPushout:64,fallbackPose});
      // The controller also keeps its centre at least 18 units above ground.
      // Recheck solids after that extra lift rather than letting setPose raise
      // a valid body underneath a prop into the prop.
      for(let pass=0;pass<3&&safe.valid;pass++){
        const minimum=heightAt(safe.position.x,safe.position.z)+18;if(safe.position.y>=minimum-1e-7)break;
        safe=bodyWorld.resolveRestoredPose({position:{...safe.position,y:minimum},heading:safe.heading},ROV_COLLISION_PROFILE,{centreBounds,maxPushout:64,fallbackPose});
      }
      if(!safe.valid)return false;
      pilotRecoveryDelta.copy(safe.position).sub(requested.position);pilotRecovery={adjusted:safe.adjusted||pilotRecoveryDelta.lengthSq()>.0001,method:safe.method};
      pilotStart={position:{...safe.position},heading:safe.heading};pilotController.setPose(pilotStart);pilotController.setEnabled(true);pilotActive=true;cameraCut=true;
      const state=pilotController.getState();rover.position.set(state.position.x,state.position.y,state.position.z);rover.rotation.y=-state.heading;previousRoverPosition.copy(rover.position);
      setPilotCamera(mode);canvas.setAttribute('aria-label','自由驾驶三维海底。W S 前后，A D 转向，Q E 横移，R F 升降，空格急停，1 2 3 切换视角。');
    }else{
      setEnvironmentCue(null);
      pilotController.setEnabled(false);pilotActive=false;cueFocus=null;cueProjection=false;controls.enabled=true;controls.enableDamping=true;cameraMode='overview';setControlLimits('overview');camera.fov=46;camera.clearViewOffset();camera.updateProjectionMatrix();
      canvas.setAttribute('aria-label','三维海底科考场景。拖动旋转，滚轮缩放；点击科考站查看记录。');
    }
    applyVisibility();return true;
  }
  function setPilotInput(input){if(pilotActive){if(Object.values(input).some(value=>value!==0)){if(cueFocus?.active)restoreEnvironmentCueCamera();else dismissCueFocus();}pilotController?.setInput(input);}}
  function stopPilot(){pilotController?.clearInput();}
  function pilotSightlineClear(position,target){
    const distance=position.distanceTo(target),steps=Math.max(16,Math.ceil(distance/3));
    for(let i=1;i<=steps;i++){const t=i/steps,x=target.x+(position.x-target.x)*t,z=target.z+(position.z-target.z)*t,y=target.y+(position.y-target.y)*t;if(y<heightAt(x,z)+9)return false;}return true;
  }
  function choosePilotCamera(target,heading){
    const candidates=[];
    for(const reach of [76,55,36])for(const angle of [.45,-.45,0,1.2,-1.2,1.8,-1.8,Math.PI]){
      const position=target.clone().add(new THREE.Vector3(-Math.sin(heading+angle)*reach,reach*.49,Math.cos(heading+angle)*reach));
      if(pilotSightlineClear(position,target))candidates.push({position,score:Math.abs(angle-.45)*14+(76-reach)*.5});
    }
    candidates.sort((a,b)=>a.score-b.score);return candidates[0]?.position||target.clone().add(new THREE.Vector3(0,32,2));
  }
  function clipPilotCamera(){
    // Shorten the camera boom at a cliff. Raising it above the entire cliff
    // would make the vehicle disappear into the distant haze.
    const target=controls.target,offset=camera.position.clone().sub(target),steps=Math.max(24,Math.ceil(offset.length()/3));let fraction=1;
    for(let i=1;i<=steps;i++){const t=i/steps,x=target.x+offset.x*t,z=target.z+offset.z*t;if(target.y+offset.y*t<heightAt(x,z)+9){fraction=Math.max(0,(i-1)/steps-.02);break;}}
    if(fraction<1)camera.position.copy(target).addScaledVector(offset,fraction);
    if(cameraWorld){const safe=cameraWorld.clampSweep(target,camera.position,3);if(safe.valid)camera.position.copy(safe.position);}
  }
  function protectCamera(){
    // Last write before rendering: OrbitControls, restores, cockpit and film
    // planners all pass through the same near-plane-sized swept volume.
    if(!cameraWorld)return;
    if(directorActive&&learningWorld.isActive()){lastSafeCamera=null;cameraCut=true;return;}
    const from=cameraCut||!lastSafeCamera?camera.position.clone():lastSafeCamera;
    let result=cameraWorld.clampSweep(from,camera.position,3);
    const external=rover&&!(pilotActive&&pilotCamera==='cockpit'),heading=rover?-rover.rotation.y:0,c=Math.cos(heading),s=Math.sin(heading);
    const local=p=>{const x=p.x-rover.position.x,z=p.z-rover.position.z;return {x:c*x+s*z,y:p.y-rover.position.y,z:-s*x+c*z};};
    const global=p=>({x:rover.position.x+c*p.x-s*p.z,y:rover.position.y+p.y,z:rover.position.z+s*p.x+c*p.z});
    // Independent panning must not put the external camera inside the ROV.
    // The intentional forward camera has its own clear optical mount.
    if(result.valid&&external){
      const self=vehicleCameraWorld.clampSweep(local(from),local(result.position),3);
      if(self.valid)result=cameraWorld.clampSweep(result.position,global(self.position),3);
      if(!self.valid||!result.valid||vehicleCameraWorld.isBlockedBySolids({position:local(result.position),heading:0},cameraProfile)){
        result=cameraWorld.resolveRestoredPose({position:{x:rover.position.x,y:Math.max(600,rover.position.y+40),z:rover.position.z},heading:0},cameraProfile);
      }
    }
    if(result.valid){camera.position.copy(result.position);lastSafeCamera=camera.position.clone();cameraCut=false;}
    else if(lastSafeCamera)camera.position.copy(lastSafeCamera);
    else return;
    camera.lookAt(controls.target);
  }
  function protectScriptedVehicle(dt,{cut=false}={}){
    if(!scriptedWorld||!rover||learningWorld.isActive())return;
    if(!cut&&dt<=0&&lastSafeVehicle){rover.position.copy(lastSafeVehicle.position);rover.rotation.y=-lastSafeVehicle.heading;return;}
    const desired={position:{x:rover.position.x,y:rover.position.y,z:rover.position.z},heading:-rover.rotation.y};
    // A fixed observation station should not repeat the same nearby-pose
    // search at every video frame. Moving segments still sweep every frame.
    const worlds=protectScriptedVehicle.repairs||(protectScriptedVehicle.repairs=new WeakMap());let repairs=worlds.get(scriptedWorld);if(!repairs){repairs=new Map();worlds.set(scriptedWorld,repairs);}
    const repairKey=[desired.position.x,desired.position.y,desired.position.z,desired.heading].join('/');
    let repaired=repairs.get(repairKey);if(!repaired){repaired=scriptedWorld.resolveRestoredPose(desired,ROV_COLLISION_PROFILE,{centreBounds,maxPushout:32,fallbackPose:lastSafeVehicle});if(repaired.valid&&repaired.method!=='fallback'){repairs.set(repairKey,repaired);if(repairs.size>80)repairs.delete(repairs.keys().next().value);}}
    if(!repaired.valid){if(lastSafeVehicle){rover.position.copy(lastSafeVehicle.position);rover.rotation.y=-lastSafeVehicle.heading;}return;}
    let safe=repaired;
    if(lastSafeVehicle&&!cut){
      safe=scriptedWorld.sweepBody(lastSafeVehicle,repaired,ROV_COLLISION_PROFILE);
      if(!safe.valid)safe={...lastSafeVehicle,valid:true};
      if(safe.blocked){
        // A scripted transit may climb to clear a wall, but never teleports
        // through it. Use the old heading while lifting, then retry the turn.
        const lift={position:{...safe.position,y:Math.min(480,safe.position.y+28*dt)},heading:safe.heading};
        const escape=scriptedWorld.sweepBody(safe,lift,ROV_COLLISION_PROFILE);if(escape.valid)safe=escape;
      }
    }
    rover.position.copy(safe.position);rover.rotation.y=-safe.heading;lastSafeVehicle={position:{...safe.position},heading:safe.heading};
  }
  function setPilotCamera(mode){
    if(!pilotActive||!['chase','cockpit','orbit'].includes(mode))return;
    dismissCueFocus();cueProjection=false;
    pilotCamera=mode;transition=null;cameraCut=true;pilotLook={yaw:0,pitch:-.08};camera.fov=mode==='cockpit'?68:54;camera.updateProjectionMatrix();
    controls.enabled=mode!=='cockpit';controls.enableDamping=false;controls.minDistance=23;controls.maxDistance=620;controls.maxTargetRadius=1800;controls.minPolarAngle=.06;controls.maxPolarAngle=1.77;controls.enableRotate=true;
    if(mode!=='cockpit'){
      const heading=pilotController.getState().heading,target=rover.position.clone().add(new THREE.Vector3(0,6,0));
      camera.position.copy(choosePilotCamera(target,heading));controls.target.copy(target);controls.update();controls.enableDamping=true;
    }
    previousRoverPosition.copy(rover.position);applyPilotCamera();
  }
  function resetPilot(){if(!pilotActive)return;pilotController.reset(pilotStart);const state=pilotController.getState();rover.position.set(state.position.x,state.position.y,state.position.z);rover.rotation.y=-state.heading;setPilotCamera(pilotCamera);}
  function applyPilotCamera(){
    if(!pilotActive)return;
    if(cueProjection){const region=getCueLayout().focus;camera.setViewOffset(width,height,width/2-region.x-region.w/2,height/2-region.y-region.h/2,width,height);}
    else camera.setViewOffset(width,height,width>520?Math.min(140,width*.19):0,width<=520?height*.18:0,width,height);camera.updateProjectionMatrix();
    if(pilotCamera==='cockpit'){
      const heading=pilotController.getState().heading+pilotLook.yaw;
      camera.position.copy(rover.localToWorld(new THREE.Vector3(0,8,-16)));camera.position.y=Math.max(camera.position.y,heightAt(camera.position.x,camera.position.z)+9);
      controls.target.copy(camera.position).add(new THREE.Vector3(Math.sin(heading)*Math.cos(pilotLook.pitch),Math.sin(pilotLook.pitch),-Math.cos(heading)*Math.cos(pilotLook.pitch)).multiplyScalar(100));
    }else{
      if(pilotCamera==='chase'){const shift=rover.position.clone().sub(previousRoverPosition);camera.position.add(shift);controls.target.add(shift);}
      controls.update();if(!cueProjection){controls.target.y=Math.max(controls.target.y,heightAt(controls.target.x,controls.target.z)+8);clipPilotCamera();}
    }
    camera.position.y=Math.min(camera.position.y,414);camera.lookAt(controls.target);
  }
  function getCameraState(){return {position:camera.position.toArray(),target:controls.target.toArray(),mode:cameraMode};}
  function restorePilotCameraState(state){
    validateCameraState(state);if(!pilotActive||pilotCamera==='cockpit')return false;
    const p=new THREE.Vector3(...state.position).add(pilotRecoveryDelta),t=new THREE.Vector3(...state.target).add(pilotRecoveryDelta),distance=p.distanceTo(t);
    if(distance<23||distance>620||Math.abs(t.x)>1200||Math.abs(t.z)>1200)return false;
    controls.enableDamping=false;camera.position.copy(p);controls.target.copy(t);controls.update();clipPilotCamera();cameraCut=true;protectCamera();controls.enableDamping=true;return true;
  }
  function setControlLimits(mode){
    controls.minDistance=48;controls.maxDistance=1040;controls.maxTargetRadius=650;controls.enableRotate=mode!=='top';
    controls.minPolarAngle=mode==='top'?.003:.12;controls.maxPolarAngle=mode==='top'?.012:1.16;
  }
  function restoreCameraState(state){
    validateCameraState(state);const next={position:[...state.position],target:[...state.target],mode:state.mode};
    transition=null;cameraCut=true;cameraDirty=false;stableCameraFrames=0;userAdjustedCamera=true;cameraMode=next.mode;
    controls.enableDamping=false;controls.update();setControlLimits(next.mode);
    const position=new THREE.Vector3().fromArray(next.position),target=new THREE.Vector3().fromArray(next.target),offset=position.clone().sub(target),distance=offset.length(),polar=Math.acos(clamp(offset.y/distance,-1,1));
    const unsafe=distance<48||distance>1040||Math.abs(target.x)>720||Math.abs(target.z)>720||target.y<heightAt(target.x,target.z)-2||position.y<heightAt(position.x,position.z)+25||position.y>(surfaceSite?.position.y||430)-6||(next.mode!=='top'&&polar>1.17);
    if(unsafe){
      if(currentView?.activeEntity&&next.mode!=='top')focusEntity(currentView.activeEntity.id,true);
      else setCamera(next.mode);
      if(transition){camera.position.copy(transition.position);controls.target.copy(transition.target);transition=null;}
    }else{clearSightline(position,target);camera.position.copy(position);controls.target.copy(target);}
    controls.update();controls.enableDamping=true;
    camera.fov=next.mode==='top'?(camera.aspect<.85?87:77):presentation==='survey'?(camera.aspect<.85?65:56):46;camera.updateProjectionMatrix();
    lastCameraPosition.copy(camera.position);lastCameraTarget.copy(controls.target);if(rover)previousRoverPosition.copy(rover.position);
    return getCameraState();
  }
  function clearSightline(position,target){
    const groundTarget=target.clone();groundTarget.y=Math.max(heightAt(target.x,target.z)+8,target.y);
    let required=position.y;
    for(let i=1;i<=20;i++){
      const t=i/20,x=groundTarget.x+(position.x-groundTarget.x)*t,z=groundTarget.z+(position.z-groundTarget.z)*t;
      const minimum=heightAt(x,z)+6;
      required=Math.max(required,groundTarget.y+(minimum-groundTarget.y)/t);
    }
    position.y=Math.max(required,heightAt(position.x,position.z)+28);return position;
  }
  function ensureVisiblePoints(position,points){
    let required=position.y;
    for(const point of points)for(let i=1;i<=32;i++){
      const t=i/32,x=point.x+(position.x-point.x)*t,z=point.z+(position.z-point.z)*t,minimum=heightAt(x,z)+1.35;
      required=Math.max(required,point.y+(minimum-point.y)/t);
    }
    position.y=Math.max(required,heightAt(position.x,position.z)+25);return position;
  }
  function terrainOccludes(point){
    if(!directorActive&&!visibility.terrain)return false;
    const length=camera.position.distanceTo(point),samples=Math.min(24,Math.max(9,Math.ceil(length/35)));
    for(let i=1;i<samples;i++){
      const t=i/samples,x=point.x+(camera.position.x-point.x)*t,z=point.z+(camera.position.z-point.z)*t,y=point.y+(camera.position.y-point.y)*t;
      if(heightAt(x,z)+1.4>y)return true;
    }
    return false;
  }
  function moveCamera(position,target,instant=false){
    clearSightline(position,target);
    const fromPosition=camera.position.clone(),fromTarget=controls.target.clone();
    controls.enableDamping=false;controls.update();camera.position.copy(fromPosition);controls.target.copy(fromTarget);
    if(instant||reducedMotion){cameraCut=true;camera.position.copy(position);controls.target.copy(target);controls.update();transition=null;controls.enableDamping=true;if(ready)cameraDirty=true;}
    else transition={position:position.clone(),target:target.clone(),fromPosition,fromTarget,startedAt:performance.now(),duration:820};
  }
  function setCamera(mode){
    if(pilotActive){setPilotCamera(mode==='overview'?'orbit':mode==='follow'?'chase':'orbit');return;}
    if(directorActive)return;
    if(!['overview','follow','top'].includes(mode))return;
    cameraMode=mode;userAdjustedCamera=false;setControlLimits(mode);
    const fit=Math.max(1,Math.min(1.23,.9/camera.aspect));
    camera.fov=mode==='top'?(camera.aspect<.85?87:77):mode==='overview'?(camera.aspect<.85?65:56):46;camera.updateProjectionMatrix();
    if(mode==='overview'){const pose=terrainAdapter?.getOverviewPose();moveCamera(pose?new THREE.Vector3(...pose.position):new THREE.Vector3(370*fit,Math.min(390,300*fit),540*fit),pose?new THREE.Vector3(...pose.target):new THREE.Vector3(0,-25,0),!ready);}
    if(mode==='top')moveCamera(new THREE.Vector3(0,400,3),new THREE.Vector3(0,-25,0));
    if(mode==='follow'&&rover){const target=rover.position.clone();moveCamera(target.clone().add(new THREE.Vector3(-67,65,78)),target);}
  }
  function focusEntity(id,instant=false){
    if(pilotActive)return;
    if(directorActive)return;
    if(!mission)return;const entity=mission.entities.find(e=>e.id===id);if(!entity)return;
    camera.fov=cameraMode==='top'?(camera.aspect<.85?87:77):46;camera.updateProjectionMatrix();
    userAdjustedCamera=true;
    const landscapeView=mission.terrain==='canyon'&&entity.kind==='ridge'?terrainAdapter?.getStationView(id):null;
    if(landscapeView&&cameraMode!=='top'){camera.fov=landscapeView.fov;camera.updateProjectionMatrix();moveCamera(new THREE.Vector3(...landscapeView.position),new THREE.Vector3(...landscapeView.target),instant);return;}
    const vent=entity.kind==='vent',target=toWorld(entity.position,vent?35:15);target.x+=9;target.z+=11;
    if(cameraMode==='top')moveCamera(target.clone().add(new THREE.Vector3(0,360,2)),target,instant);
    else {
      const fit=Math.max(1,.82/camera.aspect),reach=vent?.68:.60;
      const candidates=[[-140,75,15],[-150,78,55],[55,78,-140],[15,78,-140],[-100,82,108]].map((offset,index)=>{
        const raw=target.clone().add(new THREE.Vector3(...offset).multiplyScalar(fit*reach)),p=clearSightline(raw.clone(),target),rise=p.y-raw.y;
        const subject=toWorld(entity.position),direction=target.clone().sub(p).normalize(),side=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0)).normalize(),rove=vehicleLocation({position:entity.position,depth:entity.depth});
        const separation=Math.abs(side.dot(rove.clone().sub(subject))),front=subject.clone().sub(rove).setY(0).normalize(),towardCamera=p.clone().sub(rove).setY(0).normalize(),facing=front.dot(towardCamera);
        return {position:p,score:rise*.9+index*3+Math.max(0,24-separation)*2.5+Math.abs(facing-.7)*12};
      });
      candidates.sort((a,b)=>a.score-b.score);moveCamera(candidates[0].position,target,instant);
    }
  }
  function resetCamera(){setCamera('overview');}

  function resize(){
    const previousAspect=camera.aspect,rect=container.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);
    renderer.setSize(width,height,false);camera.aspect=width/height;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const ratio=Math.max(previousAspect/camera.aspect,camera.aspect/previousAspect);
    if(mission&&!directorActive&&!pilotActive&&!userAdjustedCamera&&ratio>1.35&&['overview','top'].includes(cameraMode))setCamera(cameraMode);
    if(directorActive)applyDirectorCamera();
    else if(pilotActive)applyPilotCamera();
  }
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);resize();
  const onControlStart=()=>{dismissCueFocus();transition=null;controls.enableDamping=true;userAdjustedCamera=true;cameraDirty=false;stableCameraFrames=0;};controls.addEventListener('start',onControlStart);
  const onControlEnd=()=>{cameraDirty=true;stableCameraFrames=0;};controls.addEventListener('end',onControlEnd);
  function pointerStart(event){if(directorActive)return;pointerTravel=0;pointerDown={x:event.clientX,y:event.clientY};if(pilotActive&&pilotCamera==='cockpit')canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';canvas.focus({preventScroll:true});}
  function pointerEnd(event){
    if(!pointerDown)return;const distance=Math.hypot(event.clientX-pointerDown.x,event.clientY-pointerDown.y);pointerDown=null;canvas.style.cursor='grab';
    if(distance>5||pointerTravel>5||event.button!==0)return;
    const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(pickables,false)[0];if(hit?.object.userData.entityId&&!terrainOccludes(hit.point))onSelect(hit.object.userData.entityId);
  }
  function pointerMove(event){
    if(pilotActive&&pilotCamera==='cockpit'&&pointerDown){pointerTravel+=Math.hypot(event.clientX-pointerDown.x,event.clientY-pointerDown.y);pilotLook.yaw+=(event.clientX-pointerDown.x)*.004;pilotLook.pitch=clamp(pilotLook.pitch-(event.clientY-pointerDown.y)*.003,-1.05,1.05);pointerDown={x:event.clientX,y:event.clientY};return;}
    if(directorActive){canvas.style.cursor='default';return;}
    if(pointerDown||performance.now()-lastHoverStamp<70)return;lastHoverStamp=performance.now();
    const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(pickables,false)[0];canvas.style.cursor=hit?.object.userData.entityId&&!terrainOccludes(hit.point)?'pointer':'grab';
  }
  canvas.addEventListener('pointerdown',pointerStart);canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointermove',pointerMove);
  const clearScenePointer=()=>{pointerDown=null;pointerTravel=0;};
  canvas.addEventListener('pointercancel',clearScenePointer);canvas.addEventListener('lostpointercapture',clearScenePointer);window.addEventListener('blur',clearScenePointer);

  function animate(stamp){
    if(destroyed)return;renderFrame=requestAnimationFrame(animate);
    const frameDelta=(stamp-lastStamp)/1000||0,dt=Math.min(.05,frameDelta);lastStamp=stamp;elapsed+=dt;
    const visualTime=directorActive&&directorFrame?(Number.isFinite(directorFrame.elapsed)?directorFrame.elapsed:directorFrame.progress*directorFrame.duration):elapsed;
    const visualDelta=directorActive?lastDirectorVisualTime===null?0:clamp(visualTime-lastDirectorVisualTime,0,.06):dt;if(directorActive)lastDirectorVisualTime=visualTime;
    if(directorActive&&directorFrame)learningWorld.update(directorFrame);
    let cameraTransitionFinished=false;
    if(rover&&telemetry?.position){
      if(pilotActive){
        const state=pilotController.step(frameDelta);rover.position.set(state.position.x,state.position.y,state.position.z);rover.rotation.y=-state.heading;
      }else{
      const location=stagedVehicleLocation();
      // A modest visual offset communicates a vehicle above the seabed. Depth values
      // remain task data and are never claimed to be the terrain's measured elevations.
      const movement=location.clone().sub(rover.position);
      if(movement.length()>.08){
        if(directorActive||scriptedCutPending)rover.position.copy(location);else rover.position.lerp(location,Math.min(1,dt*8));
        if(Math.hypot(movement.x,movement.z)>.1){const targetYaw=Math.atan2(-movement.x,-movement.z);rover.rotation.y+=Math.atan2(Math.sin(targetYaw-rover.rotation.y),Math.cos(targetYaw-rover.rotation.y))*Math.min(1,visualDelta*3);}
      }
      rover.position.y=Math.max(rover.position.y,heightAt(rover.position.x,rover.position.z)+18);
      const observed=directorActive?mission.entities.find(entity=>entity.id===directorFrame?.entityId):currentView?.activeEntity;
      if(observed&&!currentView?.state.playing){const subject=toWorld(observed.position),heading=Math.atan2(rover.position.x-subject.x,rover.position.z-subject.z);if(directorActive)rover.rotation.y=heading;else rover.rotation.y+=Math.atan2(Math.sin(heading-rover.rotation.y),Math.cos(heading-rover.rotation.y))*Math.min(1,visualDelta*3);}
      }
      if(pilotActive)lastSafeVehicle={position:{x:rover.position.x,y:rover.position.y,z:rover.position.z},heading:-rover.rotation.y};
      else protectScriptedVehicle(directorActive?visualDelta:currentView?.state.playing?dt:0,{cut:scriptedCutPending});scriptedCutPending=false;
      rover.rotation.z=reducedMotion?0:Math.sin(visualTime*.6)*.016;
      rover.updateWorldMatrix(true,false);
      const aim=!pilotActive&&currentView?.activeEntity?toWorld(currentView.activeEntity.position,currentView.activeEntity.kind==='vent'?14:8):rover.localToWorld(new THREE.Vector3(0,-8,-70));
      vehicleLights.forEach(({light,target,beam})=>{target.position.copy(aim);light.intensity= presentation==='dive'?3300:1500;
        if(beam){const origin=light.getWorldPosition(new THREE.Vector3()),direction=aim.clone().sub(origin),distance=Math.min(82,Math.max(12,direction.length()));direction.normalize();beam.position.copy(origin).addScaledVector(direction,distance*.5);beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().negate());beam.scale.set(distance*.20,distance,distance*.20);beam.visible=(directorActive||visibility.plumes)&&rover.position.y<(surfaceSite?.position.y||430)-5;}
      });
      if(pilotActive)applyPilotCamera();
      else if(cameraMode==='follow'&&!transition&&!directorActive){const shift=rover.position.clone().sub(previousRoverPosition);camera.position.add(shift);controls.target.add(shift);}
      previousRoverPosition.copy(rover.position);
      halo.position.copy(rover.position);halo.position.y=heightAt(rover.position.x,rover.position.z)+1;
      const cord=tether.geometry.attributes.position;
      for(let i=0;i<35;i++){
        const t=i/34,anchor=surfaceSite?.anchor||new THREE.Vector3(rover.position.x-90,rover.position.y+290,rover.position.z+70);cord.setXYZ(i,rover.position.x+(anchor.x-rover.position.x)*t+Math.sin(t*Math.PI)*24,rover.position.y+10+(anchor.y-rover.position.y-10)*t,rover.position.z+(anchor.z-rover.position.z)*t+Math.sin(t*Math.PI)*18);
      }
      cord.needsUpdate=true;tether.geometry.computeBoundingSphere();
      if(!reducedMotion)fanRotors.forEach(fan=>{if(directorActive)fan.rotation.z=visualTime*12;else fan.rotation.z+=visualDelta*12;});
    }
    if(transition&&!directorActive){
      const progress=clamp((stamp-transition.startedAt)/transition.duration,0,1),ease=progress<.5?4*progress*progress*progress:1-Math.pow(-2*progress+2,3)/2;
      camera.position.lerpVectors(transition.fromPosition,transition.position,ease);controls.target.lerpVectors(transition.fromTarget,transition.target,ease);
      camera.position.y+=Math.sin(progress*Math.PI)*Math.min(75,transition.fromPosition.distanceTo(transition.position)*.12);
      if(progress===1){camera.position.copy(transition.position);controls.target.copy(transition.target);transition=null;controls.enableDamping=true;cameraTransitionFinished=true;cameraDirty=true;}
    }
    if(directorActive||visibility.plumes)plumeSystems.forEach(system=>system.update(reducedMotion?0:visualTime));
    if(ambientParticles&&!reducedMotion)ambientParticles.rotation.y=Math.sin(visualTime*.022)*.035;
    contextAdapter?.update(reducedMotion?0:visualTime);vesselAdapter?.update(reducedMotion?0:visualTime);
    if(directorActive)applyDirectorCamera();
    else if(!pilotActive){if(!transition)controls.update();if(!transition&&userAdjustedCamera)controls.target.y=Math.max(controls.target.y,heightAt(controls.target.x,controls.target.z)+8);clearSightline(camera.position,controls.target);camera.position.y=Math.min(camera.position.y,(surfaceSite?.position.y||430)-6);camera.lookAt(controls.target);}
    protectCamera();
    waterColumn?.update(reducedMotion?0:visualTime,camera.position);if(waterColumn){waterColumn.snow.visible=waterColumn.snow.visible&&(directorActive||visibility.plumes);waterColumn.shafts.visible=waterColumn.shafts.visible&&(directorActive||visibility.plumes);}
    const viewDistance=camera.position.distanceTo(controls.target);
    const dive=presentation==='dive',near=1-clamp((viewDistance-180)/440,0,1);
    const routeFocus=currentView?.activeEntity?toWorld(currentView.activeEntity.position,9):telemetry?.position?toWorld(telemetry.position,9):new THREE.Vector3();
    routeUniforms.forEach(uniforms=>{uniforms.uRouteDive.value=dive?1:0;uniforms.uRouteFocus.value.copy(routeFocus);});
    if(activeRoute)activeRoute.material.depthTest=dive;if(tether)tether.material.opacity=overheadGroup.visible?.38:dive?.065:.12;
    updateWaterEnvironment();
    if(directorActive&&learningWorld.isActive()){scene.background.set(0x071f2c);scene.fog.color.set(0x071f2c);scene.fog.density=.00012;hemisphere.intensity=1.65;key.intensity=2.7;key.color.set(0xd4e7e5);updateLearningLabels();}
    terrainAdapter?.setPresentation(presentation,viewDistance);
    if(!directorActive&&visibility.labels&&labelRefresh++%3===0){
      const occupied=[{x:0,y:0,w:width,h:80},{x:0,y:80,w:Math.min(310,width*.68),h:135},{x:0,y:height-210,w:Math.min(350,width),h:210},{x:width-198,y:height-155,w:198,h:155}];
      if(rover&&roverBounds){
        let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity,visibleCorners=0;
        for(const x of [roverBounds.min.x,roverBounds.max.x])for(const y of [roverBounds.min.y,roverBounds.max.y])for(const z of [roverBounds.min.z,roverBounds.max.z]){
          const corner=rover.localToWorld(new THREE.Vector3(x,y,z)).project(camera);if(corner.z<-1||corner.z>1)continue;
          const sx=(corner.x*.5+.5)*width,sy=(-corner.y*.5+.5)*height;left=Math.min(left,sx);right=Math.max(right,sx);top=Math.min(top,sy);bottom=Math.max(bottom,sy);visibleCorners++;
        }
        if(visibleCorners&&right>0&&left<width&&bottom>0&&top<height)occupied.push({x:left-14,y:top-12,w:right-left+28,h:bottom-top+24});
      }
      const overlap=(a,b)=>a.x<b.x+b.w+8&&a.x+a.w+8>b.x&&a.y<b.y+b.h+7&&a.y+a.h+7>b.y;
      const place=(element,x,y,active=false)=>{
        element.style.display='block';const box=element.getBoundingClientRect(),w=box.width||110,h=box.height||28;
        for(const [dx,dy] of [[0,0],[0,-30],[62,-10],[-62,-10],[0,32],[80,26],[-80,26]]){
          const rect={x:x+dx-w/2,y:y+dy-h,w,h};
          if(rect.x<12||rect.x+w>width-12||rect.y<84||rect.y+h>height-35||occupied.some(other=>overlap(rect,other)))continue;
          element.style.left=`${x+dx}px`;element.style.top=`${y+dy}px`;occupied.push(rect);return true;
        }
        if(active&&height>390){const tx=clamp(x,w/2+14,width-w/2-14),ty=clamp(y,225,height-180);element.style.left=`${tx}px`;element.style.top=`${ty}px`;occupied.push({x:tx-w/2,y:ty-h,w,h});return true;}
        element.style.display='none';return false;
      };
      const ordered=[...stationLabels].sort((a,b)=>{const activeA=a.entity.id===selectedEntityId,activeB=b.entity.id===selectedEntityId;return activeA!==activeB?activeB-activeA:camera.position.distanceToSquared(a.position)-camera.position.distanceToSquared(b.position);});
      let visibleCount=0;
      ordered.forEach(item=>{
        projected.copy(item.position).project(camera);const x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height,active=item.entity.id===selectedEntityId;
        let show=projected.z>-1&&projected.z<1&&x>10&&x<width-10&&y>80&&y<height-35;
        if(!active&&(visibleCount>=(dive?3:8)||terrainOccludes(toWorld(item.entity.position,item.entity.kind==='vent'?26:9))||(dive&&camera.position.distanceTo(item.position)>390)))show=false;
        if(show){if(place(item.button,x,y,active))visibleCount++;}else item.button.style.display='none';
      });
      roverLabel.style.display='none';
      if(rover&&viewDistance>300&&!terrainOccludes(rover.position)){projected.copy(rover.position);projected.y+=15;projected.project(camera);if(projected.z>-1&&projected.z<1)place(roverLabel,(projected.x*.5+.5)*width,(-projected.y*.5+.5)*height);}
    }
    if(contextLabelsEnabled&&contextLabelRefresh++%3===0)updateContextLabels();
    if(environmentCues&&environmentCueFrame&&!directorActive&&pilotActive){
      camera.updateMatrixWorld(true);environmentCues.update({elapsed:reducedMotion?0:environmentCueFrame.elapsed,playing:environmentCueFrame.playing&&!reducedMotion,viewerPosition:rover.position,camera,focusRegions:getCueLayout().regions});
      const lit=environmentCues.getTargets().find(target=>target.kind==='biology'&&target.visibleInFocus&&camera.position.distanceTo(target.position)<400);
      if(lit){const centre=lit.focusPosition||lit.position;selectionLight.visible=true;selectionLight.position.copy(centre).addScaledVector(camera.position.clone().sub(centre).normalize(),18).add(new THREE.Vector3(0,16,0));selectionLight.intensity=4200;selectionLight.distance=150;}
      else{selectionLight.intensity=460;if(currentView?.activeEntity){selectionLight.position.copy(toWorld(currentView.activeEntity.position,46));selectionLight.position.x-=18;selectionLight.position.z+=16;}}
      if(cueLabelRefresh++%3===0){const targets=environmentCues.getTargets();cueLens.update({cue:environmentCueFrame,targets,viewerPosition:rover.position,elapsed:environmentCueFrame.elapsed,mainCamera:camera,mainStatus:cueLabels.getStatus()});cueLabels.update(targets,{observation:cueLens.getStatus()});}
    }
    const cameraMotion=camera.position.distanceToSquared(lastCameraPosition)+controls.target.distanceToSquared(lastCameraTarget);
    stableCameraFrames=cameraMotion<.0001?stableCameraFrames+1:0;lastCameraPosition.copy(camera.position);lastCameraTarget.copy(controls.target);
    if(!directorActive&&cameraDirty&&!transition&&(cameraTransitionFinished||stableCameraFrames>=5)){cameraDirty=false;onCameraChange(getCameraState());}
    try{renderer.render(scene,camera);cueLens.render(renderer);if(!ready&&mission){ready=true;onReady();}}
    catch(error){if(!destroyed){onError(error);destroy();}}
  }
  renderFrame=requestAnimationFrame(animate);
  function getStats(){return {webgl:true,mission:mission?.id||null,camera:cameraMode,presentation,director:directorActive,pilot:pilotActive,shot:directorFrame?.key||null,learning:learningWorld.getState(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,points:renderer.info.render.points,stations:stationLabels.length,layers:{...visibility},proceduralTerrain:true};}
  function destroy(){
    environmentCues?.group.removeFromParent();environmentCues?.destroy();cueLabels.destroy();cueLens.destroy();
    pilotController?.destroy();
    if(destroyed)return;destroyed=true;cancelAnimationFrame(renderFrame);resizeObserver.disconnect();
    controls.removeEventListener('start',onControlStart);controls.removeEventListener('end',onControlEnd);controls.dispose();canvas.removeEventListener('pointerdown',pointerStart);canvas.removeEventListener('pointerup',pointerEnd);canvas.removeEventListener('pointermove',pointerMove);
    canvas.removeEventListener('pointercancel',clearScenePointer);canvas.removeEventListener('lostpointercapture',clearScenePointer);window.removeEventListener('blur',clearScenePointer);
    for(const group of [seabedGroup,routeGroup,propGroup,effectsGroup,vehicleGroup,ambientGroup,contextGroup,overheadGroup,oceanGroup,learningWorld.group])disposeChildren(group);
    groundPlane.geometry.dispose();groundPlane.material.dispose();particleTexture.dispose();environment.dispose();renderer.dispose();canvas.remove();overlay.remove();contextOverlay.remove();learningOverlay.remove();
  }
  return {setMission,update,setLayer,setCamera,setPresentation,focusEntity,resetCamera,getCameraState,restoreCameraState,setDirectorEnabled,setDirectorFrame,setContextLabels,getEnvironmentState,setLearningStep,setEquipmentDemoTime,getLearningState,setSamplingProgress,setPilotEnabled,setPilotInput,stopPilot,setPilotCamera,resetPilot,getPilotState,restorePilotCameraState,setEnvironmentCue,getEnvironmentCueStatus,focusEnvironmentCue,restoreEnvironmentCueCamera,destroy,getStats};
}
