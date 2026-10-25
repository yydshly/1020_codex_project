// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {createPilotController,encodePilotPose,decodePilotPose} from '../web/core/pilot-core.mjs';

const close=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected} (+/- ${tolerance})`);
const pose=(x=0,y=32,z=0,heading=0)=>({position:{x,y,z},heading});
const advance=(controller,seconds,fps=60)=>{for(let i=0;i<Math.round(seconds*fps);i++)controller.step(1/fps);return controller.getState();};
const assertSafe=(state,heightAt=()=>0,clearance=8,ceiling=424)=>{
  assert.ok(Object.values(state.position).every(Number.isFinite));
  assert.ok(Object.values(state.velocity).every(Number.isFinite));
  assert.ok(state.position.x>=-580&&state.position.x<=580&&state.position.z>=-580&&state.position.z<=580);
  assert.ok(state.position.y<=ceiling+1e-8);
  assert.ok(state.position.y-heightAt(state.position.x,state.position.z)>=clearance-1e-8);
};

// Equal normal elapsed time must have identical trajectories, including turns.
const oneSecond=fps=>{const pilot=createPilotController();pilot.setInput({forward:.8,strafe:.6,lift:.7,turn:.8});return advance(pilot,1,fps);};
const reference=oneSecond(60);
for(const fps of [30,120])assert.deepEqual(oneSecond(fps),reference);
const irregular=createPilotController();irregular.setInput({forward:.8,strafe:.6,lift:.7,turn:.8});for(let i=0;i<1000;i++)irregular.step(.001);assert.deepEqual(irregular.getState(),reference);
const forward=createPilotController();forward.setInput({forward:1});const running=advance(forward,1);close(running.position.z,-31.5);close(running.position.x,0);close(running.speed,42);
assert.ok(Object.isFrozen(running)&&Object.isFrozen(running.position)&&Object.isFrozen(running.velocity)&&Object.isFrozen(running.blocked));
assert.throws(()=>{running.position.x=1;},TypeError);
const diagonal=createPilotController();diagonal.setInput({forward:10,strafe:10});close(advance(diagonal,1).speed,42);close(Math.hypot(diagonal.getState().position.x,diagonal.getState().position.z),31.5);
const heading=createPilotController({startPose:pose(0,32,0,Math.PI/2)});heading.setInput({forward:1});advance(heading,1);close(heading.getState().position.x,31.5);close(heading.getState().position.z,0);
const strafe=createPilotController();strafe.setInput({strafe:1});advance(strafe,1);close(strafe.getState().position.x,31.5);close(strafe.getState().position.z,0);
const turn=createPilotController();turn.setInput({turn:1});advance(turn,1);close(turn.getState().heading,1);close(turn.getState().turnSpeed,1.2);
const lift=createPilotController();lift.setInput({lift:1});advance(lift,1);close(lift.getState().position.y,53);close(lift.getState().verticalSpeed,28);

// Normal release has a short braking distance; blur/stop/disable are immediate.
forward.setInput({});const released=advance(forward,1);close(released.position.z,-38.5);close(released.speed,0);
const stopped=diagonal.clearInput(),stoppedPosition={...stopped.position};advance(diagonal,1);assert.deepEqual(diagonal.getState().position,stoppedPosition);close(stopped.speed,0);close(stopped.turnSpeed,0);
diagonal.setInput({forward:1});advance(diagonal,.5);const disabled=diagonal.setEnabled(false);assert.equal(disabled.enabled,false);close(disabled.speed,0);const disabledPosition={...disabled.position};diagonal.setInput({forward:1,lift:1});diagonal.step(100);assert.deepEqual(diagonal.getState().position,disabledPosition);diagonal.setEnabled(true);advance(diagonal,1);assert.deepEqual(diagonal.getState().position,disabledPosition,'Disabled controls cannot leave sticky input');

// Gentle terrain follows at a bounded vertical speed; a canyon wall cannot
// suck the vehicle upwards. Explicit lift permits the same wall to be crossed.
const slope=(x,z)=>Math.max(0,Math.min(20,-z*.25));
const terrain=createPilotController({heightAt:slope,startPose:pose(0,8),minClearance:8});terrain.setInput({forward:1});
for(let i=0;i<180;i++){const state=terrain.step(1/60);assertSafe(state,slope);assert.ok(state.speed<=42+1e-7);assert.ok(Math.abs(state.verticalSpeed)<=28+1e-7);}
assert.ok(terrain.getState().position.z < -80);assert.ok(terrain.getState().position.y>=28-1e-8);
const wall=(x,z)=>z<=-6?300:0;
const canyon=createPilotController({heightAt:wall,startPose:pose(0,18),minClearance:18,ceiling:414});canyon.setInput({forward:1});advance(canyon,5);
assert.ok(canyon.getState().position.z>-6);close(canyon.getState().position.y,18);assert.equal(canyon.getState().blocked.terrain,true);close(canyon.getState().speed,0,1e-6);
canyon.setInput({forward:1,lift:1});
for(let i=0;i<13*60;i++)assertSafe(canyon.step(1/60),wall,18,414);
assert.ok(canyon.getState().position.z<-6,'The user may deliberately rise over the wall');
const peak=(x,z)=>Math.abs(z+1.5)<.6?100:0;
const sweep=createPilotController({heightAt:peak,startPose:pose(0,8),speed:{horizontal:480},acceleration:{horizontal:10000}});sweep.setInput({forward:1});sweep.step(.1);assert.ok(sweep.getState().position.z>-.9,'A narrow ridge between movement endpoints must block travel');close(sweep.getState().position.y,8);assert.equal(sweep.getState().blocked.terrain,true);
const impassable=createPilotController({heightAt:wall,startPose:pose(0,18),minClearance:18,ceiling:80});impassable.setInput({forward:1,lift:1});advance(impassable,6);assert.ok(impassable.getState().position.z>-6);close(impassable.getState().position.y,80);assert.equal(impassable.getState().blocked.terrain,true);assert.equal(impassable.getState().blocked.ceiling,true);

// Boundary clipping is independent of terrain; moving parallel to a wall still
// works. A water-surface ceiling and terrain clearance apply to setPose too.
const bounded=createPilotController({startPose:pose(579.9,423.9,0,Math.PI/2)});bounded.setInput({forward:1,lift:1});advance(bounded,1);close(bounded.getState().position.x,580);close(bounded.getState().position.y,424);assert.equal(bounded.getState().blocked.bounds,true);assert.equal(bounded.getState().blocked.ceiling,true);
bounded.clearInput();bounded.setInput({strafe:1});advance(bounded,1);assert.ok(bounded.getState().position.z>30,'Can slide parallel to an x boundary');
bounded.setPose(pose(1000,-100,-1000,Math.PI*8+.5));assert.deepEqual(bounded.getState().position,{x:580,y:8,z:-580});close(bounded.getState().heading,.5);close(bounded.getState().speed,0);
bounded.reset();assert.deepEqual(bounded.getState().position,{x:579.9,y:423.9,z:0});
const start=pose(1,35,2,.3),configured=createPilotController({startPose:start});start.position.x=400;configured.setPose(pose(5,40,10));configured.reset();assert.deepEqual(configured.getState().position,{x:1,y:35,z:2},'The controller owns its reset pose');

// Background-sized deltas are capped rather than jumping through the world.
const capped=createPilotController(),normal=createPilotController();capped.setInput({forward:1});normal.setInput({forward:1});capped.step(60);normal.step(.1);assert.deepEqual(capped.getState(),normal.getState());
const zero=normal.getState();assert.equal(normal.step(0),zero);
for(const invalid of [NaN,Infinity,-Infinity,-1,'0.1',null]){assert.throws(()=>normal.step(invalid),TypeError);assert.equal(normal.getState(),zero);}
for(const invalid of [{forward:NaN},{lift:Infinity},{turn:null},{strafe:undefined},{forward:1,unknown:1},null,[]]){
  const before=normal.getState();assert.throws(()=>normal.setInput(invalid),TypeError);assert.equal(normal.getState(),before);
}
normal.step(.1);assert.ok(normal.getState().position.z<zero.position.z,'Rejected input must preserve earlier valid controls');
for(const invalid of [pose(NaN),pose(0,Infinity),{position:{x:0,y:0,z:0},heading:NaN},{position:[0,0,0],heading:0},null]){const before=normal.getState();assert.throws(()=>normal.setPose(invalid),TypeError);assert.equal(normal.getState(),before);}
let badTerrain=false;
const transactional=createPilotController({heightAt:()=>badTerrain?NaN:0});transactional.setInput({forward:1});transactional.step(.001);const prior=transactional.getState();badTerrain=true;assert.throws(()=>transactional.step(.02),TypeError);assert.equal(transactional.getState(),prior);badTerrain=false;transactional.step(.02);
const control=createPilotController();control.setInput({forward:1});control.step(.001);control.step(.02);assert.deepEqual(transactional.getState(),control.getState(),'A failed terrain query must not consume time or alter velocity');
for(const invalid of [{bounds:{minX:5,maxX:4}},{heightAt:()=>NaN},{heightAt:()=>500},{speed:{horizontal:0}},{maxDelta:Infinity},{minClearance:null},{ceiling:NaN},{startPose:null},{enabled:1},{speed:{turn:null}},{maxAutoSlope:-1}])assert.throws(()=>createPilotController(invalid),TypeError);
const accessor={};Object.defineProperty(accessor,'forward',{get(){throw new Error('must not execute accessor');},enumerable:true});assert.throws(()=>normal.setInput(accessor),TypeError);

// The share codec is independent of URL/DOM and rejects the entire pose on any
// malformed value. Codec rounding does not bypass controller terrain safety.
const encoded=encodePilotPose(pose(-42.26,412.34,108.04,1.23456));assert.equal(encoded,'v1:-42.3,412.3,108,1.235');
const decoded=decodePilotPose(encoded);assert.deepEqual(decoded,pose(-42.3,412.3,108,1.235));assert.ok(Object.isFrozen(decoded)&&Object.isFrozen(decoded.position));assert.equal(encodePilotPose(decoded),encoded);
for(const angle of [Math.PI,-Math.PI,Math.PI*7,0,1.2345]){const token=encodePilotPose(pose(0,8,0,angle));assert.equal(encodePilotPose(decodePilotPose(token)),token);}
const restored=createPilotController({heightAt:()=>20});restored.setPose(decodePilotPose('v1:0,-600,0,0'));close(restored.getState().position.y,28);
for(const invalid of ['',null,23,'v2:0,8,0,0','v1:0,8,0','v1:0,8,0,0,0','v1:581,8,0,0','v1:0,431,0,0','v1:0,-601,0,0','v1:NaN,8,0,0','v1:1e2,8,0,0','v1:01,8,0,0','v1:0,8.12,0,0','v1:0,8,0,1.2345','v1:0,8,0,6.283','v1: 0,8,0,0'])assert.throws(()=>decodePilotPose(invalid),TypeError);
for(const invalid of [pose(581),pose(0,-601),pose(0,431),pose(0,8,Infinity)])assert.throws(()=>encodePilotPose(invalid),TypeError);
const warehouse=createPilotController({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},heightAt:()=>-2,ceiling:30,minClearance:1,startPose:pose(0,0),speed:{horizontal:6,lift:2,turn:.6}});warehouse.setInput({forward:1,strafe:1});advance(warehouse,1);assert.ok(warehouse.getState().speed<=6+1e-8);assert.equal(warehouse.getState().clearance,2,'The same integrator works in a non-ocean inspection theme');

// Whole-body envelopes catch corners and an extended arm even when the centre
// remains above a low, unobstructed floor. Rotation itself is a swept motion.
const radius=Math.hypot(2,10),extentX=heading=>Math.abs(Math.cos(heading))*2+Math.abs(Math.sin(heading))*10;
const bodyEnvelope=({x,heading})=>x+extentX(heading)>8?101:1;
const volumeOptions={heightAt:()=>0,minClearance:1,ceiling:150,bodyRadius:radius,terrainEnvelope:bodyEnvelope,startPose:pose(0,2)};
const bodyTurn=createPilotController(volumeOptions);bodyTurn.setInput({turn:1});advance(bodyTurn,3);
assert.ok(bodyTurn.getState().heading>.2&&bodyTurn.getState().heading<Math.PI/2,'The long arm stops before rotating through a wall');
assert.ok(bodyTurn.getState().position.x+extentX(bodyTurn.getState().heading)<=8+1e-8);close(bodyTurn.getState().position.y,2);assert.equal(bodyTurn.getState().blocked.rotation,true);assert.equal(bodyTurn.getState().blocked.terrain,true);
const beforeLift=bodyTurn.getState().position.y;bodyTurn.setInput({turn:1,lift:1});advance(bodyTurn,1);assert.ok(bodyTurn.getState().position.y>beforeLift+15,'A blocked turn must not lock vertical escape');
bodyTurn.clearInput();bodyTurn.setInput({strafe:-1});advance(bodyTurn,1);assert.ok(bodyTurn.getState().position.x<-10,'A blocked corner must still permit legal movement away from the wall');
const rotatingSlit=({heading})=>heading>=.2&&heading<=.25?101:1;
const fastTurn=createPilotController({minClearance:1,ceiling:150,bodyRadius:12,terrainEnvelope:rotatingSlit,startPose:pose(0,2),speed:{turn:240},acceleration:{turn:10000}});
fastTurn.setInput({turn:1});fastTurn.step(.1);assert.ok(fastTurn.getState().heading<=.2+1e-8,'A turn cannot pass a narrow forbidden arc even if a later endpoint is clear');assert.equal(fastTurn.getState().blocked.rotation,true);
const angleOnly=createPilotController({minClearance:1,terrainEnvelope:rotatingSlit,startPose:pose(0,2)});angleOnly.setInput({turn:1,forward:1});advance(angleOnly,2);assert.ok(angleOnly.getState().position.z<-20,'A blocked rotation does not unnecessarily cancel safe forward translation');assert.ok(angleOnly.getState().heading<=.2+1e-8);
const bodyMove=createPilotController(volumeOptions);bodyMove.setInput({strafe:1});advance(bodyMove,2);assert.ok(bodyMove.getState().position.x<=6+1e-8,'The body side stops before its centre reaches a wall');close(bodyMove.getState().position.y,2);assert.equal(bodyMove.getState().blocked.terrain,true);

// setPose and URL recovery may correct altitude in-bounds, but cannot silently
// commit an impossible clearance or unresolved solid penetration.
const adjusted=bodyMove.setPose(pose(7,2));close(adjusted.position.y,101);close(adjusted.speed,0);assert.equal(adjusted.poseCorrected,true);assert.equal(adjusted.correction.terrain,true);assert.equal(adjusted.minimumY,101);close(adjusted.bodyClearance,0);assert.ok(Object.isFrozen(adjusted.correction));
bodyMove.setEnabled(false);bodyMove.setEnabled(true);assert.equal(bodyMove.getState().poseCorrected,true,'Enabling does not erase the restoration correction notice');
bodyMove.setPose(pose(0,2));assert.equal(bodyMove.getState().poseCorrected,false);
const lowCeiling=createPilotController({...volumeOptions,ceiling:80});const lowBefore=lowCeiling.getState();assert.throws(()=>lowCeiling.setPose(decodePilotPose('v1:7,2,0,0')),TypeError);assert.equal(lowCeiling.getState(),lowBefore);
const radiusBounds=createPilotController({bodyRadius:12,startPose:pose(579,20,579)});assert.deepEqual(radiusBounds.getState().position,{x:568,y:20,z:568});assert.equal(radiusBounds.getState().correction.bounds,true);radiusBounds.setInput({forward:1,strafe:1});advance(radiusBounds,2);assert.ok(radiusBounds.getState().position.x+12<=580&&radiusBounds.getState().position.z-12>=-580);

// Solid callbacks are independent of terrain, and full 3D sweeps also protect
// vertical motion, solid corners and intermediate rotational poses.
const solidBox=({position:p})=>p.x+2>4&&p.x-2<7&&p.z+2>-2&&p.z-2<2&&p.y+2>-2&&p.y-2<20;
const solidOptions={minClearance:1,bodyRadius:3,startPose:pose(0,2),isPoseBlocked:solidBox};
const solids=createPilotController(solidOptions);solids.setInput({strafe:1});advance(solids,2);assert.ok(solids.getState().position.x<=2+1e-8);assert.equal(solids.getState().blocked.obstacle,true);close(solids.getState().position.y,2);
const solidBefore=solids.getState();assert.throws(()=>solids.setPose(pose(5,3)),TypeError);assert.equal(solids.getState(),solidBefore);
solids.setInput({strafe:1,lift:1});for(let i=0;i<180;i++){const state=solids.step(1/60);assert.equal(solidBox({position:state.position}),false);}assert.ok(solids.getState().position.x>10,'Lift out of a side obstacle remains possible');
const roof=({position:p})=>Math.abs(p.x)<4&&Math.abs(p.z)<4&&p.y+2>10&&p.y-2<12;
const underRoof=createPilotController({minClearance:1,startPose:pose(0,2),isPoseBlocked:roof});underRoof.setInput({lift:1});advance(underRoof,2);assert.ok(underRoof.getState().position.y<=8+1e-8);assert.equal(underRoof.getState().blocked.obstacle,true);underRoof.setInput({lift:1,strafe:1});advance(underRoof,2);assert.ok(underRoof.getState().position.x>4&&underRoof.getState().position.y>15,'A roof stops rise but does not lock horizontal escape');
const solidTurn=createPilotController({minClearance:1,bodyRadius:12,startPose:pose(0,2),isPoseBlocked:({heading})=>heading>=.2&&heading<=.25,speed:{turn:240},acceleration:{turn:10000}});solidTurn.setInput({turn:1});solidTurn.step(.1);assert.ok(solidTurn.getState().heading<=.2+1e-8);assert.equal(solidTurn.getState().blocked.obstacle,true);assert.equal(solidTurn.getState().blocked.rotation,true);
const sweptSolid=createPilotController({minClearance:1,startPose:pose(0,2),isPoseBlocked:({position:p})=>p.z<-.5&&p.z>-.9,speed:{horizontal:480},acceleration:{horizontal:10000},sweepSpacing:.05});sweptSolid.setInput({forward:1});sweptSolid.step(.1);assert.ok(sweptSolid.getState().position.z>=-.5-1e-8,'A narrow solid is checked along travel, not just at endpoints');

const bodySecond=fps=>{const pilot=createPilotController({...volumeOptions,startPose:pose(-40,5)});pilot.setInput({forward:.8,strafe:.3,lift:.4,turn:.5});return advance(pilot,1,fps);};
assert.deepEqual(bodySecond(30),bodySecond(60));assert.deepEqual(bodySecond(120),bodySecond(60));
const bodyLarge=createPilotController(volumeOptions),bodySmall=createPilotController(volumeOptions);bodyLarge.setInput({turn:1,strafe:1});bodySmall.setInput({turn:1,strafe:1});bodyLarge.step(100);bodySmall.step(.1);assert.deepEqual(bodyLarge.getState(),bodySmall.getState(),'Large body dt is capped without bypassing collision sweeps');
let invalidEnvelope=false,invalidSolid=false;
const callbackPilot=createPilotController({minClearance:1,startPose:pose(0,2),terrainEnvelope:query=>{assert.ok(Object.isFrozen(query));return invalidEnvelope?NaN:1;},isPoseBlocked:query=>{assert.ok(Object.isFrozen(query)&&Object.isFrozen(query.position));return invalidSolid?undefined:false;}});
callbackPilot.setInput({forward:1});callbackPilot.step(.001);const callbackBefore=callbackPilot.getState();invalidEnvelope=true;assert.throws(()=>callbackPilot.step(.02),TypeError);assert.equal(callbackPilot.getState(),callbackBefore);assert.throws(()=>callbackPilot.setPose(pose()),TypeError);assert.equal(callbackPilot.getState(),callbackBefore);invalidEnvelope=false;invalidSolid=true;assert.throws(()=>callbackPilot.step(.02),TypeError);assert.equal(callbackPilot.getState(),callbackBefore);invalidSolid=false;callbackPilot.step(.02);
const callbackControl=createPilotController({minClearance:1,startPose:pose(0,2),terrainEnvelope:()=>1,isPoseBlocked:()=>false});callbackControl.setInput({forward:1});callbackControl.step(.001);callbackControl.step(.02);assert.deepEqual(callbackPilot.getState(),callbackControl.getState(),'Bad callbacks do not consume fractional time, velocity or input');
for(const invalid of [{terrainEnvelope:1},{terrainEnvelope:()=>Infinity},{isPoseBlocked:()=>null},{bodyRadius:-1},{bodyRadius:580},{isPoseBlocked:null}])assert.throws(()=>createPilotController(invalid),TypeError);
normal.destroy();const last=normal.getState();assert.equal(last.speed,0);normal.destroy();for(const action of [()=>normal.step(.1),()=>normal.setInput({}),()=>normal.clearInput(),()=>normal.setPose(pose()),()=>normal.reset(),()=>normal.setEnabled(true)])assert.throws(action,Error);assert.equal(normal.getState(),last);

console.log(JSON.stringify({passed:true,checks:['30/60/120 FPS and irregular normal elapsed-time equivalence','bounded acceleration, braking and diagonal speed','immediate blur/disable stop without sticky controls','gentle slope following; canyon cliff stops without auto-climbing','explicit lift crosses cliff; narrow swept ridge blocks tunneling','horizontal bounds, wall sliding, clearance and ceiling','large delta cap and transactional invalid inputs/terrain failure','strict frozen pose URL codec and safe restoration','immutable reset pose and non-ocean reuse','whole-body side/arm translation and intermediate rotation collision','blocked turn preserves legal lift/translation; roof preserves sideways escape','solid prop, narrow swept obstacle and rotational solid collision','body-radius bounds and flagged, stopped pose correction','impossible restore and invalid callbacks reject atomically','body-mode frame independence and large-dt cap']},null,2));
