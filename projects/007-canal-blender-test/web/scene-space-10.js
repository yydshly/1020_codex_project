import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setupEnvironment as setupPreviousEnvironment } from './scene-space-09-environment.js';
import { setupEnvironment as setupNeighbourhoodEnvironment } from './scene-space-10-environment.js';
import { applyLighting } from './scene-space-09-lighting.js';
import { createNavigation as createPreviousNavigation } from './scene-space-08-navigation.js';
import { createNavigation } from './scene-space-10-navigation.js';

const $=id=>document.getElementById(id);
const views={
  overview:{position:[-58,51,65],target:[-1,1.3,8],title:'街屋有高低，空地有归属',text:'窄高住宅、低层作坊和转角院落穿插在原有街道之间，屋后花园与种植地把外围连成完整的街区。'},
  plan:{position:[0,90,8],target:[0,0,8.001],title:'从上方检查每一处关系',text:'保留原有范围与道路，检查房屋组团、院落、入口和街面的连接。'},
  canal:{position:[-35,14,28],target:[0,3,3],title:'临河店铺旁，街屋轮廓有了变化',text:'保留熟悉的临河店铺与桥梁，在两侧用窄高主屋、长低作坊和不同的屋顶轮廓连接街角。'},
  north:{position:[-28,2.5,-8.0],target:[12,2.7,-8.0],title:'背街也有住宅与作坊的节奏',text:'一层作坊与两层住宅错落相邻，东北角房屋转向侧街，在门前留下与街道相连的小院。'},
  south:{position:[-25,2.5,35.5],target:[22,2.9,35.5],title:'门前退让一步，街道多一层生活',text:'西侧住宅留出连续前庭，中间两屋围出小院，低层与高层屋檐相接，行走路线延续到院中。'},
  redbox:{position:[-3.6,10.5,31],target:[-3.6,1.5,39.8],title:'两屋相对，留出可以走进的小院',text:'南街中段的两栋房屋转向彼此，入口沿同一片石地连接街道；选择“南街小院往返”可走进去再走出来。'},
  bridgehead:{position:[-30,3.2,4],target:[-18,2.2,.5],title:'路口有光，方向更清楚',text:'照明沿着实际道路与建筑入口布置，方便从主街走向背街。'},
  gardens:{position:[27,3.5,-25],target:[20,2,-19],title:'绿地沿着房屋与道路生长',text:'保留原有树木，以低篱、种植畦和贴地的绿化组织四处地块，让空地成为屋后的花园与种植地。'},
  corner:{position:[33,3.2,-8.5],target:[28.2,1.8,-13.5],title:'转过街角，房屋面向新的小院',text:'东北住宅朝向侧街，南侧留出连续的门前院。原有道路穿过街角，门口不再只是排齐的一面墙。'},
  courtyard:{position:[-11.45,2.405,25.28],target:[-7.15,1.55,23.0],title:'巷口与小院有了夜间照明',text:'沿原有夹巷进入小院，观察入口灯、邻屋窗光和地面亮暗的衔接。'},
  reverse:{position:[54,44,-48],target:[0,1,6],title:'从背面看全街灯光分布',text:'反向检查住宅后窗、街角和外围步行路，照明延续到整片街区。'},
};
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
$('world').appendChild(renderer.domElement);
const camera=new THREE.PerspectiveCamera(52,1,.08,430);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.10;controls.minDistance=.8;controls.maxDistance=160;controls.maxPolarAngle=Math.PI*.495;
let navigation=createPreviousNavigation(); const scenes=new Map();
const input=new Set(),touch=new Set(),look={id:null,x:0,y:0};
let current=null,stage='complete',loading=false,mode='inspect',viewKey='overview',foot=navigation.reset(),yaw=Math.PI,pitch=0;
let tour=null,time=0,lastTime=0,frame=0,lastLocation='';
let blockBuildings=[];
const eyeHeight=1.55,moveSpeed=1.25;
const isCoarse=matchMedia('(pointer:coarse)').matches;

