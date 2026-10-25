import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { CAR } from './vehicle.js';
import { createCarBodyGeometry } from './car-body.js';

function withBody(check) {
  const geometry = createCarBodyGeometry(), material = new MeshBasicMaterial();
  const body = new Mesh(geometry, material);
  body.updateMatrixWorld(true);
  const raycaster = new Raycaster();
  const sideHits = (side, y, z) => {
    raycaster.set(new Vector3(side * 2, y, z), new Vector3(-side, 0, 0));
    return raycaster.intersectObject(body);
  };
  try { check({ geometry, body, sideHits }); }
  finally { geometry.dispose(); material.dispose(); }
}

test('wheel arches preserve the body envelope in vehicle-local coordinates', () => {
  withBody(({ geometry }) => {
    assert.ok(geometry instanceof BufferGeometry);
    geometry.computeBoundingBox();
    for (const [key, low, high] of [['x', -0.89, 0.89], ['y', 0.36, 0.94], ['z', -0.79, 3.43]]) {
      assert.ok(Math.abs(geometry.boundingBox.min[key] - low) < 1e-6);
      assert.ok(Math.abs(geometry.boundingBox.max[key] - high) < 1e-6);
    }
    assert.ok([...geometry.getAttribute('position').array].every(Number.isFinite));
    assert.ok([...geometry.getAttribute('normal').array].every(Number.isFinite));
  });
});

test('each wheel arch opens through both sides directly over its axle', () => {
  withBody(({ sideHits }) => {
    for (const side of [-1, 1]) for (const axle of [0, CAR.wheelbase]) {
      for (const [offset, height] of [[0, 0.50], [-0.25, 0.50], [0.25, 0.50], [0, 0.69]]) {
        assert.equal(sideHits(side, height, axle + offset).length, 0, `arch at axle ${axle}, side ${side}, ${offset}/${height}`);
      }
    }
  });
});

test('door panels and material above or beyond the arches still block side views', () => {
  withBody(({ sideHits }) => {
    for (const side of [-1, 1]) {
      for (const [z, height] of [[CAR.wheelbase / 2, 0.5], [-0.7, 0.5], [3.3, 0.5]]) {
        const hit = sideHits(side, height, z)[0];
        assert.ok(hit, `solid panel at ${z}/${height}`);
        assert.ok(Math.abs(hit.point.x - side * 0.89) < 1e-6);
      }
      for (const axle of [0, CAR.wheelbase]) {
        assert.ok(sideHits(side, 0.8, axle).length > 0, 'body above wheel remains opaque');
        assert.ok(sideHits(side, 0.5, axle - 0.4).length > 0);
        assert.ok(sideHits(side, 0.5, axle + 0.4).length > 0);
      }
    }
  });
});

test('the curved arch clears the existing tire while its outer face stays inside the body', () => {
  withBody(({ geometry, sideHits }) => {
    geometry.computeBoundingBox();
    assert.ok(CAR.trackWidth / 2 + CAR.tireWidth / 2 < geometry.boundingBox.max.x);
    assert.ok(CAR.trackWidth / 2 + 0.255 / 2 < geometry.boundingBox.max.x, 'widest wheel spoke also fits');
    // Sample the actual 0.33 m tire circumference above the body's bottom edge.
    for (const axle of [0, CAR.wheelbase]) for (let angle = 0.15; angle < Math.PI - 0.15; angle += 0.15) {
      const y = 0.34 + 0.33 * Math.sin(angle), z = axle + 0.33 * Math.cos(angle);
      for (const side of [-1, 1]) assert.equal(sideHits(side, y, z).length, 0, `tire clears arch at axle ${axle}, angle ${angle}`);
    }
  });
});
