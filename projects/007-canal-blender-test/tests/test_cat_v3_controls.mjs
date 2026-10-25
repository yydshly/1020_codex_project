import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as THREE from "../web/vendor/three/build/three.module.min.js";
import { createNavigation } from "../web/roam-navigation.js";

const source = await readFile(new URL("../web/roam-cat-v3-controller.js", import.meta.url), "utf8");

function eventTarget() {
  const handlers = new Map();
  return {
    hidden: false,
    classList: { add() {}, remove() {} },
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(handler);
    },
    dispatch(type, event = {}) {
      for (const handler of handlers.get(type) || []) handler({ preventDefault() {}, ...event });
    },
    setAttribute() {}, focus() {}, setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {},
  };
}

function harness() {
  const elements = new Map();
  const document = eventTarget();
  document.getElementById = id => {
    if (!elements.has(id)) elements.set(id, eventTarget());
    return elements.get(id);
  };
  document.querySelectorAll = () => [];
  const window = eventTarget();
  const context = vm.createContext({ document, window, createNavigation, THREE,
    matchMedia: () => ({ matches: false }), innerWidth: 1200,
    performance: { now: () => 0 }, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, console,
  });
  vm.runInContext(source.replace(/^import .*;\r?$/gm, "") + `
    updateMap = () => {};
    state.loaded = true;
    cat = {object: {position: new THREE.Vector3().copy(entryPosition), rotation: {y:Math.PI-1.16}}, update() {}};
    controls = {enabled:false,target:new THREE.Vector3(),update() {}};
    camera = new THREE.PerspectiveCamera(53, 1.6, .06, 500);
    environment = {update() {},cameraOccluders:[]};
    renderer = {render() {}};
    globalThis.controller = {
      tour:setTour,pause:setPaused,reset:resetCat,mode:setMode,
      tick(delta=1/60) { frame(previousTime + delta*1000); },
      state() {return window.__canalRoam.getState();},
      heading() {return cat.object.rotation.y;},
      entry() {return {...entryPosition};},
      input:movementInput,
      points() {return tourPoints.map(point=>({...point}));}
    };
  `, context, {filename:"refined-roaming-controller.js"});
  return {controller:context.controller,document,window};
}

const magnitude = velocity => Math.hypot(velocity.x, velocity.z);
const tick = (controller, frames) => {for (let index=0;index<frames;index++) controller.tick();};

test("walk accelerates gradually, settles after release, and does not drift", () => {
  const {controller, document} = harness();
  document.dispatch("keydown", {code:"KeyW"});
  controller.tick();
  const first = controller.state();
  assert.ok(first.speed > 0 && first.speed < .1, "first frame cannot instantly reach cruise speed");
  tick(controller, 24);
  const cruising = controller.state();
  assert.ok(Math.abs(cruising.speed - .60) < 1e-8);
  document.dispatch("keyup", {code:"KeyW"});
  controller.tick();
  const released = controller.state();
  assert.ok(released.speed > 0 && released.speed < cruising.speed, "release has a brief controlled braking interval");
  tick(controller, 20);
  const stopped = controller.state();
  assert.ok(magnitude(stopped.velocity) < 1e-8);
  tick(controller, 20);
  assert.deepEqual(controller.state().position, stopped.position);
});

test("Shift selects a slower supported walk and releases back to normal walking", () => {
  const {controller,document} = harness();
  document.dispatch("keydown", {code:"KeyW"});
  document.dispatch("keydown", {code:"ShiftLeft"});
  tick(controller, 25);
  assert.ok(Math.abs(controller.state().speed - .40) < 1e-6);
  document.dispatch("keyup", {code:"ShiftLeft"});
  tick(controller, 20);
  assert.ok(Math.abs(controller.state().speed - .60) < 1e-6);
  assert.ok(controller.state().walkable);
});

