import assert from "node:assert/strict";
import test from "node:test";
import { createNavigation } from "../web/roam-navigation.js";

const navigation = createNavigation();

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
}

function walkRoute(route) {
  let position = navigation.reset(route[0]);
  let largestHeightStep = 0;
  for (const target of route.slice(1)) {
    const deltaX = target.x - position.x;
    const deltaZ = target.z - position.z;
    const steps = Math.ceil(Math.hypot(deltaX, deltaZ) / 0.07);
    for (let step = 0; step < steps; step += 1) {
      const previous = position;
      position = navigation.move(position, { x: deltaX / steps, z: deltaZ / steps });
      assert.ok(navigation.isWalkable(position.x, position.z));
      close(position.y, navigation.sampleHeight(position.x, position.z));
      largestHeightStep = Math.max(largestHeightStep, Math.abs(previous.y - position.y));
    }
    close(position.x, target.x);
    close(position.z, target.z);
  }
  return { position, largestHeightStep };
}

test("spawn and coordinate convention are safe Three Y-up values", () => {
  assert.deepEqual(navigation.spawn, { x: -12.8, y: 0.85, z: 0.55 });
  assert.ok(navigation.isWalkable(navigation.spawn.x, navigation.spawn.z));
  assert.equal(navigation.zones.find((zone) => zone.id === "rear-lane").minZ, -8.8);
  assert.equal(navigation.mapBounds.maxZ, 15.35);
});

test("both banks form a traversable closed loop across both bridges", () => {
  const result = walkRoute(navigation.routes.both_banks_loop);
  close(result.position.x, -18);
  close(result.position.z, 0.55);
  assert.ok(result.largestHeightStep < 0.04);
});

test("rear alley forms a traversable closed loop without entering shops", () => {
  const result = walkRoute(navigation.routes.rear_lane_loop);
  close(result.position.x, navigation.spawn.x);
  close(result.position.z, navigation.spawn.z);
  close(result.largestHeightStep, 0);
});

test("bridge endpoint and crown heights match the frozen Blender profiles", () => {
  for (const [coordinateX, rise] of [[9.4, 1.45], [-18, 0.55]]) {
    close(navigation.sampleHeight(coordinateX, 1.52), 0.85);
    close(navigation.sampleHeight(coordinateX, 1.755), 0.85);
    close(navigation.sampleHeight(coordinateX, 10.55), 0.85);
    close(navigation.sampleHeight(coordinateX, 10.85), 0.85);
    close(navigation.sampleHeight(coordinateX, (10.55 + 1.755) / 2), 0.85 + rise);
    for (const endpoint of [1.755, 10.55]) {
      assert.ok(Math.abs(navigation.sampleHeight(coordinateX, endpoint + 0.001) - navigation.sampleHeight(coordinateX, endpoint - 0.001)) < 0.001);
    }
  }
});

test("water, buildings and decorative distant terrain are never walkable", () => {
  for (const [coordinateX, coordinateZ] of [[0, 6], [-8, -3], [-1, -3], [5, -3], [0, 19], [-35, 1], [30, 12]]) {
    assert.equal(navigation.isWalkable(coordinateX, coordinateZ), false);
    assert.equal(navigation.sampleHeight(coordinateX, coordinateZ), null);
  }
});

test("large deltas cannot tunnel across the canal or through a facade", () => {
  let nearWater = navigation.reset({ x: 0, z: 0.55 });
  let nearWall = { ...nearWater };
  for (let attempt = 0; attempt < 20; attempt += 1) {
    nearWater = navigation.move(nearWater, { x: 0, z: 1e6 });
    nearWall = navigation.move(nearWall, { x: 0, z: -1e6 });
  }
  assert.ok(nearWater.z <= 1.52 - navigation.radius + 1e-8);
  assert.ok(nearWall.z >= -1.1 + navigation.radius - 1e-8);
  assert.ok(navigation.isWalkable(nearWater.x, nearWater.z));
  assert.ok(navigation.isWalkable(nearWall.x, nearWall.z));
});

test("far bank water edge and outer boundary constrain the full cat radius", () => {
  let inner = navigation.reset({ x: 0, z: 12.65 });
  let outer = { ...inner };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    inner = navigation.move(inner, { x: 0, z: -100 });
    outer = navigation.move(outer, { x: 0, z: 100 });
  }
  assert.ok(inner.z >= 10.85 + navigation.radius - 1e-8);
  assert.ok(outer.z <= 15.35 - navigation.radius + 1e-8);
});

