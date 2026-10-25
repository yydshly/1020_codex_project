// SPDX-License-Identifier: GPL-3.0-only
// Domain-neutral kinematic piloting. No DOM, rendering library, clock or storage.
// A fixed 240 Hz simulation makes equal normal elapsed time frame independent.

const STEP=1/240,EPS=1e-10,TAU=Math.PI*2;
const AXES=['forward','strafe','lift','turn'];
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const plain=value=>value!==null&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const fail=message=>{throw new TypeError(message);};
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const wrap=value=>{const result=((value+Math.PI)%TAU+TAU)%TAU-Math.PI;return Object.is(result,-0)?0:result;};
const zeroInput=()=>({forward:0,strafe:0,lift:0,turn:0});

function fields(object,allowed,label){
  if(!plain(object))fail(`${label} must be a plain data object`);
  for(const key of Reflect.ownKeys(object)){
    if(!allowed.includes(key))fail(`${label} has an unsupported field`);
    if(!Object.hasOwn(Object.getOwnPropertyDescriptor(object,key),'value'))fail(`${label} cannot contain accessors`);
  }
}
function number(value,label,{min=-1e7,max=1e7}={}){
  if(!finite(value)||value<min||value>max)fail(`${label} must be a finite number in [${min}, ${max}]`);
  return value;
}
function readPose(pose){
  fields(pose,['position','heading'],'pose');
  if(!Object.hasOwn(pose,'position')||!Object.hasOwn(pose,'heading'))fail('pose requires position and heading');
  fields(pose.position,['x','y','z'],'position');
  const position={};for(const axis of ['x','y','z'])position[axis]=number(pose.position[axis],`position.${axis}`);
  return {position,heading:number(pose.heading,'heading')};
}
function frozenPose(pose){return Object.freeze({position:Object.freeze({...pose.position}),heading:pose.heading});}
function rounded(value,scale){const result=Math.round(value*scale)/scale;return Object.is(result,-0)?0:result;}
function validateSharePose(pose){
  const next=readPose(pose);
  number(next.position.x,'shared x',{min:-580,max:580});
  number(next.position.z,'shared z',{min:-580,max:580});
  number(next.position.y,'shared y',{min:-600,max:430});
  return next;
}

/** Raw URL parameter value; URLSearchParams performs escaping for the caller. */
export function encodePilotPose(pose){
  const next=validateSharePose(pose),p=next.position;
  const angle=rounded(wrap(next.heading),1000);
  return `v1:${rounded(p.x,10)},${rounded(p.y,10)},${rounded(p.z,10)},${angle===3.142?-3.142:angle}`;
}

/** Strict v1:x,y,z,heading; positions have 0.1 and headings 0.001 precision. */
export function decodePilotPose(raw){
  if(typeof raw!=='string'||!raw||raw.length>80)fail('pilot pose parameter must be a short string');
  const parts=raw.split(':');if(parts.length!==2||parts[0]!=='v1')fail('unsupported pilot pose version');
  const values=parts[1].split(',');
  const coordinate=/^-?(?:0|[1-9]\d{0,2})(?:\.\d)?$/;
  const angle=/^-?(?:0|[1-9]\d?)(?:\.\d{1,3})?$/;
  if(values.length!==4||values.some((value,index)=>!(index===3?angle:coordinate).test(value)))fail('malformed pilot pose numbers');
  const [x,y,z,heading]=values.map(value=>{const parsed=Number(value);return Object.is(parsed,-0)?0:parsed;});
  if(heading < -3.142||heading>3.142)fail('shared heading must be a normalized angle');
  // Rounded +/- pi is one canonical orientation, avoiding codec wrap drift.
  return frozenPose(validateSharePose({position:{x,y,z},heading:Math.abs(heading)===3.142?-Math.PI:heading}));
}