test("direction changes obey the acceleration bound, including a reversal", () => {
  const {controller,document} = harness();
  document.dispatch("keydown", {code:"KeyW"});
  tick(controller, 25);
  const before = controller.state();
  document.dispatch("keyup", {code:"KeyW"});
  document.dispatch("keydown", {code:"KeyS"});
  controller.tick();
  const after = controller.state();
  const change = Math.hypot(after.velocity.x-before.velocity.x, after.velocity.z-before.velocity.z);
  assert.ok(change <= 2.8/60 + 1e-9);
  assert.ok(after.velocity.x * before.velocity.x + after.velocity.z * before.velocity.z > 0);
  tick(controller, 100);
  const reversed = controller.state();
  assert.ok(reversed.velocity.x * before.velocity.x + reversed.velocity.z * before.velocity.z < 0);
  assert.ok(reversed.walkable);
});

test("an opposite command turns with a bounded angle before moving", () => {
  const {controller,document} = harness();
  controller.reset();
  const initial = controller.state();
  document.dispatch("keydown", {code:"KeyW"});
  let previous = controller.heading();
  for (let i = 0; i < 10; i++) {
    controller.tick();
    const heading = controller.heading();
    const turn = Math.atan2(Math.sin(heading - previous), Math.cos(heading - previous));
    assert.ok(Math.abs(turn) <= 2.2 / 60 + 1e-9);
    previous = heading;
  }
  assert.deepEqual(controller.state().position, initial.position);
  tick(controller, 100);
  assert.ok(controller.state().distance > initial.distance + .1);
  assert.ok(controller.state().walkable);
});

test("pause clears both held inputs and inertia before resuming", () => {
  const {controller,document} = harness();
  document.dispatch("keydown", {code:"KeyW"});
  tick(controller, 20);
  controller.pause(true);
  const paused = controller.state();
  assert.equal(controller.input().vertical, 0);
  assert.equal(magnitude(paused.velocity), 0);
  tick(controller, 4);
  assert.equal(controller.state().frames, paused.frames);
  controller.pause(false);
  tick(controller, 10);
  assert.deepEqual(controller.state().position, paused.position);
});

test("sample tour completes a grounded return entirely inside the ten-metre street", () => {
  const {controller} = harness();
  controller.tour(true);
  let frames = 0;
  while (controller.state().tour && frames < 4000) {
    controller.tick();
    const state = controller.state();
    assert.ok(state.walkable);
    assert.ok(state.position.x >= -7 && state.position.x <= 3);
    assert.ok(Math.abs(state.position.y - .85) < 1e-8);
    assert.ok(Math.abs(state.position.z - .55) < 1e-8);
    frames++;
  }
  tick(controller, 20);
  const final = controller.state();
  assert.ok(frames < 4000, "sample route cannot get stuck or silently expand to the full block");
  assert.equal(final.tourIndex, controller.points().length);
  assert.ok(final.distance > 15 && final.distance < 17);
  assert.ok(Math.abs(final.position.x-controller.entry().x) < .15);
  assert.equal(magnitude(final.velocity), 0);
});

test("default follow view is lower, looks along the street, and reset clears drift", () => {
  const {controller,document} = harness();
  controller.reset();
  const initial = controller.state();
  const eyeHeight = initial.camera.position.y - initial.position.y;
  assert.ok(eyeHeight > .8 && eyeHeight < 1.5);
  assert.ok(initial.camera.target.x > initial.position.x);
  document.dispatch("keydown", {code:"KeyW"});
  tick(controller, 20);
  document.dispatch("keyup", {code:"KeyW"});
  controller.reset();
  assert.deepEqual(controller.state().position, initial.position);
  assert.equal(magnitude(controller.state().velocity), 0);
  tick(controller, 20);
  assert.deepEqual(controller.state().position, initial.position);
});

test("lost focus clears inertia; a long frame cannot tunnel through the route", () => {
  const {controller,document,window} = harness();
  document.dispatch("keydown", {code:"KeyW"});
  controller.tick(20);
  assert.ok(controller.state().distance <= .60*.06);
  assert.ok(controller.state().walkable);
  window.dispatch("blur");
  assert.equal(controller.state().paused, true);
  assert.equal(magnitude(controller.state().velocity), 0);
});
