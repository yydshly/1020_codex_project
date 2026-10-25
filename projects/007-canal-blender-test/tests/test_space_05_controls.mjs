import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as THREE from '../web/vendor/three/build/three.module.min.js';
import { createNavigation } from '../web/scene-space-05-navigation.js';

// Execute the actual page controller rather than reproducing its movement
// equation. Only DOM/camera presentation is stubbed; navigation.move is real.
const page=fs.readFileSync(new URL('../web/scene-space-05.js',import.meta.url),'utf8');
const start=page.indexOf('function updateWalking('),end=page.indexOf('function updateTour(',start);
assert.ok(start>=0&&end>start,'Expected walking controller must be present.');
const controller=page.slice(start,end);
function harness(){
  const navigation=createNavigation();
  const context=vm.createContext({navigation,foot:navigation.reset(),yaw:Math.PI,
    input:new Set(),touch:new Set(),moveSpeed:1.25,applyWalkingCamera(){}});
  vm.runInContext(controller,context);
  return context;
}
function hold(context,key,seconds){
  context.input.clear();context.input.add(key);
  const frames=Math.ceil(seconds*30);
  for(let i=0;i<frames;i++){
    context.updateWalking(seconds/frames);
    assert.ok(context.navigation.isWalkable(context.foot.x,context.foot.z));
  }
  context.input.clear();
}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);

test('actual page W/S controls enter the courtyard and return along the same passage',()=>{
  const context=harness();
  hold(context,'KeyW',9.2); // 11.5m at 1.25m/s: from z12.65 to z24.15.
  near(context.foot.x,-7.05);near(context.foot.z,24.15);near(context.foot.y,.855);
  hold(context,'KeyD',1.84); // Facing +Z, screen-right is world -X, into the yard.
  near(context.foot.x,-9.35);near(context.foot.z,24.15);
  hold(context,'KeyA',1.84);
  near(context.foot.x,-7.05);
  hold(context,'KeyS',9.2);
  near(context.foot.x,-7.05);near(context.foot.z,12.65);near(context.foot.y,.85);
});

test('forward control agrees with the actual Three camera heading, including turned views',()=>{
  for(const yaw of [0,Math.PI/2,Math.PI,-.71]){
    const context=harness();context.foot={...context.navigation.spawns.courtyardCenter};context.yaw=yaw;
    const camera=new THREE.PerspectiveCamera();camera.rotation.set(0,yaw,0,'YXZ');
    const direction=camera.getWorldDirection(new THREE.Vector3()),before={...context.foot};
    hold(context,'KeyW',.1);
    near(context.foot.x-before.x,direction.x*.125);
    near(context.foot.z-before.z,direction.z*.125);
  }
});

test('holding W past the courtyard edge stops safely and S can still return',()=>{
  const context=harness();hold(context,'KeyW',40);
  assert.ok(context.foot.z<=25.6-context.navigation.radius+1e-7);
  const stopped={...context.foot};
  hold(context,'KeyS',2);
  near(stopped.z-context.foot.z,2.5);
  assert.ok(context.navigation.isWalkable(context.foot.x,context.foot.z));
});

test('the actual demo controller completes its circuit through navigation.move without sweep shortcuts',()=>{
  const navigation=createNavigation(),points=navigation.routes.courtyard_return;
  const lengths=points.slice(1).map((point,i)=>Math.hypot(point.x-points[i].x,point.z-points[i].z));
  const context=vm.createContext({THREE,navigation,foot:navigation.reset(),yaw:Math.PI,mode:'tour',
    tour:{points,lengths,total:lengths.reduce((a,b)=>a+b,0),distance:0},
    applyWalkingCamera(){},beginWalk(){context.mode='walk';},$:()=>({textContent:''}),lastLocation:''});
  const sampleStart=page.indexOf('function sampleRoute('),sampleEnd=page.indexOf("$('walk').addEventListener",sampleStart);
  const tourStart=page.indexOf('function updateTour('),tourEnd=page.indexOf('function animate(',tourStart);
  vm.runInContext(page.slice(sampleStart,sampleEnd)+'\n'+page.slice(tourStart,tourEnd),context);
  let frames=0;
  while(context.mode==='tour'&&frames<1200){
    const before=context.foot;context.updateTour(1/30);
    assert.ok(navigation.isWalkable(context.foot.x,context.foot.z));
    assert.ok(navigation.canSweep(before,context.foot));frames++;
  }
  assert.equal(context.mode,'walk');
  near(context.foot.x,navigation.spawn.x);near(context.foot.z,navigation.spawn.z);
  near(context.foot.y,.85);
});
