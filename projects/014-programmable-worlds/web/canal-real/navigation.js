import * as THREE from 'three';

const ROOM={x:[-14.1,-9.65],y:[1.65,4.35],z:[7.9,15.1]};
const OUTDOORS={x:[-9.6,9.6],y:[1.1,Infinity],z:[-70,50]};
const BRIDGE_BANKS=[
 {min:new THREE.Vector3(-9.9,-10,-30.45),max:new THREE.Vector3(-3,2.5,-26.55)},
 {min:new THREE.Vector3(3,-10,-30.45),max:new THREE.Vector3(9.9,2.5,-26.55)}
];
// The source bridge has a 3.7m × 1.4m elliptical arch. Conservative quarter-
// metre slices retain its low central passage while blocking its crown/deck.
// Without these, a camera at y1.8 could fly through the solid arch centre.
for(let x=-3;x<3;x+=.25){const edge=Math.max(Math.abs(x),Math.abs(x+.25)),ceiling=.1+1.4*Math.sqrt(1-(edge/3.7)**2)-.08;BRIDGE_BANKS.push({min:new THREE.Vector3(x-.002,ceiling,-30.45),max:new THREE.Vector3(x+.252,2.5,-26.55)});}
const BRIDGE_RAILS=[];
// Follow the source's curved parapet height. A thin fence envelope prevents a
// camera from passing between its posts, while the higher bank-side approach
// stays open wherever the actual railing is lower than the camera.
const deckHeight=x=>.68+1.32*(1-x*x/100);
for(let x=-10;x<10;x+=.25){
 const nearest=Math.min(Math.abs(x),Math.abs(x+.25)),farthest=Math.max(Math.abs(x),Math.abs(x+.25));
 const low=deckHeight(farthest)+.055,high=deckHeight(nearest)+.85;
 for(const z of [-30.3,-26.7])BRIDGE_RAILS.push({min:new THREE.Vector3(x-.025,low,z-.225),max:new THREE.Vector3(x+.275,high,z+.225)});
}
// The observation room projects beyond the ordinary street façades. These
// four source wall pieces also include their sill/jamb thickness, leaving the
// central open window clear for the programmed approach and manual passage.
const WINDOW_WALLS=[
 {min:new THREE.Vector3(-9.69,.30,7.47),max:new THREE.Vector3(-8.76,1.90,15.53)},
 {min:new THREE.Vector3(-9.45,4.21,7.47),max:new THREE.Vector3(-8.79,5.69,15.53)},
 {min:new THREE.Vector3(-9.45,1.41,7.55),max:new THREE.Vector3(-8.79,4.69,9.70)},
 {min:new THREE.Vector3(-9.45,1.41,13.30),max:new THREE.Vector3(-8.79,4.69,15.45)}
];
const SOLIDS=[...BRIDGE_BANKS.map(box=>({...box,label:'bridge-bank'})),...BRIDGE_RAILS.map(box=>({...box,label:'bridge-railing'})),...WINDOW_WALLS.map(box=>({...box,label:'window-wall',escape:'x'}))];
const UP=new THREE.Vector3(0,1,0),MAX_PITCH=THREE.MathUtils.degToRad(80);
function insidePhysicalRoom(p){return p.x>=-14.55&&p.x<=-9.45&&p.y>=1.2&&p.y<=4.8&&p.z>=7.6&&p.z<=15.4;}
function insideBox(p,box){return p.x>box.min.x&&p.x<box.max.x&&p.y<box.max.y&&p.y>=box.min.y&&p.z>box.min.z&&p.z<box.max.z;}
function segmentEntry(start,end,box){
 let enter=0,exit=1;
 for(const axis of ['x','y','z']){
  const delta=end[axis]-start[axis];
  if(Math.abs(delta)<1e-9){if(start[axis]<=box.min[axis]||start[axis]>=box.max[axis])return null;continue;}
  const a=(box.min[axis]-start[axis])/delta,b=(box.max[axis]-start[axis])/delta;
  enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
  if(enter>exit)return null;
 }
 return enter>=0&&enter<1&&exit>0?enter:null;
}