function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();
function clearInput(){input.clear();touch.clear();look.id=null;}
function modeUI(){
  const walking=mode!=='inspect';$('scene-app').classList.toggle('walking',walking);
  if(current)current.scene.fog.density=(!walking&&camera.position.y>15&&['overview','reverse','plan'].includes(viewKey)) ? .0045 : .008;
  $('walk').setAttribute('aria-pressed',String(mode==='walk'));$('walk').textContent=mode==='walk'?'退出步行':'开始步行';
  $('tour').setAttribute('aria-pressed',String(mode==='tour'));$('tour').textContent=mode==='tour'?'停止巡游':'沿路线巡游';
  $('walk-status').hidden=!walking;$('map-card').hidden=!walking;$('walk-pad').hidden=!(mode==='walk'&&isCoarse);
  $('map-mode').textContent=mode==='tour'?'往返演示':'步行中';
  $('hint').textContent=walking?'WASD 移动 · 拖动环顾 · ← → 转向 · Esc 自由查看':'拖动旋转 · 滚轮缩放 · 点“开始步行”进入街道';
}
function stopMotion(){
  if(mode!=='inspect'){
    const direction=new THREE.Vector3();camera.getWorldDirection(direction);controls.target.copy(camera.position).addScaledVector(direction,3);
  }
  mode='inspect';tour=null;clearInput();controls.enabled=true;controls.enableDamping=false;controls.update();controls.enableDamping=true;modeUI();
}
function setView(key){
  stopMotion();viewKey=key;const view=views[key];camera.position.fromArray(view.position);controls.target.fromArray(view.target);controls.update();modeUI();
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===key)));
  $('view-number').textContent=`${String(Object.keys(views).indexOf(key)+1).padStart(2,'0')} / ${document.querySelector(`[data-view="${key}"]`).textContent}`;
  $('view-title').textContent=view.title;$('view-description').textContent=view.text;
}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
setView('overview');
const routeNames={south_middle_court_return:'南街小院往返',north_east_corner_return:'东北转角院往返',red_box_court_return:'共用前院往返',north_ring:'北侧街区环路',south_ring:'南侧住宅环路',courtyard_return:'原小院往返',both_banks_loop:'原临河双桥',rear_lane_loop:'原店后小巷'};
function populateRoutes(){
  const previous=$('route').value;$('route').replaceChildren();
  for(const [key,label]of Object.entries(routeNames))if(navigation.routes[key]){const option=document.createElement('option');option.value=key;option.textContent=label;$('route').appendChild(option);}
  if(navigation.routes[previous])$('route').value=previous;
}
$('route').addEventListener('change',()=>{if(mode==='tour')beginTour();else if(mode==='walk')drawMap();});

function applyWalkingCamera(){
  camera.position.set(foot.x,foot.y+eyeHeight,foot.z);camera.rotation.set(pitch,yaw,0,'YXZ');
  const location=foot.z>37.2&&foot.z<43.2&&foot.x>-4.9&&foot.x< -2.3?'南街小院':foot.z< -9.1&&foot.z> -11.35&&foot.x>24.35&&foot.x<31.5?'东北转角院':foot.z>22.6&&foot.z<26.2&&foot.x>-12.2&&foot.x< -6.1?'原有小院':foot.z>29&&foot.z<34.25&&foot.x>-13.1&&foot.x<3.15?'共用前院':foot.z>33?'南侧住宅街':foot.z< -23?'北侧环路':foot.x>25?'东侧街道':foot.x< -25?'西侧街道':foot.z< -6?'北侧背街':foot.z>15.5?'对岸背街':'临河街';
  if(location!==lastLocation){$('location').textContent=location;lastLocation=location;}
  drawMap();
}
function beginWalk(reset=true){
  if(!current||loading)return;
  clearInput();tour=null;mode='walk';controls.enabled=false;
  if(reset){foot=navigation.reset(navigation.spawns?.neighbourhoodStart??{x:-1,y:.85,z:.55});yaw=-Math.PI/2;pitch=0;}
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
  modeUI();applyWalkingCamera();$('world').focus({preventScroll:true});
}
function beginTour(){
  if(!current||loading)return;
  const key=$('route').value,points=navigation.routes[key];if(!points)return;
  const lengths=points.slice(1).map((point,i)=>Math.hypot(point.x-points[i].x,point.z-points[i].z));
  tour={points,lengths,total:lengths.reduce((a,b)=>a+b,0),distance:0,key,speed:/court/.test(key)?1.1:1.8};
  mode='tour';clearInput();controls.enabled=false;foot=navigation.reset(points[0]);pitch=0;
  const next=points[1];yaw=Math.atan2(-(next.x-foot.x),-(next.z-foot.z));
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
  modeUI();applyWalkingCamera();
}
function sampleRoute(path,distance){
  const d=Math.min(path.total,Math.max(0,distance));let start=0;
  for(let i=0;i<path.lengths.length;i++){
    const length=path.lengths[i];if(d<=start+length+.000001){
      const t=length?THREE.MathUtils.clamp((d-start)/length,0,1):0,a=path.points[i],b=path.points[i+1];
      const x=THREE.MathUtils.lerp(a.x,b.x,t),z=THREE.MathUtils.lerp(a.z,b.z,t);
      return{x,z,y:navigation.sampleHeight(x,z)??.85};
    }start+=length;
  }return path.points.at(-1);
}
$('walk').addEventListener('click',()=>mode==='walk'?stopMotion():beginWalk());
$('tour').addEventListener('click',()=>mode==='tour'?stopMotion():beginTour());
$('reset').addEventListener('click',()=>beginWalk());
$('help').addEventListener('click',()=>{const expanded=$('help').getAttribute('aria-expanded')!=='true';$('help').setAttribute('aria-expanded',String(expanded));$('help-panel').hidden=!expanded;});
$('note-toggle').addEventListener('click',()=>{const hidden=!$('view-note').hidden;$('view-note').hidden=hidden;
  $('note-toggle').setAttribute('aria-expanded',String(!hidden));$('note-toggle').textContent=hidden?'显示说明':'收起说明';});

