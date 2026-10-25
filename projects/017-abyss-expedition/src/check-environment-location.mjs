// SPDX-License-Identifier: GPL-3.0-only
// Run: node src/check-environment-location.mjs
import assert from 'node:assert/strict';
import {describeEnvironmentPosition as describe} from '../web/core/environment-location.mjs';

const state=(x,y,z,clearance,nearest)=>({position:{x,y,z},clearance,nearest});
const current=Object.freeze({position:Object.freeze({x:170.6,y:-205.4,z:204.6}),clearance:18,nearest:Object.freeze({label:'深谷通道',distance:138.3})});
const snapshot=JSON.stringify(current),location=describe('canyon',current);
assert.equal(location.label,'东侧谷道回弯 · 近底坡脚上方');
assert.ok(location.detail.includes('仍有一段距离'));
assert.ok(!/裂缝|已到达|已经到达|测深|米/.test(location.label+location.detail));
assert.equal(JSON.stringify(current),snapshot,'The location helper must not mutate piloting state');

for(const high of [state(170.6,-40,204.6,180),state(170.6,200,204.6,18)]){
  const info=describe('canyon',high);assert.ok(info.label.includes('离底较高'));assert.ok(!/谷底|近底|海绵/.test(info.label+info.detail));
}
const detached=describe('canyon',state(170,-100,205,85));assert.ok(detached.label.includes('离底观察'));assert.ok(!detached.label.includes('坡脚上方'));
const noClearance=describe('canyon',state(170,-205,205));assert.ok(noClearance.label.includes('模型位置'));assert.ok(!noClearance.label.includes('近底'));
const upperTerrace=describe('canyon',state(56,25,174,20,{label:'海绵花园',distance:28}));assert.ok(upperTerrace.label.includes('台阶区'));assert.ok(!upperTerrace.label.includes('谷底'));
const underTerrace=describe('canyon',state(56,-205,174,18));assert.ok(!/海绵|台面附近/.test(underTerrace.label));

const nearby=describe('canyon',state(180,-205,68,21,{label:'深谷通道',distance:24}));assert.ok(nearby.detail.includes('邻近模型标记'));assert.ok(!/已到达|已经到达/.test(nearby.detail));
const distant=describe('canyon',state(180,-205,68,21,{label:'遥远的群落',distance:400}));assert.ok(!distant.detail.includes('遥远的群落'));
for(const nearest of [{label:'群落',distance:NaN},{label:'群落',distance:Infinity},{label:'群落',distance:-1},{label:'群落',distance:'20'},{label:'',distance:5}])assert.ok(!describe('canyon',state(180,-205,68,21,nearest)).detail.includes('群落'));
for(const mission of ['canyon','vents']){
  for(const x of [500,580,900,-580]){const info=describe(mission,state(x,-205,205,18,{label:'海绵花园',distance:5}));assert.ok(info.label.includes('外缘'));assert.ok(!/海绵|珊瑚|喷口群/.test(info.label+info.detail));}
}

assert.ok(describe('canyon',state(-136,-168,74,21)).label.includes('西侧峡壁'));
assert.ok(describe('canyon',state(31,-220,-180,20)).label.includes('北侧谷道回弯'));
assert.ok(describe('vents',state(-50,-27,19,21)).label.includes('喷口群附近'));
assert.ok(!describe('vents',state(-50,100,19,148)).label.includes('喷口群附近'));
assert.ok(!describe('vents',state(380,-50,300,21,{label:'热液喷口',distance:500})).label.includes('喷口群附近'));
assert.ok(describe('vents',state(192,-30,-50,21)).label.includes('低火山脊'));
assert.ok(describe('vents',state(-140,-35,75,21)).label.includes('裂隙带'));

for(const input of [undefined,null,{},[],{position:[]},{position:{x:'170',y:0,z:0}},{position:{x:Infinity,y:0,z:0}},{position:{x:0,y:NaN,z:0}}])assert.equal(describe('canyon',input).label,'位置待确认');
assert.equal(describe('other',state(0,0,0,18)).label,'教学场景');
assert.ok(!/真实水深|化验结果|导致|米/.test(location.label+location.detail));
console.log(JSON.stringify({passed:true,checks:['current canyon bend and near-bottom relation','high clearance and upper-terrace guards','nearby marker distance thresholds','exploration-edge fallback','vent regions without false arrival','finite input and no mutation'],current:location.label}));