export function createNavigation({camera,controls,canvas,getContext,onManual=()=>{}}){
 let manual=false,qaPose=false,disposed=false,pointer=null,internalUpdate=false,lastConstraint=null;
 const orbitLimits={minDistance:controls.minDistance,maxDistance:controls.maxDistance,minPolarAngle:controls.minPolarAngle,maxPolarAngle:controls.maxPolarAngle};
 const lastSafe=camera.position.clone(),direction=new THREE.Vector3(),right=new THREE.Vector3(),candidate=new THREE.Vector3(),oldPosition=new THREE.Vector3();
 const removals=[];
 function roomMode(){const context=getContext();return (context.experience==='window'&&context.view==='window')||insidePhysicalRoom(camera.position);}
 // A selected window view controls the input style, not the camera's physical
 // location. Its return route starts in the street; interrupting it must not
 // teleport the camera across the wall into the observation room.
 function bounds(){return insidePhysicalRoom(camera.position)?ROOM:OUTDOORS;}
 function automated(){return !!getContext().tourPlaying;}
 function configure(){
  if(disposed)return;
  const firstPerson=!automated()&&roomMode();
  controls.enableRotate=controls.enablePan=controls.enableZoom=!firstPerson;
  controls.enableDamping=!firstPerson&&!automated()&&!qaPose;
  const explicit=qaPose&&!manual;
  controls.minDistance=explicit?0.0001:orbitLimits.minDistance;
  controls.maxDistance=explicit?Infinity:orbitLimits.maxDistance;
  controls.minPolarAngle=explicit?0.00001:orbitLimits.minPolarAngle;
  controls.maxPolarAngle=explicit?Math.PI-.00001:orbitLimits.maxPolarAngle;
 }
 function constrain(start,proposed){
  const limits=bounds(),result=proposed.clone(),label=limits===ROOM?'room':'corridor';
  for(const axis of ['x','y','z']){const value=THREE.MathUtils.clamp(result[axis],...limits[axis]);if(value!==result[axis])lastConstraint=label+':'+axis;result[axis]=value;}
  if(limits===OUTDOORS){
   for(const box of SOLIDS){
    // An explicit QA pose may start inside a solid. The first user operation
    // returns to the nearest accessible face, rather than trapping the camera.
    if(insideBox(start,box)){
     if(insideBox(result,box)){const axis=box.escape||'z';result[axis]=Math.abs(result[axis]-box.min[axis])<Math.abs(result[axis]-box.max[axis])?box.min[axis]-.025:box.max[axis]+.025;lastConstraint=box.label;}
     continue;
    }
    const entry=segmentEntry(start,result,box);
    if(entry!==null){const distance=start.distanceTo(result),safe=Math.max(0,entry-.025/Math.max(distance,.025));result.lerpVectors(start,result,safe);lastConstraint=box.label;}
   }
  }
  return result;
 }
 function applyMotion(delta){
  oldPosition.copy(camera.position);candidate.copy(oldPosition).add(delta);
  const next=constrain(oldPosition,candidate),actual=next.clone().sub(oldPosition);
  camera.position.copy(next);controls.target.add(actual);lastSafe.copy(next);
  internalUpdate=true;try{controls.update();}finally{internalUpdate=false;}
  // An outdoor Orbit drag can still have residual damping while WASD begins.
  // Resolve that extra movement before returning, not only on the next frame.
  const settled=constrain(next,camera.position),correction=settled.clone().sub(camera.position);
  if(correction.lengthSq()>1e-12){camera.position.copy(settled);controls.target.add(correction);camera.lookAt(controls.target);}
  lastSafe.copy(camera.position);
 }
 function beginManual(){
  if(disposed)return;
  onManual();const wasExplicitPose=qaPose;manual=true;qaPose=false;configure();
  if(wasExplicitPose){
   camera.getWorldDirection(direction);const yaw=Math.atan2(direction.x,direction.z),pitch=THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(direction.y,-1,1)),-MAX_PITCH,MAX_PITCH),distance=THREE.MathUtils.clamp(camera.position.distanceTo(controls.target),1,60);
   direction.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));controls.target.copy(camera.position).addScaledVector(direction,distance);
  }
  // Clamp before looking as well as before moving. A paused tour may currently
  // be in the window threshold, outside the normal observation envelope.
  applyMotion(new THREE.Vector3());
 }
 function translate({forward=0,right:sideways=0,up=0}={}){
  if(![forward,sideways,up].every(Number.isFinite))throw new Error('Camera movement must be finite');
  beginManual();camera.getWorldDirection(direction);direction.y=0;
  if(direction.lengthSq()<1e-8)direction.set(0,0,-1);else direction.normalize();
  right.crossVectors(direction,UP).normalize();
  applyMotion(direction.clone().multiplyScalar(forward).addScaledVector(right,sideways).addScaledVector(UP,up));
  return getState();
 }
 function look({yaw=0,pitch=0}={}){
  if(![yaw,pitch].every(Number.isFinite))throw new Error('Camera look must be finite');
  beginManual();camera.getWorldDirection(direction);
  const currentYaw=Math.atan2(direction.x,direction.z),currentPitch=Math.asin(THREE.MathUtils.clamp(direction.y,-1,1));
  const nextYaw=currentYaw+yaw%(Math.PI*2),nextPitch=THREE.MathUtils.clamp(currentPitch+pitch,-MAX_PITCH,MAX_PITCH);
  const distance=THREE.MathUtils.clamp(camera.position.distanceTo(controls.target),1,60),horizontal=Math.cos(nextPitch);
  direction.set(Math.sin(nextYaw)*horizontal,Math.sin(nextPitch),Math.cos(nextYaw)*horizontal);
  controls.target.copy(camera.position).addScaledVector(direction,distance);
  oldPosition.copy(camera.position);
  internalUpdate=true;try{controls.update();}finally{internalUpdate=false;}
  // An earlier outdoor orbit may still have damping left during an API look.
  // Apply the same swept constraint used by movement before recording safety.
  const settled=constrain(oldPosition,camera.position),correction=settled.clone().sub(camera.position);
  if(correction.lengthSq()>1e-12){camera.position.copy(settled);controls.target.add(correction);camera.lookAt(controls.target);}
  lastSafe.copy(camera.position);return getState();
 }
 function reset({explicitPose=false}={}){
  manual=false;qaPose=explicitPose;lastConstraint=null;
  cancelInput();
  // Flush residual Orbit damping before a programmatic pose is written. This
  // prevents the last street orbit from rotating a newly selected window view.
  controls.enableDamping=false;internalUpdate=true;try{controls.update();}finally{internalUpdate=false;}
  lastSafe.copy(camera.position);configure();
 }
 function onChange(){
  if(disposed||internalUpdate)return;
  if(manual&&!automated()){
   const next=constrain(lastSafe,camera.position);
   if(next.distanceToSquared(camera.position)>1e-12){camera.position.copy(next);camera.lookAt(controls.target);}
  }
  lastSafe.copy(camera.position);
 }
 function listen(type,handler,options){canvas.addEventListener(type,handler,options);removals.push(()=>canvas.removeEventListener(type,handler,options));}
 listen('pointerdown',event=>{
  beginManual();if(!roomMode())return;
  if(event.button!==0||pointer){event.preventDefault();event.stopImmediatePropagation();return;}
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY};try{canvas.setPointerCapture(event.pointerId);}catch{}
  event.preventDefault();event.stopImmediatePropagation();
 },true);
 listen('pointermove',event=>{
  if(!pointer||event.pointerId!==pointer.id)return;
  const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;pointer.x=event.clientX;pointer.y=event.clientY;
  look({yaw:-dx*.003,pitch:-dy*.003});event.preventDefault();event.stopImmediatePropagation();
 },true);
 for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(type,event=>{
  if(!pointer||event.pointerId!==pointer.id)return;const id=pointer.id;pointer=null;
  try{canvas.releasePointerCapture(id);}catch{}event.stopImmediatePropagation();
 },true);
 listen('wheel',event=>{
  beginManual();if(!roomMode())return;
  translate({forward:-THREE.MathUtils.clamp(event.deltaY/100,-1,1)*.45});event.preventDefault();event.stopImmediatePropagation();
 },{capture:true,passive:false});
 controls.addEventListener('change',onChange);
 function getState(){const context=getContext(),limits=bounds();return {mode:context.tourPlaying?'tour':qaPose&&!manual?'qa-pose':roomMode()?'room-look':'outdoor-orbit',manual,bounds:{x:[...limits.x],y:[limits.y[0],Number.isFinite(limits.y[1])?limits.y[1]:null],z:[...limits.z]},lastConstraint,position:camera.position.toArray()};}
 function cancelInput(){if(!pointer)return;const id=pointer.id;pointer=null;try{canvas.releasePointerCapture(id);}catch{}}
 function dispose(){if(disposed)return;disposed=true;cancelInput();for(const remove of removals)remove();controls.removeEventListener('change',onChange);}
 configure();return {translate,look,reset,configure,cancelInput,getState,dispose};
}
