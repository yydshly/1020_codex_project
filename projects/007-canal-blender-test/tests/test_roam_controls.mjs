import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createNavigation } from "../web/roam-navigation.js";

const source = await readFile(new URL("../web/roam.js", import.meta.url), "utf8");

class Vector {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  copy(point) { return this.set(point.x, point.y, point.z); }
  clone() { return new Vector(this.x, this.y, this.z); }
}

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
  document.getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, eventTarget());
    return elements.get(id);
  };
  document.querySelectorAll = () => [];
  const window = eventTarget();
  const context = vm.createContext({
    document, window, createNavigation,
    THREE: { Vector3: Vector, Raycaster: class {}, MathUtils: { clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)) } },
    matchMedia: () => ({ matches: false }), innerWidth: 1200,
    performance: { now: () => 0 }, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, console,
  });
  vm.runInContext(source.replace(/^import .*;\r?$/gm, "") + `
    updateCamera = () => {};
    updateMap = () => {};
    state.loaded = true;
    cat = { object: { position: new THREE.Vector3().copy(entryPosition), rotation: { y: Math.PI / 2 } }, update() {} };
    controls = { enabled: false, target: new THREE.Vector3(), update() {} };
    camera = { position: new THREE.Vector3(), updateProjectionMatrix() {} };
    environment = { update() {} };
    renderer = { render() {} };
    globalThis.controller = {
      tour: setTour, pause: setPaused, reset: resetCat, mode: setMode,
      tick(delta = 1 / 60) { frame(previousTime + delta * 1000); },
      state() { return window.__canalRoam.getState(); },
      position() { return { ...cat.object.position }; },
      entry() { return { ...entryPosition }; },
      expectedHeight() { return navigation.sampleHeight(cat.object.position.x, cat.object.position.z); },
      input: movementInput,
      points() { return tourPoints.map(point => ({ ...point })); },
    };
  `, context, { filename: "roam-controller-test.js" });
  return { controller: context.controller, document, window };
}

test("actual guided controller completes both connected loops without getting stuck", () => {
  const { controller } = harness();
  controller.tour(true);
  const reached = new Set();
  let frames = 0;
  while (controller.state().tour && frames < 15000) {
    controller.tick();
    const state = controller.state();
    assert.ok(state.walkable, `illegal position at frame ${frames}`);
    assert.ok(Math.abs(state.position.y - controller.expectedHeight()) < 1e-10);
    reached.add(state.tourIndex);
    frames += 1;
  }
  const state = controller.state();
  assert.equal(state.tour, false);
  assert.equal(state.tourIndex, controller.points().length);
  assert.ok(frames < 15000);
  assert.ok(state.distance > 140);
  assert.ok(Math.hypot(state.position.x - controller.entry().x, state.position.z - controller.entry().z) < 0.13);
  for (const place of ["石拱桥上", "回程木桥", "运河对岸", "店后小巷"]) assert.ok(state.visited.includes(place), place);
  assert.ok(reached.size >= 9);
});

test("manual input cancels the guided walk and follows camera-relative axes", () => {
  const { controller, document } = harness();
  controller.tour(true);
  const start = controller.position();
  document.dispatch("keydown", { code: "KeyW" });
  controller.tick();
  const state = controller.state();
  assert.equal(state.tour, false);
  assert.ok(state.position.x > start.x && state.position.z < start.z);
  document.dispatch("keyup", { code: "KeyW" });
  assert.equal(controller.input().vertical, 0);
});

test("pause stops the real frame loop and releases held movement keys", () => {
  const { controller, document } = harness();
  document.dispatch("keydown", { code: "KeyD" });
  controller.tick();
  controller.pause(true);
  const paused = controller.state();
  assert.equal(controller.input().horizontal, 0);
  for (let frame = 0; frame < 5; frame += 1) controller.tick();
  assert.equal(controller.state().frames, paused.frames);
  assert.deepEqual(controller.position(), paused.position);
  controller.pause(false);
  controller.tick();
  assert.equal(controller.state().paused, false);
  assert.ok(controller.state().frames > paused.frames);
  assert.deepEqual(controller.position(), paused.position);
});

test("hidden document pauses animation and clears controls", () => {
  const { controller, document } = harness();
  document.dispatch("keydown", { code: "ArrowRight" });
  document.hidden = true;
  document.dispatch("visibilitychange");
  assert.equal(controller.state().paused, true);
  assert.equal(controller.input().horizontal, 0);
});

test("window blur never leaves a movement key held", () => {
  const { controller, document, window } = harness();
  document.dispatch("keydown", { code: "KeyD" });
  window.dispatch("blur");
  assert.equal(controller.input().horizontal, 0);
  const previous = controller.position();
  controller.tick();
  assert.deepEqual(controller.position(), previous);
});

test("reset from an active tour returns to safe grounded spawn", () => {
  const { controller } = harness();
  controller.tour(true);
  for (let frame = 0; frame < 200; frame += 1) controller.tick();
  controller.reset();
  const state = controller.state();
  assert.equal(state.tour, false);
  assert.equal(state.mode, "follow");
  assert.equal(state.walkable, true);
  assert.equal(state.position.x, controller.entry().x);
  assert.equal(state.position.y, controller.entry().y);
  assert.equal(state.position.z, controller.entry().z);
});

test("manual movement leaves overview and returns to follow mode", () => {
  const { controller, document } = harness();
  controller.mode("overview");
  assert.equal(controller.state().mode, "overview");
  document.dispatch("keydown", { code: "KeyD" });
  controller.tick();
  assert.equal(controller.state().mode, "follow");
  assert.equal(controller.state().walkable, true);
});
