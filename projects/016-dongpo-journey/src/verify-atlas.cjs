// SPDX-License-Identifier: GPL-3.0-only
// Current atlas delivery checks. Archived 2D drafts and miniature scenes are excluded.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const project = path.resolve(__dirname, '..');
const web = path.join(project, 'web');
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const isFile = file => fs.existsSync(file) && fs.statSync(file).isFile();

const manifest = json(path.join(web, 'atlas-source.json'));
assert.equal(manifest.commit, '53059f1c7fed305807b19365857a5f135daf3ac6');
assert.equal(manifest.files.length, 54, 'The complete local source manifest must be retained');
assert.equal(new Set(manifest.files.map(file => file.path)).size, manifest.files.length);
for (const file of manifest.files) {
  const local = path.resolve(web, file.path);
  assert.ok(local.startsWith(web + path.sep), `Manifest path escapes web/: ${file.path}`);
  assert.equal(sha(local), file.sha256, `Upstream file differs from manifest: ${file.path}`);
}

// Execute real bundled data and the controller class without constructing the browser UI.
const sandbox = { window: { addEventListener() {} } };
vm.createContext(sandbox);
const sourceScripts = ['china_geo_data.js', 'map_data.js', 'lore_data.js', 'atlas_boot.js', 'atlas_snapshots.js', 'app.js'];
for (const file of sourceScripts) {
  vm.runInContext(read(path.join(web, 'js', file)), sandbox, { filename: file, timeout: 10000 });
}
const data = sandbox.window;
const dynasties = data.DYNASTY_DATA;
const snapshots = data.ATLAS_SNAPSHOTS;
const lore = data.ATLAS_LORE_DATA;
assert.equal(dynasties.length, 18);
assert.equal(new Set(dynasties.map(item => item.key)).size, dynasties.length);
assert.equal(lore.PERSON_PROFILES.length, 113);
assert.equal(lore.HISTORICAL_JOURNEYS.length, 7);
assert.equal(new Set(lore.PERSON_PROFILES.map(item => item.key)).size, lore.PERSON_PROFILES.length);
assert.equal(new Set(lore.HISTORICAL_JOURNEYS.map(item => item.key)).size, lore.HISTORICAL_JOURNEYS.length);