/**
 * createPilotController({bounds?, minClearance?, ceiling?, heightAt?, startPose?,
 *   speed?:{horizontal?,lift?,turn?}, acceleration?, deceleration?, maxDelta?,
 *   sweepSpacing?, maxAutoSlope?, enabled?, bodyRadius?, terrainEnvelope?,
 *   isPoseBlocked?})
 *
 * Heading zero faces -Z, positive turns right; strafe positive moves right.
 * setInput replaces all axes (omitted axes are zero). Releasing input uses
 * deceleration; clearInput/setEnabled(false)/setPose/reset stop immediately.
 * Gentle slopes alone permit small automatic clearance corrections, limited
 * by maxAutoSlope (default .55). Steeper slopes shorten horizontal travel and
 * require explicit lift input, so holding forward never climbs a cliff.
 * All climbing is limited to speed.lift. Sweeps inspect
 * endpoints and intermediate heights with gaps <= sweepSpacing; heightAt must
 * represent a continuous terrain at that spatial resolution.
 * terrainEnvelope({x,z,heading}) optionally returns the minimum safe centre Y
 * of a whole body (including external clearance). isPoseBlocked(frozenPose)
 * optionally returns a boolean for solid props. Neither callback may mutate
 * its argument. bodyRadius conservatively shrinks XZ bounds for every heading.
 * Body mode sweeps lift, rotation, then translation separately, so a blocked
 * turn cannot prevent a legal escape. It samples rotation by both angular arc
 * length and angle; callbacks must represent solid geometry at that resolution.
 * setPose corrects terrain/bounds/ceiling, stops velocity and records correction;
 * an unresolved solid intersection or impossible ceiling is rejected atomically.
 */
