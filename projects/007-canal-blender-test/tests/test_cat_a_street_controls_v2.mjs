import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as THREE from "../web/vendor/three/build/three.module.min.js";
import { createNavigation } from "../web/roam-navigation.js";
import { limitApproachSpeed } from "../web/cat-v9-navigation-brake.js";

// Exercise this release's actual input, movement, camera and frame functions.
// Only loading/rendering/DOM paint are replaced. The actual pure actor state
// is also used, so movement speeds drive the same walk/run blend as the page.
const source = await readFile(new URL("../web/shop-study-11-controller.js", import.meta.url), "utf8");
const actorSource = (await readFile(new URL("../web/cat-a-actor-v2.js", import.meta.url), "utf8"))
  .split("export async function createCat")[0].replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");

function eventTarget() {
  const handlers = new Map(), attributes = new Map();
  return {
    hidden: false, classList: { add() {}, remove() {} },
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(handler);
    },
    dispatch(type, event = {}) {
      for (const handler of handlers.get(type) || []) handler({ preventDefault() {}, ...event });
    },
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name); },
    focus() {}, setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {},
  };
}

function harness() {
  const elements = new Map(), document = eventTarget(), window = eventTarget();
  document.getElementById = id => {
    if (!elements.has(id)) elements.set(id, eventTarget());
    return elements.get(id);
  };
  document.querySelectorAll = () => [];
  const context = vm.createContext({ document, window, createNavigation, limitApproachSpeed, THREE,
    matchMedia: () => ({ matches: false }), innerWidth: 1200,
    performance: { now: () => 0 }, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, console,
  });
  vm.runInContext(actorSource + source.replace(/^import .*;\r?$/gm, "") + `
    updateMap = () => {};
    state.loaded = true;
    const testedActorMotion = createCatMotionState();
    cat = {object: {position: new THREE.Vector3().copy(entryPosition), rotation: {y:entryHeading}},
      update(dt, input) { testedActorMotion.update(dt,input); }, getDebugState() { return {...testedActorMotion.state}; }};
    controls = {enabled:false,target:new THREE.Vector3(),update() {}};
    camera = new THREE.PerspectiveCamera(49, 1.6, .06, 500);
    environment = {update() {},cameraOccluders:[]};
    renderer = {render() {},info:{render:{},memory:{}}};
    globalThis.controller = {
      tour:setTour,pause:setPaused,reset:resetCat,mode:setMode,run:setRunMode,demo:setDemo,
      tick(delta=1/60) { frame(previousTime + delta*1000); },
      state() {return window.__canalRoam.getState();},
      entry() {return {...entryPosition};},
      input:movementInput,
      points() {return tourPoints.map(point=>({...point}));},
      aimAlongStreet() { followCamera.yaw=-Math.PI/2; cat.object.rotation.y=Math.PI/2; },
      yaw() {return followCamera.yaw;}, heading() {return cat.object.rotation.y;},
      limits() {return {...CAT_A_SPEEDS};}
    };
    resetCat();
  `, context, {filename:"shop-study-11-controller-test.js"});
  return {controller:context.controller,document,window,element:document.getElementById};
}

const magnitude = velocity => Math.hypot(velocity.x, velocity.z);
const tick = (controller, count) => { for (let i=0;i<count;i++) controller.tick(); };
const key = (document, code, down=true) => document.dispatch(down?"keydown":"keyup",{code});

