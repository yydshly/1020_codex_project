// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {encodeCameraState,decodeCameraState,validateCameraState,isSameCameraState} from '../web/core/camera-state.mjs';

const home = {position:[485,400,535],target:[0,-30,0],mode:'overview'};
const frozenHome = Object.freeze({position:Object.freeze([...home.position]),target:Object.freeze([...home.target]),mode:home.mode});
assert.equal(validateCameraState(frozenHome),true);
const initialText = JSON.stringify(frozenHome);
assert.equal(encodeCameraState(frozenHome),'v1:overview:485,400,535:0,-30,0');
assert.equal(JSON.stringify(frozenHome),initialText,'Validation and encoding must not mutate their caller');
assert.deepEqual(decodeCameraState(encodeCameraState(home)),home);
assert.notEqual(decodeCameraState(encodeCameraState(home)).position,home.position);

for (const mode of ['overview','follow','top']) {
  const input = {position:[385.234,-60.941,221.876],target:[15.127,-25.248,12.502],mode};
  const snapshot = structuredClone(input);
  const encoded = encodeCameraState(input), decoded = decodeCameraState(encoded);
  assert.equal(decoded.mode,mode);
  assert.equal(isSameCameraState(input,decoded,.051),true);
  assert.equal(encodeCameraState(decoded),encoded,'Canonical encoding must remain stable');
  assert.deepEqual(input,snapshot);
}

const negativeZero = decodeCameraState('v1:top:0,100,-0:0,-0,0');
assert.equal(Object.is(negativeZero.position[2],-0),false);
assert.equal(encodeCameraState(negativeZero),'v1:top:0,100,0:0,0,0');
// Repeated axis values are valid (e.g. a top-down camera). Repeated fields are not.
assert.equal(validateCameraState({position:[0,10,0],target:[0,0,0],mode:'top'}),true);
assert.equal(validateCameraState({position:[2500,0,0],target:[0,0,0],mode:'overview'}),true);
assert.equal(validateCameraState({position:[5000,0,0],target:[4990,0,0],mode:'overview'}),true);

const sparse = new Array(3);sparse[0]=0;sparse[2]=100;
const decorated = [0,0,100];decorated.extra=1;
const withSymbol = {...home,[Symbol('hidden')]:true};
for (const state of [
  null,[],{},'overview',
  {...home,extra:true},{...home,version:1},withSymbol,
  {...home,mode:'OVERVIEW'},{...home,mode:'orbit'},{...home,mode:'overview:follow'},
  {...home,position:[0,0]},{...home,position:[0,0,100,0]},{...home,position:[[0],0,100]},
  {...home,position:sparse},{...home,position:decorated},{...home,position:['0',0,100]},
  {...home,position:[NaN,0,100]},{...home,position:[Infinity,0,100]},{...home,position:[-Infinity,0,100]},
  {...home,position:[5000.1,0,100]},
  {position:[0,0,0],target:[0,0,0],mode:'overview'},
  {position:[0,0,9.99],target:[0,0,0],mode:'overview'},
  {position:[0,0,2500.01],target:[0,0,0],mode:'overview'},
  Object.assign(Object.create({inherited:true}),home),
]) { assert.throws(()=>validateCameraState(state),TypeError);assert.throws(()=>encodeCameraState(state),TypeError); }

const invalidRaw = [
  null,{},[],0,'','x'.repeat(129),'v2:overview:0,0,100:0,0,0',
  'v1:OVERVIEW:0,0,100:0,0,0','v1:orbit:0,0,100:0,0,0',
  'v1:overview:0,0,100:0,0,0:0,0,0', // duplicated target segment
  'v1:overview:0,0,100:0,0,0:mode=follow',
  'v1:overview:0,0,100,100:0,0,0','v1:overview:0,0:0,0,0',
  'v1:overview:[0,0,100]:0,0,0','v1:overview:0,,100:0,0,0',
  'v1:overview:0,0,NaN:0,0,0','v1:overview:0,0,Infinity:0,0,0',
  'v1:overview:0,0,1e2:0,0,0','v1:overview:0,0,0100:0,0,0',
  'v1:overview:0,0,+100:0,0,0','v1:overview:0,0,100.01:0,0,0',
  'v1:overview:0,0,100 :0,0,0',' v1:overview:0,0,100:0,0,0',
  'v1:overview:0,0,5001:0,0,4000','v1:overview:0,0,5:0,0,0',
  'v1:overview:0,0,2600:0,0,0',
  '{"position":[0,0,100],"target":[0,0,0],"mode":"top","mode":"follow"}',
  'v1:__proto__:0,0,100:0,0,0','v1:overview:0,0,100:0,0,<script>',
];
let current = decodeCameraState(encodeCameraState(home));
const originalCurrent = current;
for (const raw of invalidRaw) {
  assert.throws(()=>{ current = decodeCameraState(raw); },TypeError);
  assert.equal(current,originalCurrent,'Invalid decoding must not replace the last valid snapshot');
}
assert.equal(Object.isFrozen(current),true);
assert.equal(Object.isFrozen(current.position),true);
assert.equal(Object.isFrozen(current.target),true);
assert.throws(()=>{current.position[0]=0;},TypeError);
assert.throws(()=>{current.mode='top';},TypeError);

const close = {position:[485.1,400.1,535.1],target:[.1,-29.9,.1],mode:'overview'};
assert.equal(isSameCameraState(home,close),true);
assert.equal(isSameCameraState(home,close,.05),false);
assert.equal(isSameCameraState(home,{...home,mode:'follow'}),false);
assert.equal(isSameCameraState(home,home,0),true);
for (const tolerance of [-1,NaN,Infinity,'0.1']) assert.throws(()=>isSameCameraState(home,home,tolerance),TypeError);
assert.throws(()=>isSameCameraState(home,null),TypeError);

// Quantization cannot silently widen the permitted range. Extremely near-boundary
// inputs whose rounded distance leaves 10..2500 fail serialization atomically.
const nearBoundary = {position:[7.04,7.11,0],target:[0,0,0],mode:'overview'};
assert.equal(validateCameraState(nearBoundary),true);
const boundaryBefore = structuredClone(nearBoundary);
assert.throws(()=>encodeCameraState(nearBoundary),TypeError,'Rounding to [7,7.1,0] must not serialize a distance below 10');
assert.deepEqual(nearBoundary,boundaryBefore);

console.log(JSON.stringify({passed:true,version:'v1',coordinateQuantum:.1,coordinateLimit:5000,distanceRange:[10,2500],checks:['canonical round trip for all modes','quantization without mutation','strict fields and vector shape','non-finite and out-of-range rejection','version and duplicate-segment rejection','atomic invalid restore','frozen owned snapshots','mode-aware component tolerance']},null,2));
