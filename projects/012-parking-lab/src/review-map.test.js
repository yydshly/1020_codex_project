import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewMapGeometry, renderReviewMap } from './review-map.js';

const pose = (x, z = 0, heading = Math.PI / 2, time = 0) => ({ x, z, heading, time, steer: 0 });
const reference = Array.from({ length: 11 }, (_, index) => pose(index, 0, Math.PI / 2, index));

test('partial attempts keep the full reference and match distance from the initial spatial pose', () => {
  const map = buildReviewMapGeometry({ frames: [pose(4), pose(6, 1)], referenceFrames: reference, selectedIndex: 1 });
  assert.equal(map.reference.length, 11);
  assert.equal(map.referenceStart.state.x, 4);
  assert.equal(map.selected.state.x, 6);
  assert.equal(map.selected.state.z, 1);
  assert.ok(Math.abs(map.referenceCurrent.x - (4 + Math.sqrt(5))) < 1e-9);
  assert.equal(map.referenceCurrent.z, 0);
  // The current reference car does not simply follow the nearest x=6 pose.
  assert.ok(map.referenceCurrent.x > 6.2);
});

test('different clocks and stored lifetime distances do not change the comparison', () => {
  const frames = [pose(2, 0, Math.PI / 2, 100), pose(3, 0, Math.PI / 2, 500)];
  const first = buildReviewMapGeometry({ frames, referenceFrames: reference });
  const second = buildReviewMapGeometry({ frames: frames.map(frame => ({ ...frame, time: 0, distance: 9999 })), referenceFrames: reference.map(frame => ({ ...frame, time: 800, distance: 888 })) });
  assert.equal(first.distance, 1);
  assert.equal(first.referenceCurrent.x, 3);
  assert.equal(first.referenceCurrent.x, second.referenceCurrent.x);
});

test('reference origin uses heading to distinguish coincident poses', () => {
  const map = buildReviewMapGeometry({ frames: [pose(0)], referenceFrames: [pose(0, 0, -Math.PI / 2), pose(0), pose(1)] });
  assert.equal(map.referenceStart.index, 1);
  assert.equal(map.referenceCurrent.heading, Math.PI / 2);
});

test('empty and stationary tracks remain finite and preserve source event indices', () => {
  const empty = buildReviewMapGeometry();
  assert.equal(empty.selected, null);
  assert.equal(empty.referenceCurrent, null);
  assert.ok(Number.isFinite(empty.scale) && empty.scale > 0);
  const map = buildReviewMapGeometry({ frames: [pose(2), null, pose(2), pose(2)], referenceFrames: [pose(2), pose(2)], selectedIndex: 2, turnIndex: 0, centerIndex: 2, issueIndex: 400 });
  assert.equal(map.distance, 0);
  assert.equal(map.selected.index, 2);
  assert.deepEqual(map.events.map(event => event.index), [0, 2]);
  assert.deepEqual(map.project(map.selected.state), map.project(map.referenceCurrent));
});

test('the projection retains real lateral errors using one scale for both axes', () => {
  const map = buildReviewMapGeometry({ frames: [pose(4, 1), pose(6, 1)], referenceFrames: reference });
  const a = map.project(pose(6, 1)), b = map.project(pose(6, 0)), c = map.project(pose(7, 0));
  assert.ok(Math.abs(Math.abs(a.y - b.y) - Math.abs(c.x - b.x)) < 1e-9);
  assert.ok(Math.abs(a.y - b.y) > 0);
});

class Element {
  constructor(name, document) { this.name = name; this.ownerDocument = document; this.attributes = {}; this.children = []; this.textContent = ''; }
  setAttribute(name, value) { this.attributes[name] = value; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
}
const document = { createElementNS: (_namespace, name) => new Element(name, document) };

test('renderer replaces the map and supplies stable accessible labels for empty and populated states', () => {
  const svg = new Element('svg', document);
  renderReviewMap(svg);
  const titleId = svg.children[0].attributes.id;
  assert.equal(svg.attributes.viewBox, '0 0 520 260');
  assert.equal(svg.attributes.role, 'img');
  assert.ok(svg.attributes['aria-labelledby'].includes(titleId));
  renderReviewMap(svg, { frames: [pose(4), pose(5)], referenceFrames: reference, turnIndex: 0 });
  assert.equal(svg.children.length, 3);
  assert.equal(svg.children[0].attributes.id, titleId);
  assert.ok(svg.children[1].textContent.includes('行驶 1.00 米'));
  assert.equal(JSON.stringify(svg.children, (key, value) => key === 'ownerDocument' ? undefined : value).includes('NaN'), false);
});