const app = Object.create(data.HistoricalAtlasController.prototype);
Object.assign(app, {
  dynasties, snapshots, provinces: data.PROVINCE_OUTLINES, corridors: data.CORRIDOR_DATA,
  hydroData: data.HYDRO_DATA, year: 1080, locale: 'zh',
  minYear: dynasties[0].fromYear, maxYear: dynasties.at(-1).toYear,
  projector: new data.MercatorProjector(1000, 700, { west: 66, east: 142, south: 14, north: 55 }),
  enLocale: { strings: {}, dynasties: {}, milestones: {}, corridors: {}, dict: {} },
});
app._hydrateSnapshots();
for (const method of ['locate', 'inspect', 'resolvePlace', 'openPersonChronicle', 'jumpToYear', 'selectPersonEvent', 'selectCustomRouteStop', 'openGenealogyAt']) {
  assert.equal(typeof app[method], 'function', `Missing controller API: ${method}`);
}
const referenced = new Set();
for (const dynasty of dynasties) {
  assert.ok(Number.isFinite(dynasty.fromYear) && Number.isFinite(dynasty.toYear));
  const keys = dynasty.phases?.length
    ? dynasty.phases.map(phase => phase.snap || phase.snapKey)
    : [dynasty.snapKey || `s_${dynasty.key}`];
  for (const key of keys) {
    assert.ok(snapshots[key], `${dynasty.key}: unresolved snapshot ${key}`);
    referenced.add(key);
  }
  for (const year of [dynasty.fromYear, dynasty.focusYear, dynasty.toYear - 1]) {
    assert.ok(snapshots[app._resolveSnapKey(dynasty, year)], `No map snapshot for ${dynasty.key} at ${year}`);
  }
}
// 166 explicit phase keys plus the modern period's implicit s_prc fallback.
assert.equal(referenced.size, 167);
const seenShapes = new WeakSet();
let geometryVertices = 0;
const validCoord = (coord, label) => {
  assert.ok(Array.isArray(coord) && coord.length >= 2 && coord.slice(0, 2).every(Number.isFinite), `Invalid coordinate: ${label}`);
  assert.ok(Math.abs(coord[0]) <= 180 && Math.abs(coord[1]) <= 90, `Out-of-range coordinate: ${label}`);
};
for (const key of referenced) {
  const snapshot = snapshots[key];
  // The modern snapshot uses province regions rather than a historical polity fill.
  assert.ok((snapshot.polities?.length || 0) + (snapshot.regions?.length || 0), `${key}: no map geometry`);
  for (const feature of [...snapshot.polities, ...(snapshot.regions || []), ...(snapshot.prefectures || [])]) {
    const shape = feature.shape;
    assert.ok(shape && ['Polygon', 'MultiPolygon'].includes(shape.type), `${key}: missing polygon for ${feature.title}`);
    if (seenShapes.has(shape)) continue;
    seenShapes.add(shape);
    const polygons = shape.type === 'Polygon' ? [shape.coordinates] : shape.coordinates;
    assert.ok(polygons.length, `${key}: empty geometry`);
    for (const polygon of polygons) for (const ring of polygon) {
      assert.ok(ring.length >= 3, `${key}: invalid ring`);
      for (const coord of ring) { validCoord(coord, feature.title); geometryVertices++; }
    }
  }
}
for (const journey of lore.HISTORICAL_JOURNEYS) {
  assert.ok(journey.stops.length >= 2, `${journey.key}: route requires multiple stops`);
  for (const stop of journey.stops) {
    validCoord(stop.coord, journey.key);
    assert.ok(Number.isFinite(stop.year) && stop.year !== 0, `${journey.key}: missing historical year`);
  }
}
const personEvents = {};
for (const name of ['苏轼', '李白', '秦始皇']) {
  const person = app._resolvePersonProfile(name);
  assert.ok(person, `Person search failed: ${name}`);
  const events = app._collectPersonEvents(person);
  assert.ok(events.length >= 3, `Person chronology incomplete: ${name}`);
  for (const event of events) if (event.coord) validCoord(event.coord, name);
  personEvents[name] = events.length;
}
const resolvedPlaces = {};
for (const [name, year] of [['长安', 741], ['赤壁', 208], ['湖州', 1079], ['黄州', 1080], ['惠州', 1094], ['儋州', 1097]]) {
  const place = app.resolvePlace(name, year);
  assert.ok(place, `Place search failed: ${name}`);
  validCoord(place.coord, name);
  resolvedPlaces[name] = Array.from(place.coord);
}
assert.equal(app.resolvePlace('这不是任何历史地名xqz', 1080), null, 'Unknown place should not resolve');

const demPath = path.join(web, 'assets/atlas-elevation.json');
const dem = json(demPath);
const terrainSource = json(path.join(web, 'assets/atlas-elevation-source.json'));
assert.equal(dem.width, 361);
assert.equal(dem.height, 253);
assert.equal(dem.heights.length, 91333);
assert.equal(dem.heights.length, dem.width * dem.height);
assert.ok(dem.heights.every(Number.isFinite), 'Non-finite elevation samples');
assert.equal(dem.units, 'meters');
assert.equal(sha(demPath), terrainSource.output_sha256, 'DEM differs from provenance manifest');
assert.deepEqual(dem.projection, terrainSource.projection);
assert.equal(terrainSource.grid.samples, dem.heights.length);
assert.equal(dem.projection.type, 'MercatorProjector');
assert.equal(dem.projection.width, 1000);
assert.equal(dem.projection.height, 700);
assert.deepEqual(dem.projection.bounds, { west: 66, east: 142, south: 14, north: 55 });
const projector = new data.MercatorProjector(1000, 700, dem.projection.bounds);
for (const key of ['scale', 'padX', 'padY']) {
  assert.ok(Math.abs(projector[key] - dem.projection[key]) < 1e-8, `DEM/controller projection mismatch: ${key}`);
}
for (const coord of [[66, 14], [142, 55], ...Object.values(resolvedPlaces)]) {
  const screen = projector.toScreen(...coord);
  const roundTrip = projector.toGeo(...screen);
  assert.ok(Math.abs(roundTrip[0] - coord[0]) < 1e-8 && Math.abs(roundTrip[1] - coord[1]) < 1e-8, 'Geographic projection round trip failed');
}
assert.ok(Math.max(...dem.heights) > 5000 && Math.min(...dem.heights) < -5000, 'DEM must contain real mountains and bathymetry');
assert.deepEqual([Math.min(...dem.heights), Math.max(...dem.heights)], terrainSource.value_range_meters);
for (const tile of terrainSource.tiles) {
  const file = path.resolve(project, tile.local_file);
  assert.equal(sha(file), tile.sha256, `Source terrain tile changed: ${tile.local_file}`);
}

