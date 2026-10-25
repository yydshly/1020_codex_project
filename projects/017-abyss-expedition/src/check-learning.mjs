// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {createSamplingSession,validateSamplingConfig} from '../web/core/learning-core.mjs';

const config=(id='vents',nearKind='water',farKind='water')=>({id,sites:{near:{id:`${id}-near`,label:'近处观察位置',kind:nearKind},far:{id:`${id}-far`,label:'远处对照位置',kind:farKind}}});
let storageReads=0,storageWrites=0;
const personalStore={getItem(){storageReads++;throw new Error('Personal store must not be read');},setItem(){storageWrites++;throw new Error('Personal store must not be written');},removeItem(){storageWrites++;throw new Error('Personal store must not be cleared');}};
globalThis.localStorage=personalStore;globalThis.sessionStorage=personalStore;
try{
  const input=config(),notifications=[];
  assert.equal(validateSamplingConfig(input),true);
  const session=createSamplingSession(input,{onChange:(state,event)=>notifications.push({state,event})});
  const empty=session.getState();assert.deepEqual(empty,{missionId:'vents',samples:{near:null,far:null},comparisonUnlocked:false});
  assert.ok(Object.isFrozen(empty)&&Object.isFrozen(empty.samples));assert.equal(notifications.length,0);
  input.id='changed';input.sites.near.label='mutated';input.sites.far.kind='soil';
  const near=session.collect('near');assert.equal(near.missionId,'vents');assert.deepEqual(near.samples.near,{id:'vents-near',site:'近处观察位置',kind:'water',teachingSimulation:true});assert.equal(near.comparisonUnlocked,false);
  assert.ok(Object.isFrozen(near.samples.near));assert.throws(()=>{near.samples.near.site='bad';},TypeError);
  assert.equal(empty.samples.near,null,'Earlier snapshots remain unchanged');
  assert.equal(session.collect('near'),near);assert.equal(notifications.length,1,'Duplicate collection is idempotent');
  const both=session.collect('far');assert.equal(both.samples.far.kind,'water','Session owns its configuration snapshot');assert.equal(both.comparisonUnlocked,true);assert.equal(notifications.length,2);
  assert.ok(notifications.every(({state,event})=>Object.isFrozen(state)&&Object.isFrozen(event)));
  for(const position of ['',null,undefined,0,{},'Near','near ',['near']]){const before=session.getState();assert.throws(()=>session.collect(position),TypeError);assert.equal(session.getState(),before);}
  const beforeBadSubscribe=session.getState();assert.throws(()=>session.subscribe(null),TypeError);assert.equal(session.getState(),beforeBadSubscribe);
  let updates=0;const unsubscribe=session.subscribe(()=>updates++);session.reset();assert.equal(updates,1);assert.equal(session.getState().comparisonUnlocked,false);unsubscribe();const reset=session.getState();assert.equal(session.reset(),reset);session.collect('far');assert.equal(updates,1);
  assert.equal(both.comparisonUnlocked,true,'Reset must not mutate an old summary');
  session.destroy();session.destroy();const destroyed=session.getState();assert.throws(()=>session.collect('near'),Error);assert.throws(()=>session.reset(),Error);assert.throws(()=>session.subscribe(()=>{}),Error);assert.equal(session.getState(),destroyed);

  const mismatch=createSamplingSession(config('canyon','water','sediment'));mismatch.collect('near');mismatch.collect('far');assert.equal(mismatch.getState().comparisonUnlocked,false,'Two unlike sample categories cannot unlock a comparison');
  const other=createSamplingSession(config('canyon'));other.collect('far');other.collect('near');assert.equal(other.getState().comparisonUnlocked,true,'Collection order is not significant');
  const reopened=createSamplingSession(config('canyon'));assert.deepEqual(reopened.getState().samples,{near:null,far:null},'A reopened lesson starts empty rather than importing personal records');
  const campaign=createSamplingSession({id:'warehouse-inspection',sites:{near:{id:'rack-a',label:'入口货架',kind:'surface-scan'},far:{id:'rack-b',label:'内侧货架',kind:'surface-scan'}}});campaign.collect('near');campaign.collect('far');assert.equal(campaign.getState().comparisonUnlocked,true);assert.equal(campaign.getState().samples.near.kind,'surface-scan');
  const defaults=createSamplingSession({id:'simple',sites:{near:{id:'a',label:'A'},far:{id:'b',label:'B'}}});assert.equal(defaults.collect('near').samples.near.kind,'water');
  const getter={id:'getter',sites:{near:{id:'a',label:'A'},far:{id:'b',label:'B'}}};Object.defineProperty(getter.sites.near,'kind',{get(){throw new Error('Should not invoke getter');}});
  for(const invalid of [
    null,[],{},config(' '),{...config(),sites:null},{...config(),sites:{near:{id:'a',label:'A'}}},
    {id:'x',sites:{near:{id:'same',label:'A'},far:{id:'same',label:'B'}}},
    {id:'x',sites:{near:{id:'a',label:''},far:{id:'b',label:'B'}}},
    config('x','', 'water'),config('x','water',null),getter,
  ])assert.throws(()=>createSamplingSession(invalid),TypeError);
  assert.throws(()=>createSamplingSession(config(),{onChange:'bad'}),TypeError);
  assert.equal(storageReads,0);assert.equal(storageWrites,0);
}finally{delete globalThis.localStorage;delete globalThis.sessionStorage;}

console.log(JSON.stringify({passed:true,personalStorageReads:storageReads,personalStorageWrites:storageWrites,nonOceanFixture:'warehouse surface-scan comparison',checks:['two positions and same-category comparison','order independent and duplicate idempotence','frozen owned snapshots','invalid operations are atomic','reset and fresh session remain ephemeral','subscription and destroy lifecycle']},null,2));