test("diagonal input slides along the canal boundary instead of sticking", () => {
  const start = navigation.reset({ x: 0, z: 1.27 });
  const result = navigation.move(start, { x: 1, z: 1 });
  assert.ok(result.x > 0.95);
  assert.ok(result.z <= 1.52 - navigation.radius + 1e-8);
});

test("lamp sweep blocks a large move with the obstacle between its endpoints", () => {
  const start = navigation.reset({ x: -10.8, z: 1.2 });
  const result = navigation.move(start, { x: 4, z: 0 });
  assert.ok(result.x <= -9.2 - 0.24 - navigation.radius + 1e-8);
  assert.ok(navigation.isWalkable(result.x, result.z));
});

test("table, bicycle, planters and tree use blocking conservative proxies", () => {
  for (const obstacle of navigation.obstacles) {
    const coordinateX = obstacle.type === "circle" ? obstacle.x : (obstacle.minX + obstacle.maxX) / 2;
    const coordinateZ = obstacle.type === "circle" ? obstacle.z : (obstacle.minZ + obstacle.maxZ) / 2;
    assert.equal(navigation.isWalkable(coordinateX, coordinateZ), false, obstacle.id);
  }
  const result = navigation.move(navigation.reset({ x: -8, z: 0.7 }), { x: 0, z: -4 });
  assert.ok(result.z >= 0.225 + navigation.radius - 1e-8);
});

test("bridge side rails prevent sideways departure into water", () => {
  let position = navigation.reset({ x: 9.4, z: 6 });
  for (let attempt = 0; attempt < 5; attempt += 1) position = navigation.move(position, { x: -10, z: 0 });
  assert.ok(position.x >= 7.9 + navigation.radius - 1e-8);
  assert.ok(navigation.isWalkable(position.x, position.z));
});

test("reset repairs arbitrary invalid positions and ignores incoming vertical height", () => {
  for (const position of [null, {}, { x: NaN, z: 0 }, { x: Infinity, z: 0 }, { x: 0, z: 5 }]) {
    assert.deepEqual(navigation.reset(position), navigation.spawn);
    assert.deepEqual(navigation.move(position, { x: 3, z: 3 }), navigation.spawn);
  }
  assert.deepEqual(navigation.reset({ x: 0, y: -900, z: 0.55 }), { x: 0, y: 0.85, z: 0.55 });
});

test("invalid displacement is harmless and movement never mutates caller objects", () => {
  const position = Object.freeze({ ...navigation.spawn });
  for (const displacement of [null, {}, { x: NaN, z: 1 }, { x: 1, z: Infinity }, { x: 0, z: 0 }]) assert.deepEqual(navigation.move(position, displacement), position);
  const displacement = Object.freeze({ x: 0.1, z: 0.1 });
  assert.notEqual(navigation.move(position, displacement), position);
  assert.deepEqual(position, navigation.spawn);
});

test("an extreme finite delta has a bounded travel budget", () => {
  const result = navigation.move(navigation.spawn, { x: 1e300, z: 0 });
  assert.ok(Math.hypot(result.x - navigation.spawn.x, result.z - navigation.spawn.z) <= navigation.maxMoveDistance + 1e-8);
  assert.ok(navigation.isWalkable(result.x, result.z));
});

test("deterministic random controls remain on legal ground", () => {
  let state = 19;
  function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  }
  for (const start of [navigation.spawn, { x: 9.4, z: 6 }, { x: -18, z: 6 }, { x: 0, z: 12.65 }, { x: 0, z: -8 }]) {
    let position = navigation.reset(start);
    for (let step = 0; step < 150; step += 1) {
      position = navigation.move(position, { x: (random() - 0.5) * 2, z: (random() - 0.5) * 2 });
      assert.ok(navigation.isWalkable(position.x, position.z));
      assert.ok(Number.isFinite(position.y) && position.y >= 0.85);
    }
  }
});

test("invalid radius settings fail early", () => {
  for (const radius of [0, -1, 1, NaN, Infinity]) assert.throws(() => createNavigation({ radius }), RangeError);
});