const threeSource = json(path.join(web, 'vendor/three/source.json'));
assert.equal(threeSource.version, '0.180.0');
for (const file of threeSource.files) assert.equal(sha(path.join(web, 'vendor/three', file.path)), file.sha256, file.path);
for (const file of ['atlas-workbench.js', 'atlas-terrain.js', ...sourceScripts.map(name => `js/${name}`)]) {
  execFileSync(process.execPath, ['--check', path.join(web, file)], { stdio: 'pipe' });
}

let localResources = 0;
const checkedCss = new Set();
function checkResource(reference, owner) {
  if (!reference || /^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(reference)) return;
  const clean = decodeURIComponent(reference.replace(/&amp;/g, '&').split(/[?#]/)[0]);
  if (!clean) return;
  let target = clean.startsWith('/') ? path.resolve(web, '.' + clean) : path.resolve(path.dirname(owner), clean);
  assert.ok(target === web || target.startsWith(web + path.sep), `Local dependency escapes project: ${reference}`);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  assert.ok(isFile(target), `${path.relative(web, owner)}: missing local resource ${reference}`);
  localResources++;
  if (target.endsWith('.css') && !checkedCss.has(target)) {
    checkedCss.add(target);
    for (const match of read(target).matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) checkResource(match[1], target);
  }
}
const index = path.join(web, 'index.html');
const html = read(index);
assert.ok(!/<iframe\b/i.test(html), 'The independent atlas must run directly, not in an iframe');
for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) checkResource(match[1], index);
const importMapMatch = html.match(/<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
assert.ok(importMapMatch, 'Local Three.js import map missing');
const imports = JSON.parse(importMapMatch[1]).imports;
for (const file of ['atlas-workbench.js', 'atlas-terrain.js']) {
  const owner = path.join(web, file);
  for (const match of read(owner).matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g)) {
    let specifier = match[1];
    if (!specifier.startsWith('.')) {
      const key = Object.keys(imports).sort((a, b) => b.length - a.length).find(key => key === specifier || key.endsWith('/') && specifier.startsWith(key));
      assert.ok(key, `Unresolved module import ${specifier}`);
      specifier = imports[key] + specifier.slice(key.length);
    }
    checkResource(specifier, owner);
  }
}

console.log(JSON.stringify({
  delivery: 'independent historical atlas with linked 2D/3D map',
  upstreamFilesVerified: manifest.files.length,
  periods: dynasties.length,
  snapshotKeys: Object.keys(snapshots).length,
  referencedSnapshots: referenced.size,
  geometryVertices,
  milestones: dynasties.reduce((sum, dynasty) => sum + (dynasty.milestones || []).length, 0),
  settlementEntries: dynasties.reduce((sum, dynasty) => sum + (dynasty.settlements || []).length, 0),
  personProfiles: lore.PERSON_PROFILES.length,
  journeys: lore.HISTORICAL_JOURNEYS.length,
  personEvents,
  placeQueriesPassed: Object.keys(resolvedPlaces).length,
  elevationSamples: dem.heights.length,
  elevationTilesVerified: terrainSource.tiles.length,
  projectionMatchesController: true,
  threeFilesVerified: threeSource.files.length,
  localResources,
  browserInteractionVerification: 'separate browser verification required',
}, null, 2));
