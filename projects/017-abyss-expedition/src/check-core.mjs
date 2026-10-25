// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createExplorer,validateDataset,resolvePhase} from '../web/core/temporal-core.mjs';
import {createEntityIndex} from '../web/core/entity-index.mjs';
import {interpolateTrack,validateTrack} from '../web/core/track.mjs';
import {createLatestTask} from '../web/core/latest-task.mjs';

const read = relative => readFile(new URL(relative, import.meta.url));
const missions = await Promise.all(['vents','canyon'].map(async id => JSON.parse(await read(`../web/data/${id}.json`))));
const course = {
  id:'course',title:'课程实践',min:0,max:10,
  phases:[{id:'read',label:'阅读',from:0,to:4},{id:'practice',label:'练习',from:4,to:8},{id:'review',label:'复习',from:8,to:11}],
  entities:[{id:'chapter',label:'课程章节',position:[.1,.2],aliases:['第一课']},{id:'exercise',label:'动手练习',position:[.8,.7],aliases:['实践']}],
  events:[{id:'open',time:0,entityId:'chapter',title:'阅读',detail:''},{id:'build',time:4,entityId:'exercise',title:'完成练习',detail:''},{id:'review',time:8,entityId:'chapter',title:'复习',detail:''}],
};

for (const dataset of [...missions,course]) {
  assert.equal(validateDataset(dataset),true);
  const explorer = createExplorer(dataset);
  const index = createEntityIndex(dataset.entities);
  const before = explorer.getState();
  assert.equal(index.resolve('unregistered'),null);
  assert.equal(explorer.getState(),before,'Read-only queries must not alter navigation');
  for (const entity of dataset.entities) {
    assert.equal(index.resolve(entity.id).id,entity.id);
    for (const alias of entity.aliases || []) assert.equal(index.resolve(alias)?.id,entity.id);
  }
  for (const phase of dataset.phases) {
    assert.equal(resolvePhase(dataset.phases,phase.from).id,phase.id);
    assert.equal(resolvePhase(dataset.phases,phase.to - .001).id,phase.id);
  }
  for (const event of dataset.events) {
    const fromEvent = explorer.dispatch({type:'SELECT_EVENT',id:event.id});
    assert.equal(fromEvent.state.time,event.time);
    assert.equal(fromEvent.activeEntity.id,event.entityId);
    const byEntity = index.resolve(fromEvent.activeEntity.id);
    assert.equal(byEntity.id,event.entityId);
    assert.equal(fromEvent.visitedEvents.at(-1).time,event.time);
  }
  explorer.dispatch({type:'SET_LAYER',layer:'labels',visible:false});
  explorer.dispatch({type:'SET_PLAYING',playing:true});
  const restored = createExplorer(dataset);
  restored.restore(explorer.encode());
  assert.deepEqual(restored.getState(),{...explorer.getState(),playing:false});
  const stable = restored.getState();
  for (const invalid of [
    `dataset=${dataset.id}&time=${dataset.max+1}`,
    `dataset=${dataset.id}&time=0&event=unknown`,
    `dataset=another&time=0`,
    `dataset=${dataset.id}&time=0&time=1`,
  ]) { assert.throws(()=>restored.restore(invalid)); assert.equal(restored.getState(),stable); }
  explorer.dispatch({type:'SET_PLAYING',playing:true});
  explorer.dispatch({type:'NEXT'});
  assert.equal(explorer.getState().playing,false);
  explorer.destroy();restored.destroy();
}

for (const dataset of missions) {
  assert.equal(validateTrack(dataset.frames),true);
  assert.ok(dataset.entities.filter(entity => entity.sample).length>=4);
  for (const frame of dataset.frames) {
    const value = interpolateTrack(dataset.frames,frame.time);
    assert.deepEqual(value.position,frame.position);
    assert.equal(value.depth,frame.depth);
  }
  assert.equal(interpolateTrack(dataset.frames,-999).time,0);
  assert.equal(interpolateTrack(dataset.frames,999).time,dataset.max);
  const middle = (dataset.frames[1].time + dataset.frames[2].time) / 2;
  const result = interpolateTrack(dataset.frames,middle);
  assert.equal(result.depth,(dataset.frames[1].depth + dataset.frames[2].depth)/2);
  assert.equal(result.battery,(dataset.frames[1].battery + dataset.frames[2].battery)/2);
  assert.throws(()=>{ result.position[0] = .99; });
}

