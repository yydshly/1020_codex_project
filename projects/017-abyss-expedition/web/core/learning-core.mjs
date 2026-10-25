// SPDX-License-Identifier: GPL-3.0-only
// An in-memory, domain-independent two-site teaching exercise. It never reads
// browser storage, writes personal records, or claims to be a physical sample.

const fail=message=>{throw new TypeError(message);};
const plain=value=>value!==null&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const text=value=>typeof value==='string'&&value.trim().length>0;
const ownValue=(object,key)=>{const descriptor=Object.getOwnPropertyDescriptor(object,key);if(!descriptor||!Object.hasOwn(descriptor,'value'))fail(`采样配置需要普通字段 ${key}`);return descriptor.value;};
const identifier=(value,field)=>{if(!text(value)||value!==value.trim())fail(`${field} 需要无首尾空格的非空字符串`);return value;};

/** A site's kind defaults to water, but can be any stable category identifier. */
export function validateSamplingConfig(config){
  if(!plain(config))fail('采样练习需要普通配置对象');
  identifier(ownValue(config,'id'),'练习 id');
  const sites=ownValue(config,'sites');if(!plain(sites))fail('sites 需要 near 与 far 两个位置');
  const ids=[];
  for(const position of ['near','far']){
    const site=ownValue(sites,position);if(!plain(site))fail(`${position} 需要位置对象`);
    ids.push(identifier(ownValue(site,'id'),`${position}.id`));
    if(!text(ownValue(site,'label')))fail(`${position}.label 需要非空名称`);
    const kind=Object.hasOwn(site,'kind')?ownValue(site,'kind'):'water';identifier(kind,`${position}.kind`);
  }
  if(ids[0]===ids[1])fail('两个对照位置需要不同 id');
  return true;
}

/**
 * createSamplingSession({id,sites:{near:{id,label,kind?},far:{id,label,kind?}}},
 *                       {onChange?})
 * A session is deliberately ephemeral; construction and reset never inspect
 * localStorage, sessionStorage, user sample reports, or any global singleton.
 */
export function createSamplingSession(config,{onChange}={}){
  validateSamplingConfig(config);
  if(onChange!==undefined&&typeof onChange!=='function')fail('onChange 必须为函数');
  const missionId=config.id,sites=Object.fromEntries(['near','far'].map(position=>{
    const site=config.sites[position];return [position,Object.freeze({id:site.id,label:site.label,kind:site.kind??'water'})];
  }));
  const listeners=new Set(onChange?[onChange]:[]);let destroyed=false;
  const snapshot=samples=>Object.freeze({missionId,samples:Object.freeze(samples),comparisonUnlocked:Boolean(samples.near&&samples.far&&samples.near.kind===samples.far.kind)});
  let state=snapshot({near:null,far:null});
  const alive=()=>{if(destroyed)throw new Error('采样练习已销毁');};
  const getState=()=>state;
  function commit(samples,action){
    const next=snapshot(samples);state=next;
    const event=Object.freeze(action);for(const listener of [...listeners])listener(next,event);
    return next;
  }
  function collect(position){
    alive();if(position!=='near'&&position!=='far')fail('采样位置只能是 near 或 far');
    if(state.samples[position])return state;
    const site=sites[position],record=Object.freeze({id:site.id,site:site.label,kind:site.kind,teachingSimulation:true});
    return commit({...state.samples,[position]:record},{type:'COLLECT',position});
  }
  function reset(){alive();if(!state.samples.near&&!state.samples.far)return state;return commit({near:null,far:null},{type:'RESET'});}
  function subscribe(listener){alive();if(typeof listener!=='function')fail('订阅者必须为函数');listeners.add(listener);return ()=>listeners.delete(listener);}
  function destroy(){if(destroyed)return;destroyed=true;listeners.clear();}
  return Object.freeze({getState,collect,reset,subscribe,destroy});
}
