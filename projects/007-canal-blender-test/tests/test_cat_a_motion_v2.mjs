import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const source=(await readFile(new URL('../web/cat-a-actor-v2.js',import.meta.url),'utf8'))
  .split('export async function createCat')[0].replace(/^import .*;\r?$/gm,'').replace(/^export /gm,'');
const context=vm.createContext({});vm.runInContext(source+';this.createMotion=createCatMotionState;',context);
const make=()=>context.createMotion();
function invariant(s){
  for(const [key,value]of Object.entries(s))if(typeof value==='number')assert.ok(Number.isFinite(value),key);
  assert.ok(s.phase>=0&&s.phase<1);
  assert.ok(Math.abs(s.idleWeight+s.walkWeight+s.runWeight-1)<1e-10);
  for(const k of ['idleWeight','walkWeight','runWeight'])assert.ok(s[k]>=0&&s[k]<=1);
}
test('release finishes a bounded settle without inventing world travel or phase motion',()=>{
  const m=make();for(let i=0;i<120;i++)m.update(1/60,{speed:.48,hasIntent:true,desiredSpeed:.48});
  let previousPhase;
  for(let i=0;i<60;i++){
    const speed=Math.max(0,.48-i/60*1.8);
    const s=m.update(1/60,{speed,hasIntent:false,desiredSpeed:0});invariant(s);
    if(speed===0&&previousPhase!==undefined)assert.equal(s.phase,previousPhase,'stationary paws do not replay a full Walk to reach idle');
    previousPhase=speed===0?s.phase:undefined;
  }
  assert.equal(m.state.mode,'idle');assert.equal(m.state.idleWeight,1);
  assert.ok(m.state.idleTime>0);
});
test('rapid restart continues the existing phase and never resets a lifted paw',()=>{
  const m=make();for(let i=0;i<70;i++)m.update(1/60,{speed:.48,hasIntent:true});
  for(let i=0;i<8;i++)m.update(1/60,{speed:0,hasIntent:false});
  assert.equal(m.state.mode,'settling');
  const phase=m.state.phase;
  m.update(1/60,{speed:.05,hasIntent:true,desiredSpeed:.48});
  assert.equal(m.state.mode,'moving');assert.ok(m.state.phase>phase&&m.state.phase-phase<.01);
});
test('a tight actual turn keeps small steps but a blocked intent settles',()=>{
  const m=make();for(let i=0;i<120;i++)m.update(1/60,{speed:0,hasIntent:true,turning:true,turnRate:.72,desiredSpeed:0});
  assert.equal(m.state.mode,'moving');assert.ok(m.state.cycleRate>.1);
  assert.ok(m.state.walkWeight>.05&&m.state.walkWeight<.7);
  for(let i=0;i<90;i++)m.update(1/60,{speed:0,hasIntent:true,turning:false,turnRate:0,blocked:true,desiredSpeed:0});
  assert.equal(m.state.mode,'idle');assert.equal(m.state.cycleRate,0);
});
test('rapid walk/run requests retain normalized smooth weights and finite reset',()=>{
  const m=make();let previous=0;
  for(let i=0;i<500;i++){
    const s=m.update(1/60,{speed:i%18<9?.48:1.65,hasIntent:true});invariant(s);
    assert.ok(Math.abs(s.runWeight-previous)<.15);previous=s.runWeight;
  }
  const s=m.update(0,{reset:true,speed:1.65,turnRate:2});invariant(s);
  assert.equal(s.mode,'idle');assert.equal(s.idleWeight,1);assert.equal(s.phase,.426);
});