for (const run of [false,true]) test(`A street guided ${run?"run":"walk"} completes its actual out-and-back route`, () => {
  const {controller} = harness();
  controller.tour(true); controller.run(run);
  let frames=0,maxSpeed=0,maxCameraStep=0,previousCamera=null;
  while(controller.state().tour && frames<6000) {
    controller.tick();const state=controller.state();
    assert.equal(state.version,"shop-study-11");
    assert.ok(state.walkable);
    assert.ok(state.position.x>=-7 && state.position.x<=3);
    assert.ok(state.position.z>-.86 && state.position.z<1.281,"turning arc stays within the navigable existing street");
    assert.ok(Math.abs(state.position.y-.85)<1e-9);
    maxSpeed=Math.max(maxSpeed,state.speed);
    if(previousCamera) maxCameraStep=Math.max(maxCameraStep,Math.hypot(state.camera.position.x-previousCamera.x,state.camera.position.y-previousCamera.y,state.camera.position.z-previousCamera.z));
    previousCamera=state.camera.position; frames++;
  }
  tick(controller,60); const final=controller.state();
  assert.ok(frames<6000,"route cannot get stuck at the turnaround");
  assert.equal(final.tourIndex,controller.points().length);
  assert.ok(final.distance>15 && final.distance<18);
  assert.ok(Math.abs(final.position.x-controller.entry().x)<.16);
  assert.ok(magnitude(final.velocity)<1e-8);
  assert.ok(final.cat.idleWeight>.98);
  assert.ok(Math.abs(maxSpeed-(run?controller.limits().run:controller.limits().walk))<1e-6);
  assert.ok(maxCameraStep<.09,`camera moved ${maxCameraStep.toFixed(3)}m in one 60Hz frame`);
});

test("Shift accelerates into the native run and release blends back to walk", () => {
  const {controller,document}=harness();controller.aimAlongStreet();
  key(document,"KeyW");tick(controller,45);
  const walk=controller.state(); assert.ok(Math.abs(walk.speed-.48)<1e-8);assert.ok(walk.cat.walkWeight>.98);
  key(document,"ShiftLeft"); let previous=controller.state();
  for(let i=0;i<80;i++) {
    controller.tick();const current=controller.state();
    assert.ok(current.speed-previous.speed<=1.15/60+1e-8);
    assert.ok(Math.abs(current.cat.runWeight-previous.cat.runWeight)<.13,"run blend cannot hard-switch");
    previous=current;
  }
  const run=controller.state();assert.ok(Math.abs(run.speed-1.65)<1e-8);assert.ok(run.cat.runWeight>.98);
  key(document,"ShiftLeft",false);tick(controller,70);
  const again=controller.state();assert.ok(Math.abs(again.speed-.48)<1e-8);assert.ok(again.cat.walkWeight>.98);
  assert.ok(again.walkable);
});

test("a running 180-degree reversal brakes, turns, and resumes without locking", () => {
  const {controller,document}=harness();controller.aimAlongStreet();
  key(document,"KeyW");key(document,"ShiftLeft");tick(controller,100);
  const before=controller.state();assert.ok(before.speed>1.6);
  key(document,"KeyW",false);key(document,"KeyS");
  const startHeading=controller.heading();controller.tick();
  const first=controller.state();assert.ok(first.velocity.x>0,"first reversal frame must brake before reversing translation");
  assert.ok(Math.abs(controller.heading()-startHeading)<1e-8,"high-speed turn must brake first");
  let minSpeed=Infinity, turningFrames=0, turningTravel=0;
  for(let i=0;i<350;i++){
    controller.tick();const state=controller.state();minSpeed=Math.min(minSpeed,state.speed);assert.ok(state.walkable);
    if(Math.abs(state.motion.turnRate)>.5){turningFrames++;turningTravel+=state.speed/60;}
  }
  const after=controller.state();
  assert.ok(minSpeed<.4,"sharp turn must substantially brake");
  assert.ok(turningFrames>50 && turningTravel>.3,"turning must include actual curved stepping, not a frozen pivot");
  assert.ok(after.velocity.x<-1.5,"held reverse input must recover running speed");
  assert.ok(after.cat.runWeight>.98);
});