export function createPilotController(options={}){
  fields(options,['bounds','minClearance','ceiling','heightAt','startPose','speed','acceleration','deceleration','maxDelta','sweepSpacing','maxAutoSlope','enabled','bodyRadius','terrainEnvelope','isPoseBlocked'],'pilot options');
  const option=(key,fallback)=>options[key]===undefined?fallback:options[key];
  const bounds={minX:-580,maxX:580,minZ:-580,maxZ:580};
  if(options.bounds!==undefined){fields(options.bounds,Object.keys(bounds),'bounds');for(const key of Object.keys(options.bounds))bounds[key]=number(options.bounds[key],`bounds.${key}`);}
  if(bounds.minX>=bounds.maxX||bounds.minZ>=bounds.maxZ)fail('bounds must have positive width and depth');
  const bodyRadius=number(option('bodyRadius',0),'bodyRadius',{min:0,max:10000});
  bounds.minX+=bodyRadius;bounds.maxX-=bodyRadius;bounds.minZ+=bodyRadius;bounds.maxZ-=bodyRadius;
  if(bounds.minX>=bounds.maxX||bounds.minZ>=bounds.maxZ)fail('bodyRadius leaves no navigable bounds');
  const minClearance=number(option('minClearance',8),'minClearance',{min:0,max:10000});
  const ceiling=number(option('ceiling',424),'ceiling');
  const heightAt=option('heightAt',()=>0);if(typeof heightAt!=='function')fail('heightAt must be a function');
  const terrainEnvelope=options.terrainEnvelope,isPoseBlocked=options.isPoseBlocked;
  if(terrainEnvelope!==undefined&&typeof terrainEnvelope!=='function')fail('terrainEnvelope must be a function');
  if(isPoseBlocked!==undefined&&typeof isPoseBlocked!=='function')fail('isPoseBlocked must be a function');
  const bodyMode=bodyRadius>0||terrainEnvelope!==undefined||isPoseBlocked!==undefined;
  const rates=(name,defaults)=>{
    if(options[name]!==undefined)fields(options[name],Object.keys(defaults),name);
    return Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,number(options[name]?.[key]===undefined?value:options[name][key],`${name}.${key}`,{min:EPS,max:10000})]));
  };
  const speed=rates('speed',{horizontal:42,lift:28,turn:1.2});
  const acceleration=rates('acceleration',{horizontal:84,lift:56,turn:3.6});
  const deceleration=rates('deceleration',{horizontal:126,lift:84,turn:4.8});
  const maxDelta=number(option('maxDelta',.1),'maxDelta',{min:STEP,max:.25});
  const sweepSpacing=number(option('sweepSpacing',.5),'sweepSpacing',{min:.05,max:10});
  const maxAutoSlope=number(option('maxAutoSlope',.55),'maxAutoSlope',{min:0,max:2});
  if(options.enabled!==undefined&&typeof options.enabled!=='boolean')fail('enabled must be boolean');
  let enabled=options.enabled??true,destroyed=false,input=zeroInput(),remainder=0;
  const floorAt=(x,z,heading=0)=>{
    const centre=number(heightAt(x,z),'heightAt result')+minClearance;
    return terrainEnvelope?Math.max(centre,number(terrainEnvelope(Object.freeze({x,z,heading})),'terrainEnvelope result')):centre;
  };
  const solidAt=(x,y,z,heading)=>{
    if(!isPoseBlocked)return false;
    const result=isPoseBlocked(frozenPose({position:{x,y,z},heading}));
    if(typeof result!=='boolean')fail('isPoseBlocked must return a boolean');return result;
  };
  const safePose=pose=>{
    const next=readPose(pose),p=next.position;
    const original={...p};next.heading=wrap(next.heading);
    p.x=clamp(p.x,bounds.minX,bounds.maxX);p.z=clamp(p.z,bounds.minZ,bounds.maxZ);
    const floor=floorAt(p.x,p.z,next.heading);if(floor>ceiling)fail('terrain clearance exceeds the ceiling at this pose');
    p.y=clamp(p.y,floor,ceiling);
    if(solidAt(p.x,p.y,p.z,next.heading))fail('restored pose intersects a solid obstacle');
    next.correction={bounds:Math.abs(p.x-original.x)>EPS||Math.abs(p.z-original.z)>EPS,terrain:original.y<floor-EPS,ceiling:original.y>ceiling+EPS};return next;
  };
  const initial=safePose(option('startPose',{position:{x:0,y:32,z:0},heading:0}));
  const initialPose={position:{...initial.position},heading:initial.heading};
  const fromPose=pose=>({x:pose.position.x,y:pose.position.y,z:pose.position.z,heading:pose.heading,forward:0,strafe:0,lift:0,turn:0,vx:0,vy:0,vz:0,blocked:{terrain:false,bounds:false,ceiling:false,obstacle:false,rotation:false},correction:pose.correction??{bounds:false,terrain:false,ceiling:false}});
  let motion=fromPose(initial),state;
  function snapshot(next){
    const position=Object.freeze({x:next.x,y:next.y,z:next.z}),velocity=Object.freeze({x:next.vx,y:next.vy,z:next.vz});
    const clearance=next.y-number(heightAt(next.x,next.z),'heightAt result'),minimumY=floorAt(next.x,next.z,next.heading),bodyClearance=next.y-minimumY;
    if(![...Object.values(position),...Object.values(velocity),next.heading,clearance,next.turn,minimumY,bodyClearance].every(finite))fail('pilot state must remain finite');
    const correction=Object.freeze({...next.correction});
    return Object.freeze({enabled,position,heading:next.heading,velocity,speed:Math.hypot(next.vx,next.vz),verticalSpeed:next.vy,turnSpeed:next.turn,clearance,minimumY,bodyClearance,poseCorrected:Object.values(correction).some(Boolean),correction,blocked:Object.freeze({...next.blocked})});
  }
  state=snapshot(motion);
  const alive=()=>{if(destroyed)throw new Error('pilot controller has been destroyed');};
  const getState=()=>state;
  const stopped=next=>({...next,forward:0,strafe:0,lift:0,turn:0,vx:0,vy:0,vz:0,blocked:{terrain:false,bounds:false,ceiling:false,obstacle:false,rotation:false}});
  function commit(next){const result=snapshot(next);motion=next;state=result;return result;}
  function setInput(next){
    alive();fields(next,AXES,'pilot input');
    const parsed=zeroInput();for(const axis of AXES)parsed[axis]=clamp(Object.hasOwn(next,axis)?number(next[axis],`input.${axis}`):0,-1,1);
    input=enabled?parsed:zeroInput();return state;
  }
  function clearInput(){alive();const next=stopped(motion),result=snapshot(next);input=zeroInput();remainder=0;motion=next;state=result;return result;}
  function setEnabled(value){
    alive();if(typeof value!=='boolean')fail('enabled must be boolean');
    if(value===enabled)return state;
    const previous=enabled;enabled=value;
    try{const next=stopped(motion),result=snapshot(next);input=zeroInput();remainder=0;motion=next;state=result;return result;}catch(error){enabled=previous;throw error;}
  }
  function setPose(pose){alive();const next=fromPose(safePose(pose)),result=snapshot(next);input=zeroInput();remainder=0;motion=next;state=result;return result;}
  function reset(pose=initialPose){return setPose(pose);}
  function approach(value,target,amount){return value+clamp(target-value,-amount,amount);}
  function updateLegacy(next){
    const length=Math.max(1,Math.hypot(input.forward,input.strafe));
    const targetForward=input.forward/length*speed.horizontal,targetStrafe=input.strafe/length*speed.horizontal;
    const oldForward=next.forward,oldStrafe=next.strafe,oldLift=next.lift,oldTurn=next.turn;
    const diffForward=targetForward-oldForward,diffStrafe=targetStrafe-oldStrafe,difference=Math.hypot(diffForward,diffStrafe);
    const horizontalRate=(input.forward===0&&input.strafe===0?deceleration:acceleration).horizontal;
    const factor=difference>0?Math.min(1,horizontalRate*STEP/difference):0;
    next.forward+=diffForward*factor;next.strafe+=diffStrafe*factor;
    next.lift=approach(oldLift,input.lift*speed.lift,(input.lift===0?deceleration:acceleration).lift*STEP);
    next.turn=approach(oldTurn,input.turn*speed.turn,(input.turn===0?deceleration:acceleration).turn*STEP);
    const rotation=(oldTurn+next.turn)*.5*STEP,headingMid=next.heading+rotation*.5;
    next.heading=wrap(next.heading+rotation);
    const forward=(oldForward+next.forward)*.5*STEP,strafe=(oldStrafe+next.strafe)*.5*STEP;
    const dx=Math.sin(headingMid)*forward+Math.cos(headingMid)*strafe,dz=-Math.cos(headingMid)*forward+Math.sin(headingMid)*strafe;
    const proposalX=next.x+dx,proposalZ=next.z+dz;
    const endX=clamp(proposalX,bounds.minX,bounds.maxX),endZ=clamp(proposalZ,bounds.minZ,bounds.maxZ);
    const floor=floorAt(next.x,next.z);if(floor>ceiling||next.y<floor-EPS)fail('terrain changed underneath the pilot');
    const rawY=next.y+(oldLift+next.lift)*.5*STEP,desiredY=clamp(rawY,floor,ceiling);
    const maxY=Math.min(ceiling,next.y+speed.lift*STEP,desiredY+Math.hypot(endX-next.x,endZ-next.z)*maxAutoSlope);
    const requiredAt=fraction=>{
      const spanX=(endX-next.x)*fraction,spanZ=(endZ-next.z)*fraction,count=Math.max(2,Math.ceil(Math.hypot(spanX,spanZ)/sweepSpacing));
      let required=desiredY;
      for(let i=1;i<=count;i++){
        const t=i/count,minimum=floorAt(next.x+spanX*t,next.z+spanZ*t);
        required=Math.max(required,(minimum-next.y*(1-t))/t);
      }
      return required;
    };
    let required=requiredAt(1),fraction=1;
    const terrain=required>desiredY+EPS;
    if(required>maxY+EPS){
      // Steep terrain never creates automatic climbing: keep the operator's
      // chosen vertical movement and shorten horizontal travel instead.
      let low=0,high=1;
      for(let i=0;i<16;i++){const middle=(low+high)*.5;if(requiredAt(middle)<=desiredY+EPS)low=middle;else high=middle;}
      fraction=low;required=desiredY;
    }
    const x=next.x+(endX-next.x)*fraction,z=next.z+(endZ-next.z)*fraction,y=Math.min(ceiling,Math.max(desiredY,required));
    const finalFloor=floorAt(x,z);if(y<finalFloor-EPS||y>maxY+EPS)fail('no safe terrain sweep could be resolved');
    next.vx=(x-next.x)/STEP;next.vy=(y-next.y)/STEP;next.vz=(z-next.z)/STEP;
    next.x=x;next.y=y;next.z=z;
    next.blocked={terrain,bounds:Math.abs(endX-proposalX)>EPS||Math.abs(endZ-proposalZ)>EPS,ceiling:rawY>ceiling+EPS||(fraction<1&&maxY===ceiling),obstacle:false,rotation:false};
  }
  function inspectBodyPath(from,delta){
    const distance=Math.hypot(delta.x??0,delta.y??0,delta.z??0),rotation=delta.heading??0;
    if(distance===0&&rotation===0)return {clear:true,terrain:false,obstacle:false};
    const count=Math.max(2,Math.ceil(Math.max(distance,bodyRadius*Math.abs(rotation))/sweepSpacing),Math.ceil(Math.abs(rotation)/.01));
    for(let i=1;i<=count;i++){
      const t=i/count,x=from.x+(delta.x??0)*t,y=from.y+(delta.y??0)*t,z=from.z+(delta.z??0)*t,heading=wrap(from.heading+rotation*t);
      if(y<floorAt(x,z,heading)-EPS)return {clear:false,terrain:true,obstacle:false};
      if(solidAt(x,y,z,heading))return {clear:false,terrain:false,obstacle:true};
    }
    return {clear:true,terrain:false,obstacle:false};
  }
  function truncateBodyPath(from,delta){
    const hit=inspectBodyPath(from,delta);if(hit.clear)return {fraction:1,...hit};
    let low=0,high=1;
    for(let i=0;i<16;i++){
      const middle=(low+high)*.5,partial=Object.fromEntries(Object.entries(delta).map(([key,value])=>[key,value*middle]));
      if(inspectBodyPath(from,partial).clear)low=middle;else high=middle;
    }
    return {fraction:low,...hit};
  }
  function updateBody(next){
    const origin={x:next.x,y:next.y,z:next.z,heading:next.heading};
    const floor=floorAt(origin.x,origin.z,origin.heading);
    if(floor>ceiling||origin.y<floor-EPS||solidAt(origin.x,origin.y,origin.z,origin.heading))fail('collision geometry changed underneath the pilot');
    const length=Math.max(1,Math.hypot(input.forward,input.strafe));
    const targetForward=input.forward/length*speed.horizontal,targetStrafe=input.strafe/length*speed.horizontal;
    const oldForward=next.forward,oldStrafe=next.strafe,oldLift=next.lift,oldTurn=next.turn;
    const df=targetForward-oldForward,ds=targetStrafe-oldStrafe,difference=Math.hypot(df,ds),horizontalRate=(input.forward===0&&input.strafe===0?deceleration:acceleration).horizontal;
    const factor=difference>0?Math.min(1,horizontalRate*STEP/difference):0;
    next.forward+=df*factor;next.strafe+=ds*factor;
    next.lift=approach(oldLift,input.lift*speed.lift,(input.lift===0?deceleration:acceleration).lift*STEP);
    next.turn=approach(oldTurn,input.turn*speed.turn,(input.turn===0?deceleration:acceleration).turn*STEP);
    // Vertical escape is independent of a colliding corner or turn. A roof or
    // other solid may still shorten the vertical motion itself.
    const rawY=origin.y+(oldLift+next.lift)*.5*STEP,desiredY=clamp(rawY,floor,ceiling);
    const vertical=truncateBodyPath(origin,{y:desiredY-origin.y});
    next.y=origin.y+(desiredY-origin.y)*vertical.fraction;
    if(!vertical.clear)next.lift=(next.y-origin.y)/STEP;
    const turnOrigin={x:next.x,y:next.y,z:next.z,heading:origin.heading},wantedRotation=(oldTurn+next.turn)*.5*STEP;
    const turning=truncateBodyPath(turnOrigin,{heading:wantedRotation}),rotation=wantedRotation*turning.fraction;
    next.heading=wrap(origin.heading+rotation);
    if(!turning.clear)next.turn=rotation/STEP;
    const headingMid=origin.heading+rotation*.5,forward=(oldForward+next.forward)*.5*STEP,strafe=(oldStrafe+next.strafe)*.5*STEP;
    const dx=Math.sin(headingMid)*forward+Math.cos(headingMid)*strafe,dz=-Math.cos(headingMid)*forward+Math.sin(headingMid)*strafe;
    const proposalX=origin.x+dx,proposalZ=origin.z+dz,endX=clamp(proposalX,bounds.minX,bounds.maxX),endZ=clamp(proposalZ,bounds.minZ,bounds.maxZ);
    const start={x:next.x,y:next.y,z:next.z,heading:next.heading},spanX=endX-start.x,spanZ=endZ-start.z;
    const maximumY=Math.min(ceiling,origin.y+speed.lift*STEP,start.y+Math.hypot(spanX,spanZ)*maxAutoSlope);
    const samples=spanX===0&&spanZ===0?0:Math.max(2,Math.ceil(Math.hypot(spanX,spanZ)/sweepSpacing));let requiredY=start.y;
    for(let i=1;i<=samples;i++){
      const t=i/samples,minimum=floorAt(start.x+spanX*t,start.z+spanZ*t,start.heading);
      requiredY=Math.max(requiredY,(minimum-start.y*(1-t))/t);
    }
    let horizontal=requiredY>maximumY+EPS?{clear:false,terrain:true,obstacle:false}:inspectBodyPath(start,{x:spanX,y:Math.max(0,requiredY-start.y),z:spanZ});
    let fraction=1;
    if(!horizontal.clear){
      // Steep terrain and solid objects are brakes, not automatic staircases.
      // The already accepted lift/turn remains, while only horizontal travel
      // is shortened along its own swept path at the operator's chosen height.
      let low=0,high=1;
      for(let i=0;i<16;i++){const middle=(low+high)*.5;if(inspectBodyPath(start,{x:spanX*middle,z:spanZ*middle}).clear)low=middle;else high=middle;}
      fraction=low;requiredY=start.y;
    }
    next.x=start.x+spanX*fraction;next.z=start.z+spanZ*fraction;next.y=Math.max(start.y,requiredY);
    if(next.y>ceiling+EPS||next.y<floorAt(next.x,next.z,next.heading)-EPS||solidAt(next.x,next.y,next.z,next.heading))fail('no safe whole-body pose could be resolved');
    next.vx=(next.x-origin.x)/STEP;next.vy=(next.y-origin.y)/STEP;next.vz=(next.z-origin.z)/STEP;
    next.blocked={terrain:vertical.terrain||turning.terrain||horizontal.terrain,bounds:Math.abs(endX-proposalX)>EPS||Math.abs(endZ-proposalZ)>EPS,ceiling:rawY>ceiling+EPS||(!horizontal.clear&&maximumY>=ceiling-EPS),obstacle:vertical.obstacle||turning.obstacle||horizontal.obstacle,rotation:!turning.clear};
  }
  function step(deltaSeconds){
    alive();number(deltaSeconds,'deltaSeconds',{min:0,max:Number.MAX_VALUE});
    if(!enabled||deltaSeconds===0)return state;
    const elapsed=remainder+Math.min(deltaSeconds,maxDelta),count=Math.floor((elapsed+EPS)/STEP);
    if(count===0){remainder=elapsed;return state;}
    const next={...motion,blocked:{...motion.blocked}};
    // Mutations and terrain calls are transactional: failure preserves the last
    // snapshot, internal velocities, and the fractional-time accumulator.
    for(let i=0;i<count;i++)(bodyMode?updateBody:updateLegacy)(next);
    const result=commit(next);remainder=Math.max(0,elapsed-count*STEP);return result;
  }
  function destroy(){if(destroyed)return;clearInput();destroyed=true;}
  return Object.freeze({getState,setInput,clearInput,setEnabled,step,setPose,reset,destroy});
}