const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
addEventListener('keydown',event=>{
  if(event.code==='Escape'){stopMotion();$('help-panel').hidden=true;$('help').setAttribute('aria-expanded','false');return;}
  if(event.target instanceof Element&&event.target.closest('select,input,textarea,[contenteditable]'))return;
  if(mode==='tour'&&movementKeys.has(event.code))beginWalk(false);
  if(mode!=='walk'||!movementKeys.has(event.code))return;
  event.preventDefault();input.add(event.code);
});
addEventListener('keyup',event=>input.delete(event.code));addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{lastTime=0;clearInput();});
const canvas=renderer.domElement;
canvas.addEventListener('pointerdown',event=>{
  if(mode!=='walk'||event.button>0)return;look.id=event.pointerId;look.x=event.clientX;look.y=event.clientY;
  canvas.setPointerCapture(event.pointerId);event.preventDefault();
});
canvas.addEventListener('pointermove',event=>{
  if(mode!=='walk'||look.id!==event.pointerId)return;
  yaw-=(event.clientX-look.x)*.004;pitch=THREE.MathUtils.clamp(pitch-(event.clientY-look.y)*.003,-.85,.85);
  look.x=event.clientX;look.y=event.clientY;
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{if(look.id===event.pointerId)look.id=null;});
document.querySelectorAll('[data-move]').forEach(button=>{
  button.addEventListener('pointerdown',event=>{if(mode!=='walk')return;touch.add(button.dataset.move);button.setPointerCapture(event.pointerId);event.preventDefault();});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,()=>touch.delete(button.dataset.move));
});