test("pause clears run and held inputs; reset returns to a grounded idle with no drift", () => {
  const {controller,document,element}=harness();controller.aimAlongStreet();
  controller.run(true);key(document,"KeyW");tick(controller,80);
  controller.pause(true);const paused=controller.state();
  assert.equal(controller.input().vertical,0);assert.equal(paused.runMode,false);
  assert.equal(magnitude(paused.velocity),0);assert.equal(element("run-mode").getAttribute("aria-pressed"),"false");
  tick(controller,5);assert.equal(controller.state().frames,paused.frames);
  assert.deepEqual(controller.state().position,paused.position);
  controller.pause(false);tick(controller,60);
  assert.deepEqual(controller.state().position,paused.position);assert.ok(controller.state().cat.idleWeight>.98);
  controller.tour(true);controller.run(true);tick(controller,90);controller.reset();
  const reset=controller.state();assert.deepEqual(reset.position,controller.entry());
  assert.equal(reset.tour,false);assert.equal(reset.runMode,false);assert.equal(reset.cat.idleWeight,1);
  tick(controller,30);assert.deepEqual(controller.state().position,reset.position);
});

test("manual input cancels tour while camera-relative steering keeps a stable reference", () => {
  const {controller,document}=harness();controller.tour(true);tick(controller,40);
  const yaw=controller.yaw();key(document,"KeyW");controller.tick();
  assert.equal(controller.state().tour,false);tick(controller,40);
  assert.equal(controller.yaw(),yaw,"manual steering must not automatically rotate its own reference");
  assert.ok(controller.state().walkable);
});

test("focus loss freezes the current frame and a long frame cannot tunnel into boundaries", () => {
  const {controller,document,window}=harness();controller.aimAlongStreet();
  key(document,"KeyW");key(document,"ShiftLeft");controller.tick(20);
  assert.ok(controller.state().distance<=1.65*.06);assert.ok(controller.state().walkable);
  window.dispatch("blur");const state=controller.state();
  assert.equal(state.paused,true);assert.equal(magnitude(state.velocity),0);assert.equal(controller.input().vertical,0);
  controller.tick();assert.equal(controller.state().frames,state.frames);
});

test("the complete one-click demo walks, runs, settles, resumes, turns and finishes", () => {
  const {controller}=harness();controller.demo(true);
  let sawWalk=false,sawRun=false,sawIdle=false,sawResume=false,sawTurn=false;
  let holdPosition=null,holdFrames=0,maxHoldDrift=0,frames=0;
  while(controller.state().tour && frames<6000) {
    controller.tick();frames++;
    const s=controller.state();assert.ok(s.walkable);
    if(!s.demoHold && s.speed>.4 && s.speed<.55) sawWalk=true;
    if(s.speed>1.6) sawRun=true;
    if(s.demoHold && s.speed<.001) {
      sawIdle=true;holdFrames++;
      assert.equal(s.demo,true,"planned hold must not be mistaken for a stuck tour");
      if(holdPosition) maxHoldDrift=Math.max(maxHoldDrift,Math.hypot(s.position.x-holdPosition.x,s.position.z-holdPosition.z));
      else holdPosition={...s.position};
      assert.equal(s.motion.hasIntent,false);
    }
    if(sawIdle && !s.demoHold && s.speed>.4) sawResume=true;
    if(s.motion.turning && Math.abs(s.motion.turnRate)>.5 && s.speed>.12) sawTurn=true;
  }
  assert.ok(frames<6000);
  assert.ok(sawWalk && sawRun && sawIdle && sawResume && sawTurn);
  assert.ok(holdFrames>130,"leave enough completely still time to observe idle breathing");
  assert.ok(maxHoldDrift<1e-9,"idle breathing must not translate the actor root");
  assert.equal(controller.state().demo,false);
});

test("manual run selection takes over from the scripted demo without restarting the tour", () => {
  const {controller,element}=harness();controller.demo(true);tick(controller,70);
  const before=controller.state().position.x;
  element("run-mode").dispatch("click");
  assert.equal(controller.state().demo,false);assert.equal(controller.state().tour,true);
  tick(controller,100);
  assert.ok(controller.state().position.x>before);
  assert.ok(controller.state().speed>1.6);
});

