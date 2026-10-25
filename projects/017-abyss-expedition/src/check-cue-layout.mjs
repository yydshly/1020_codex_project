// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {computeCueLayout} from '../web/rendering/cue-layout.mjs';

const overlap=(a,b)=>a.x<b.x+b.w-1e-8&&a.x+a.w>b.x+1e-8&&a.y<b.y+b.h-1e-8&&a.y+a.h>b.y+1e-8;
const cases=[
  {width:681,height:773,occupied:[{x:12,y:87,w:304,h:245},{x:367,y:376,w:302,h:385},{x:548,y:8,w:121,h:39}]},
  {width:390,height:746,occupied:[{x:10,y:72,w:370,h:181},{x:10,y:392,w:370,h:344},{x:256,y:8,w:124,h:36}]},
];
for(const input of cases){
  const before=JSON.stringify(input),result=computeCueLayout(input);
  assert.equal(JSON.stringify(input),before,'Caller rectangles must not be mutated');assert.equal(result.valid,true);assert.ok(result.regions.length<=6&&result.regions.length===result.rects.length);assert.equal(result.focus.valid,true);
  for(const [i,rect] of result.rects.entries()){
    assert.ok(rect.w>=96&&rect.h>=70);assert.ok(rect.x>=12&&rect.y>=54&&rect.x+rect.w<=input.width-12+1e-8&&rect.y+rect.h<=input.height-12+1e-8);
    for(const used of input.occupied)assert.equal(overlap(rect,{x:used.x-8,y:used.y-8,w:used.w+16,h:used.h+16}),false,'A usable rectangle must clear expanded UI');
    for(const other of result.rects.slice(i+1))assert.equal(overlap(rect,other),false,'Returned usable rectangles must be disjoint');
    const region=result.regions[i];assert.deepEqual(region,{left:rect.x/input.width,top:rect.y/input.height,right:(rect.x+rect.w)/input.width,bottom:(rect.y+rect.h)/input.height});
  }
  assert.ok(result.rects.some(r=>r.x===result.focus.x&&r.y===result.focus.y&&r.w===result.focus.w&&r.h===result.focus.h));
  assert.deepEqual(computeCueLayout(input),result,'The same UI rectangles must produce a deterministic layout');
}
const blocked=computeCueLayout({width:390,height:746,occupied:[{x:0,y:0,w:390,h:746}]});assert.equal(blocked.valid,false);assert.equal(blocked.focus.valid,false);assert.deepEqual(blocked.regions,[]);assert.deepEqual(blocked.rects,[]);
assert.ok([blocked.focus.x,blocked.focus.y,blocked.focus.w,blocked.focus.h].every(Number.isFinite));
const tiny=computeCueLayout({width:12,height:20});assert.equal(tiny.valid,false);assert.equal(tiny.focus.valid,false);
assert.ok(Object.isFrozen(blocked)&&Object.isFrozen(blocked.focus));
for(const invalid of [{width:NaN,height:10},{width:10,height:0},{width:10,height:10,occupied:[{x:0,y:0,w:-1,h:1}]}])assert.throws(()=>computeCueLayout(invalid),TypeError);
console.log(JSON.stringify({passed:true,viewports:cases.map(input=>{const result=computeCueLayout(input);return {width:input.width,height:input.height,regions:result.rects.length,focus:result.focus};}),fullyOccludedFallbackExplicit:true,nonOverlapping:true,clearOfUi:true}));