async function loadVersion(key){
  if(scenes.has(key))return scenes.get(key);
  const modelName=key==='previous'?'space-08':'space-10';
  const [gltf,appearance,manifest]=await Promise.all([
    new GLTFLoader().loadAsync(`models/${modelName}.glb`),
    fetch('models/space-03-manifest.json').then(response=>{if(!response.ok)throw new Error('Appearance data unavailable');return response.json();}),
    fetch(`models/${modelName}-manifest.json`).then(response=>{if(!response.ok)throw new Error('Neighbourhood data unavailable');return response.json();}),
  ]);
  const scene=new THREE.Scene();scene.add(gltf.scene);const facade=appearance.refinements.facades;
  const setup=key==='previous'?setupPreviousEnvironment:setupNeighbourhoodEnvironment;
  const environment=await setup(renderer,scene,gltf.scene,{mobile:innerWidth<700,materialAliases:facade.web_material_aliases,windowMaterials:facade.web_window_materials,neighbourhood:manifest?.neighbourhood});
  const lighting=applyLighting(scene,renderer);
  scene.traverse(light=>{
    if(light.isDirectionalLight){Object.assign(light.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:.5,far:105});light.shadow.camera.updateProjectionMatrix();light.shadow.normalBias=.018;}
    // The only moving object here is the camera. Cache static shadow maps.
    if(light.isLight&&light.castShadow){light.shadow.autoUpdate=false;light.shadow.needsUpdate=true;}
  });
  scene.fog.density=.008;const result={scene,environment,lighting,manifest,navigation:(key==='previous'?createPreviousNavigation:createNavigation)({ground:manifest.neighbourhood.ground.navigation})};scenes.set(key,result);return result;
}
async function activate(nextStage){
  if(loading)return;loading=true;stopMotion();$('loading').hidden=false;
  document.querySelectorAll('[data-stage]').forEach(button=>button.disabled=true);
  $('load-text').textContent=nextStage==='previous'?'正在载入 09 布局…':'正在打开街巷、前庭与屋后花园…';
  try{
    current=await loadVersion(nextStage);navigation=current.navigation;foot=navigation.reset();stage=nextStage;populateRoutes();modeUI();
    document.querySelectorAll('[data-stage]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.stage===stage)));
    $('walk').disabled=$('tour').disabled=$('route').disabled=false;
    blockBuildings=current.manifest?.neighbourhood?.buildings?.houses??[];
    $('version').textContent=stage==='previous'?'09 · 原有布局':'10 · 街巷与庭园';
    current.environment.update(time,{camera});renderer.render(current.scene,camera);$('loading').hidden=true;
  }catch(error){console.error('Neighbourhood preview failed',error);$('load-text').textContent='场景未能载入，请重试。';$('retry').hidden=false;
  }finally{loading=false;document.querySelectorAll('[data-stage]').forEach(button=>button.disabled=false);}
}
document.querySelectorAll('[data-stage]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.stage!==stage)activate(button.dataset.stage);}));
$('retry').addEventListener('click',()=>location.reload());

const map=$('map'),mapContext=map.getContext('2d');
const mapBounds={minX:-37,maxX:37,minZ:-28,maxZ:45};
const riverControls=[[-45,-3,9.2],[-28,-6.15138,8.74812],[0,-6.15138,8.74812],[24,-6.15138,8.74812],[42,-10,9.6]];
function mapRiver(x){for(let i=0;i<riverControls.length-1;i++){const a=riverControls[i],b=riverControls[i+1];if(x>=a[0]&&x<=b[0]){let t=(x-a[0])/(b[0]-a[0]);t=t*t*(3-2*t);return[a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}}return[-6.15138,8.74812];}
function drawMap(){
  const ctx=mapContext,w=map.width,h=map.height;
  const sx=x=>12+(x-mapBounds.minX)/(mapBounds.maxX-mapBounds.minX)*(w-24);
  const sz=z=>12+(z-mapBounds.minZ)/(mapBounds.maxZ-mapBounds.minZ)*(h-24);
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#122820';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#254444';ctx.beginPath();
  for(let x=-37;x<=37;x++){const[c,width]=mapRiver(x);if(x===-37)ctx.moveTo(sx(x),sz(-(c+width/2)));else ctx.lineTo(sx(x),sz(-(c+width/2)));}
  for(let x=37;x>=-37;x--){const[c,width]=mapRiver(x);ctx.lineTo(sx(x),sz(-(c-width/2)));}ctx.closePath();ctx.fill();
  for(const zone of navigation.zones){ctx.fillStyle=/courtyard|alley|connector/.test(zone.id)?'#66755c':'#435747';ctx.fillRect(sx(zone.minX),sz(zone.minZ),sx(zone.maxX)-sx(zone.minX),sz(zone.maxZ)-sz(zone.minZ));}
  ctx.fillStyle='#1b3028';ctx.strokeStyle='#9aac9360';ctx.lineWidth=2;
  for(const [left,right,near,far]of[[-13.8,-8.2,16.35,21.35],[-5.9,-.1,16.35,21.35],[2,7.6,16.35,21.35],[-9.9,7.9,-6.6,-1.11]]){
    ctx.fillRect(sx(left),sz(near),sx(right)-sx(left),sz(far)-sz(near));ctx.strokeRect(sx(left),sz(near),sx(right)-sx(left),sz(far)-sz(near));
  }
  for(const building of blockBuildings){const [a,b,c,d]=building.footprint;ctx.fillRect(sx(a),sz(-d),sx(c)-sx(a),sz(-b)-sz(-d));}
  const route=navigation.routes[$('route').value]??navigation.routes.courtyard_return;ctx.strokeStyle='#c7b47b';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();route.forEach((point,i)=>{if(i)ctx.lineTo(sx(point.x),sz(point.z));else ctx.moveTo(sx(point.x),sz(point.z));});ctx.stroke();ctx.setLineDash([]);
  const px=sx(foot.x),pz=sz(foot.z);ctx.fillStyle='#f2d094';ctx.beginPath();ctx.arc(px,pz,5,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#f2d094';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(px,pz);ctx.lineTo(px-Math.sin(yaw)*15,pz-Math.cos(yaw)*15);ctx.stroke();
  ctx.font='18px sans-serif';ctx.fillStyle='#d7dfca';ctx.fillText('临河街',sx(-5),sz(12.3));ctx.fillText('北背街',sx(-7),sz(-9));ctx.fillText('南住宅街',sx(-8),sz(35.5));
}
function updateWalking(delta){
  yaw+=((input.has('ArrowLeft')?1:0)-(input.has('ArrowRight')?1:0))*delta*1.35;
  let forward=(input.has('KeyW')||input.has('ArrowUp')||touch.has('forward')?1:0)-(input.has('KeyS')||input.has('ArrowDown')||touch.has('backward')?1:0);
  let side=(input.has('KeyD')||touch.has('right')?1:0)-(input.has('KeyA')||touch.has('left')?1:0);
  const amount=Math.hypot(forward,side);if(amount){forward/=amount;side/=amount;
    foot=navigation.move(foot,{x:(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*moveSpeed*delta,z:(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*moveSpeed*delta});
  }applyWalkingCamera();
}
function updateTour(delta){
  const path=tour;path.distance=Math.min(path.total,path.distance+delta*path.speed);
  const target=sampleRoute(path,path.distance),ahead=sampleRoute(path,Math.min(path.total,path.distance+.8));
  foot=navigation.move(foot,{x:target.x-foot.x,z:target.z-foot.z});
  if(Math.hypot(ahead.x-foot.x,ahead.z-foot.z)>.025){let heading=Math.atan2(-(ahead.x-foot.x),-(ahead.z-foot.z));
    if(path.key==='red_box_court_return'){
      const finish=THREE.MathUtils.smoothstep(path.distance,path.total-1.8,path.total);
      heading+=Math.atan2(Math.sin(-Math.PI/2-heading),Math.cos(-Math.PI/2-heading))*finish;
    }
    yaw+=Math.atan2(Math.sin(heading-yaw),Math.cos(heading-yaw))*(1-Math.exp(-delta*5));}
  applyWalkingCamera();
  if(path.distance>=path.total){beginWalk(false);$('location').textContent='巡游完成，可继续自行行走';lastLocation='';}
}
function animate(timestamp){
  frame=requestAnimationFrame(animate);if(document.hidden){lastTime=0;return;}
  if(lastTime&&timestamp-lastTime<1000/30)return;
  const delta=lastTime?Math.min((timestamp-lastTime)/1000,.25):0;lastTime=timestamp;time+=delta;
  if(mode==='walk')updateWalking(delta);else if(mode==='tour')updateTour(delta);else controls.update();
  if(current&&!loading){current.environment.update(time,{camera});renderer.render(current.scene,camera);}
}
frame=requestAnimationFrame(animate);activate('complete');
addEventListener('pagehide',event=>{if(event.persisted)return;cancelAnimationFrame(frame);clearInput();controls.dispose();for(const {scene,environment,lighting}of scenes.values()){lighting.dispose();environment.dispose();scene.traverse(part=>{if(part.isMesh){part.geometry.dispose();for(const material of(Array.isArray(part.material)?part.material:[part.material]))material.dispose();}});}renderer.dispose();});
