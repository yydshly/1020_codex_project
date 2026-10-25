// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {createDirector,validateShots} from '../web/core/director-core.mjs';

const shot = (id, duration, extra = {}) => ({id,duration,entityId:`entity-${id}`,eventId:`event-${id}`,framing:'detail',title:`Title ${id}`,narration:`Narration ${id}`,...extra});
const input = [shot('arrival',1,{camera:{offset:[10,20,30]}}),shot('discovery',2),shot('return',.5)];
assert.equal(validateShots(input),true);
const changes = [], director = createDirector(input,{onChange:(view,action)=>changes.push({view,action})});
input[0].camera.offset[0] = 900; input[0].title = 'mutated';input.push(shot('extra',99));
let view = director.getView();
assert.deepEqual([view.active,view.playing,view.completed,view.index,view.elapsed,view.duration],[false,false,false,0,0,3.5]);
assert.equal(view.shots.length,3);assert.equal(view.shot.camera.offset[0],10);assert.equal(view.shot.title,'Title arrival');
assert.ok(Object.isFrozen(view) && Object.isFrozen(view.shots) && Object.isFrozen(view.shot.camera.offset));
assert.throws(()=>view.shot.camera.offset.push(4),TypeError);
assert.equal(changes.length,0,'Creating/subscribing does not implicitly render an initial notification');
assert.equal(director.tick(.2),view,'Inactive clocks do not advance');

director.enter();
assert.equal(director.getView().active,true);assert.equal(director.getView().playing,true);
director.tick(.2);assert.equal(director.getView().elapsed,.2);
director.tick(6000);assert.equal(director.getView().elapsed,.45,'Suspension delta is capped, not caught up');
director.pause();const paused = director.getView();assert.equal(director.tick(.2),paused);
director.seek(.8);assert.equal(director.getView().playing,false,'Seeking preserves paused state');
director.play();director.tick(.2);
view=director.getView();assert.equal(view.index,1);assert.equal(view.shotElapsed,0);assert.equal(view.shotProgress,0,'A boundary belongs to the following shot');
director.seek(2);view=director.getView();assert.equal(view.index,1);assert.equal(view.shotElapsed,1);assert.equal(view.shotProgress,.5);
director.next();assert.equal(director.getView().index,2);assert.equal(director.getView().elapsed,3);
director.previous();assert.equal(director.getView().index,1);assert.equal(director.getView().elapsed,1);
director.seekShot(2);director.tick(.25);director.tick(.25);
view=director.getView();assert.deepEqual([view.active,view.playing,view.completed,view.index,view.shotElapsed,view.shotProgress,view.progress],[true,false,true,2,.5,1,1]);
assert.equal(director.tick(.25),view,'Completion does not loop');
director.previous();assert.equal(director.getView().index,2,'Back from the ending returns to the final shot');assert.equal(director.getView().elapsed,3);
director.next();director.play();assert.equal(director.getView().elapsed,0,'Replay restarts a completed film');assert.equal(director.getView().playing,true);
director.enter({index:1,playing:false});assert.equal(director.getView().elapsed,1);assert.equal(director.getView().playing,false);
director.exit();view=director.getView();assert.equal(view.active,false);assert.equal(view.playing,false);assert.equal(view.elapsed,1,'Exit retains the scrub cursor');
director.play();assert.equal(director.getView().active,true);assert.equal(director.getView().elapsed,1);
director.seek(0);director.previous();assert.equal(director.getView().elapsed,0);

let notified = 0; const unsubscribe = director.subscribe(()=>notified++);
director.seek(.2);assert.equal(notified,1);unsubscribe();director.seek(.3);assert.equal(notified,1);
assert.ok(changes.every(({view,action})=>Object.isFrozen(view)&&Object.isFrozen(action)));
assert.ok(changes.some(({action})=>action.type==='NEXT'));

// Every invalid mutation must leave the already-published state untouched.
const beforeInvalid = director.getView();
for(const operation of [
  ()=>director.tick(-1),()=>director.tick(NaN),()=>director.tick(Infinity),()=>director.tick('1'),
  ()=>director.seek(-.01),()=>director.seek(3.51),()=>director.seek(NaN),()=>director.seek('0'),
  ()=>director.seekShot(-1),()=>director.seekShot(3),()=>director.seekShot(.5),()=>director.seekShot('0'),
  ()=>director.enter({index:99}),()=>director.enter({playing:'yes'}),()=>director.enter({unknown:true}),()=>director.enter(null),
  ()=>director.subscribe(null),
]) { assert.throws(operation,TypeError);assert.equal(director.getView(),beforeInvalid); }

const cycle={};cycle.self=cycle;
const sparse=[shot('a',1),,shot('c',1)];
for(const invalid of [
  null,{},[],sparse,[shot('a',0)],[shot('a',-1)],[shot('a',NaN)],[shot('a',Infinity)],
  [shot('a',1),shot('a',2)],[shot(' a',1)], [shot('a',1,{title:' '})],
  [shot('a',1,{narration:undefined})],[shot('a',1,{framing:''})],[shot('a',1,{eventId:4})],
  [shot('a',1,{camera:cycle})],[shot('a',1,{callback:()=>{}})],[shot('a',1,{metadata:new Date()})],
  [shot('a',1,{symbol:Symbol('unsupported')})],[shot('a',1,{offset:[NaN]})],
  [shot('a',Number.MAX_VALUE),shot('b',Number.MAX_VALUE)],
]) assert.throws(()=>createDirector(invalid),TypeError);
assert.throws(()=>createDirector([shot('a',1)],{maxDelta:0}),TypeError);
assert.throws(()=>createDirector([shot('a',1)],{onChange:'invalid'}),TypeError);

const decimals=createDirector([shot('a',.1),shot('b',.2),shot('c',.3)]);
decimals.seek(.3);assert.equal(decimals.getView().index,2,'Representational drift does not misclassify a decimal boundary');
decimals.seek(.3-1e-6);assert.equal(decimals.getView().index,1,'A meaningful pre-boundary interval is preserved');

// Reuse without an ocean: the same clock drives a warehouse inspection film.
const warehouse=createDirector([
  shot('loading-bay',4,{entityId:'door-07',eventId:'truck-arrival',framing:'wide'}),
  shot('packing-line',6,{entityId:'belt-02',eventId:'package-scanned',framing:'tracking'}),
],{maxDelta:1});
warehouse.enter();warehouse.tick(4);assert.equal(warehouse.getView().elapsed,1);
warehouse.seekShot(1);assert.equal(warehouse.getView().shot.entityId,'belt-02');warehouse.seek(10);
assert.equal(warehouse.getView().completed,true);assert.equal(warehouse.getView().active,true);
director.destroy();director.destroy();assert.equal(director.getView(),beforeInvalid);
assert.throws(()=>director.enter(),Error);assert.throws(()=>director.tick(.1),Error);assert.throws(()=>director.subscribe(()=>{}),Error);

console.log(JSON.stringify({passed:true,version:1,nonOceanFixture:'warehouse inspection film',checks:[
  'owned frozen storyboard and snapshots','half-open shot boundaries and decimal drift',
  'paused/inactive clock','bounded suspension delta','seek and chapter navigation',
  'completion without looping and explicit replay','atomic invalid operations',
  'subscription lifecycle','domain-independent fixture',
]},null,2));