// A warehouse track proves interpolation is not coupled to ocean telemetry keys.
const genericTrack = [{time:0,position:[0,0],load:4,speed:2},{time:10,position:[1,.5],load:8,speed:6}];
assert.deepEqual(interpolateTrack(genericTrack,5),{time:5,position:[.5,.25],load:6,speed:4});
for (const malformed of [[],[{time:0,position:[0,0]},{time:0,position:[1,1]}],[{time:0,position:[0,2]}],[{time:0,position:[0,0],load:1},{time:1,position:[1,1],load:NaN}],[{time:0,position:[0,0],load:1},{time:1,position:[1,1],speed:2}]]) assert.throws(()=>validateTrack(malformed));
assert.throws(()=>interpolateTrack(genericTrack,NaN));

const aliasIndex = createEntityIndex([
  {id:'a',label:'样本甲',aliases:['共同名称','ALPHA'],description:'深海观察'},
  {id:'b',label:'样本乙',aliases:['共同名称'],description:'课程观察'},
]);
assert.equal(aliasIndex.resolve('共同名称'),null,'Ambiguous aliases must not silently select an entity');
assert.equal(aliasIndex.resolve(' alpha ').id,'a');
assert.equal(aliasIndex.search('甲')[0].id,'a');
assert.equal(aliasIndex.search('课程')[0].id,'b');
assert.deepEqual(aliasIndex.search('未收录内容'),[]);
assert.equal(aliasIndex.search('').length,2);
assert.equal(aliasIndex.search('共同名称',1).length,1);
assert.throws(()=>aliasIndex.search('x',-1));
assert.throws(()=>createEntityIndex([{id:'a',label:'甲'},{id:'a',label:'乙'}]));

const deferred = () => { let resolve,reject; const promise = new Promise((yes,no) => {resolve=yes;reject=no;});return {promise,resolve,reject}; };
const latest = createLatestTask(), commits=[], errors=[];
const slow = deferred(), fast = deferred();
const first = latest.run(()=>slow.promise,value=>commits.push(value),error=>errors.push(error.message));
const second = latest.run(()=>fast.promise,value=>commits.push(value),error=>errors.push(error.message));
fast.resolve('latest mission');await second;slow.resolve('outdated mission');
assert.equal((await first).status,'stale');assert.deepEqual(commits,['latest mission']);
const staleFailure = deferred();
const failureRun = latest.run(()=>staleFailure.promise,value=>commits.push(value),error=>errors.push(error.message));
await latest.run(async()=>'next selection',value=>commits.push(value),error=>errors.push(error.message));
staleFailure.reject(new Error('obsolete failure'));await failureRun;assert.deepEqual(errors,[]);
assert.equal((await latest.run(async()=>{throw new Error('current failure');},()=>{},error=>errors.push(error.message))).status,'error');
assert.deepEqual(errors,['current failure']);
const invalidated = deferred(), invalidatedRun = latest.run(()=>invalidated.promise,value=>commits.push(value));
latest.invalidate();invalidated.resolve('invalidated');assert.equal((await invalidatedRun).status,'stale');
latest.destroy();await assert.rejects(latest.run(async()=>0,()=>{}));

const core = await read('../web/core/temporal-core.mjs');
const previousCore = await read('../../015-jiangshan-atlas/web/lab/temporal-core.mjs');
assert.equal(core.equals(previousCore),true,'015 reusable core must remain byte-identical');
console.log(JSON.stringify({passed:true,actualMissions:missions.length,nonOceanFixture:'course + warehouse track',coreSource:'015/web/lab/temporal-core.mjs',sha256:createHash('sha256').update(core).digest('hex'),checks:['phase boundaries','entity aliases and ambiguity','event/time/entity synchronization','strict URL round trip','bounded playback','numeric track interpolation and endpoint clamps','invalid data rejection','latest request wins','stale failure suppression','byte-identical prior module reuse']},null,2));
