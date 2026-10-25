// SPDX-License-Identifier: GPL-3.0-only
// Behavioral checks for the new reusable exercise, independent of atlas data.
import assert from 'node:assert/strict';
import {validateDataset,resolvePhase,createExplorer} from '../web/lab/temporal-core.mjs';
import {datasets} from '../web/lab/datasets.mjs';

const logistics = {
  id:'delivery',title:'示例包裹流转',min:0,max:8,
  phases:[{id:'collect',from:0,to:3,label:'集货'},{id:'transit',from:3,to:6,label:'干线运输'},{id:'deliver',from:6,to:9,label:'配送'}],
  entities:[{id:'warehouse',label:'仓库',position:[.1,.4]},{id:'hub',label:'分拨中心',position:[.5,.2]},{id:'customer',label:'收件点',position:[.9,.6]}],
  events:[
    {id:'packed',time:0,entityId:'warehouse',title:'打包',detail:'虚构练习数据'},
    {id:'arrived',time:3,entityId:'hub',title:'到达分拨',detail:'虚构练习数据'},
    {id:'sorted',time:3,entityId:'hub',title:'完成分拣',detail:'相同时间的不同事件'},
    {id:'received',time:8,entityId:'customer',title:'签收',detail:'虚构练习数据'},
  ],
};
const software = {
  id:'release',title:'示例软件迭代',min:1,max:12,
  phases:[{id:'discovery',from:1,to:5,label:'调研'},{id:'implementation',from:5,to:10,label:'开发'},{id:'rollout',from:10,to:13,label:'发布'}],
  entities:[{id:'research',label:'用户研究',position:[.1,.5]},{id:'dev',label:'开发团队',position:[.5,.5]},{id:'release',label:'发布流程',position:[.9,.5]}],
  events:[
    {id:'brief',time:1,entityId:'research',title:'明确需求',detail:''},
    {id:'prototype',time:5,entityId:'dev',title:'原型可用',detail:''},
    {id:'review',time:9,entityId:'dev',title:'验收',detail:''},
    {id:'ship',time:12,entityId:'release',title:'上线',detail:''},
  ],
};

for (const dataset of [logistics,software,...Object.values(datasets)]) {
  assert.equal(validateDataset(dataset),true);
  const explorer = createExplorer(dataset);
  for (const phase of dataset.phases) assert.equal(resolvePhase(dataset.phases,phase.from).id,phase.id);
  assert.equal(resolvePhase(dataset.phases,dataset.max + 1),null);
  for (const event of dataset.events) {
    const view = explorer.dispatch({type:'SELECT_EVENT',id:event.id});
    assert.equal(view.state.time,event.time);
    assert.equal(view.selectedEvent.id,event.id);
    assert.equal(view.activeEntity.id,event.entityId);
    assert.ok(view.visitedEvents.every(e => e.time <= event.time));
  }
  explorer.dispatch({type:'SET_LAYER',layer:'route',visible:false});
  explorer.dispatch({type:'SET_PLAYING',playing:true});
  const query = explorer.encode();
  assert.equal(new URLSearchParams(query).has('playing'),false);
  const restored = createExplorer(dataset);
  restored.restore('?'+query);
  assert.deepEqual(restored.getState(),{...explorer.getState(),playing:false});
  assert.equal(restored.encode(),query);
  explorer.destroy();restored.destroy();
}

const store = createExplorer(logistics);
store.dispatch({type:'SELECT_EVENT',id:'arrived'});
store.dispatch({type:'NEXT'});
assert.equal(store.getState().selectedEventId,'sorted','Equal-time events must remain individually navigable');
store.dispatch({type:'PREVIOUS'});
assert.equal(store.getState().selectedEventId,'arrived');
store.dispatch({type:'SET_TIME',time:3});
assert.equal(store.getState().selectedEventId,'arrived');
store.dispatch({type:'SET_TIME',time:4});
assert.equal(store.getState().selectedEventId,null,'Changing time must not leave a stale event selected');
assert.equal(store.getView().activeEntity,null);
store.dispatch({type:'NEXT'});
assert.equal(store.getState().selectedEventId,'received');
store.dispatch({type:'SET_PLAYING',playing:true});
store.dispatch({type:'NEXT'});
assert.equal(store.getState().selectedEventId,'received');
assert.equal(store.getState().playing,false,'Reaching the end must stop playback without wrapping');
store.dispatch({type:'SELECT_EVENT',id:'packed'});
store.dispatch({type:'PREVIOUS'});
assert.equal(store.getState().selectedEventId,'packed');

let notifications = 0;
const unsubscribe = store.subscribe(view => {notifications++;assert.equal(view.state,store.getState());});
store.dispatch({type:'SELECT_EVENT',id:'sorted'});
assert.equal(notifications,1);
unsubscribe();
store.dispatch({type:'SET_TIME',time:6});
assert.equal(notifications,1);
const stableState = store.getState();
for (const action of [
  {type:'SET_TIME',time:NaN},{type:'SET_TIME',time:99},{type:'SET_TIME',time:'3'},
  {type:'SELECT_EVENT',id:'unknown'},{type:'SET_LAYER',layer:'secret',visible:true},
  {type:'SET_LAYER',layer:'route',visible:1},{type:'SET_PLAYING',playing:'yes'},{type:'UNKNOWN'},
]) {assert.throws(()=>store.dispatch(action));assert.equal(store.getState(),stableState);}
for (const query of [
  'dataset=other&time=3','dataset=delivery&time=','dataset=delivery&time=99',
  'dataset=delivery&time=3&event=unknown','dataset=delivery&time=4&event=arrived',
  'dataset=delivery&time=3&layers=route,secret','dataset=delivery&time=3&time=4',
  'dataset=delivery&time=3&playing=true','dataset=delivery&time=3&layers=route,route',
]) {assert.throws(()=>store.restore(query));assert.equal(store.getState(),stableState);}
store.restore('dataset=delivery&time=3&event=sorted&layers=');
assert.deepEqual(store.getState().visibleLayers,{route:false,labels:false});
assert.equal(store.getView().phase.id,'transit');

for (const alter of [
  d=>{d.entities[1].id=d.entities[0].id;},
  d=>{d.events[0].entityId='missing';},
  d=>{d.events[1].time=-1;},
  d=>{d.phases[1].from=4;},
  d=>{d.phases[1].from=2;},
  d=>{d.phases.at(-1).to=8;},
  d=>{d.entities[0].position=[Infinity,.5];},
  d=>{d.entities[0].position=[1.01,.5];},
  d=>{d.events[2].time=2;},
]) {const bad=structuredClone(logistics);alter(bad);assert.throws(()=>validateDataset(bad));}
const mutable=structuredClone(logistics);
const isolated=createExplorer(mutable);
mutable.events[0].time=100;
assert.equal(isolated.dispatch({type:'SELECT_EVENT',id:'packed'}).state.time,0);
assert.throws(()=>{isolated.getState().visibleLayers.route=false;});
isolated.destroy();store.destroy();
assert.throws(()=>store.dispatch({type:'NEXT'}));
assert.throws(()=>store.subscribe(()=>{}));
console.log(JSON.stringify({passed:true,fixtureDatasets:2,pageDatasets:Object.keys(datasets).length,checks:['phase boundaries','event/time/entity consistency','equal-time navigation','bounded playback','strict atomic URL restoration','validation rejects malformed data','unsubscribe','immutable owned snapshots'],importsUpstream:false},null,2));
