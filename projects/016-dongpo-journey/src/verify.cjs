// SPDX-License-Identifier: GPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const project=path.resolve(__dirname,'..'),web=path.join(project,'web');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(web,'assets/map-source.json'),'utf8'));
manifest.outputs.forEach(file=>assert.equal(sha(path.join(web,'assets',file.path)),file.sha256,file.path));
const map=JSON.parse(fs.readFileSync(path.join(web,'assets/map-data.json'),'utf8'));
const sandbox={window:{}};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(web,'story.js'),'utf8'),sandbox);
const stops=sandbox.window.DONGPO_STORY.stops;
assert.equal(stops.length,3);assert.equal(new Set(stops.map(stop=>stop.id)).size,3);
const years=[1080,1094,1097];
stops.forEach((stop,index)=>{
  assert.equal(stop.year,years[index]);
  assert.deepEqual(Array.from(stop.coord),map.places.find(place=>place.id===stop.id).coord);
  assert.ok(stop.sources.length>=2);
  stop.sources.forEach(source=>assert.ok(new URL(source.url).protocol==='https:'));
  assert.ok(map.snapshots[map.places[index].snapshot]);
});
let vertices=0;
for(const snapshot of Object.values(map.snapshots)) for(const feature of snapshot.features) {
  const points=feature.geometry.type==='Polygon'?feature.geometry.coordinates.flat():feature.geometry.coordinates.flat(2);
  points.forEach(point=>{assert.ok(point.every(Number.isFinite));assert.ok(Math.abs(point[0])<=180&&Math.abs(point[1])<=85);vertices++;});
}
['app.js','story.js','app-3d.js','scenes.js'].forEach(file=>execFileSync(process.execPath,['--check',path.join(web,file)],{stdio:'pipe'}));
const elevation=JSON.parse(fs.readFileSync(path.join(web,'assets/elevation.json'),'utf8'));
const elevationSource=JSON.parse(fs.readFileSync(path.join(web,'assets/elevation-source.json'),'utf8'));
assert.equal(elevation.heights.length,elevation.width*elevation.height);
assert.ok(elevation.heights.every(Number.isFinite));
assert.ok(Math.max(...elevation.heights)>1000&&Math.min(...elevation.heights)<-10);
assert.equal(sha(path.join(web,'assets/elevation.json')),elevationSource.output_sha256);
stops.forEach(stop=>assert.ok(stop.coord[0]>elevation.bounds.west&&stop.coord[0]<elevation.bounds.east&&stop.coord[1]>elevation.bounds.south&&stop.coord[1]<elevation.bounds.north));
const threeSource=JSON.parse(fs.readFileSync(path.join(web,'vendor/three/source.json'),'utf8'));
assert.equal(threeSource.version,'0.180.0');
threeSource.files.forEach(file=>assert.equal(sha(path.join(web,'vendor/three',file.path)),file.sha256,file.path));
let links=0;
for(const file of ['index.html','process.html','map-2d.html']) {
  const html=fs.readFileSync(path.join(web,file),'utf8');
  assert.ok(!/<iframe\b/i.test(html),'Independent implementation should not embed the source app');
  for(const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    if(/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(match[1])) continue;
    const target=path.resolve(web,decodeURIComponent(match[1].split(/[?#]/)[0]));
    assert.ok(fs.existsSync(target),`${file}: ${match[1]}`);links++;
  }
}
console.log(JSON.stringify({stops:stops.map(stop=>({id:stop.id,year:stop.year})),historicalSnapshots:Object.keys(map.snapshots).length,polityVertices:vertices,rivers:map.rivers.length,localLinks:links,upstreamFilesVerified:manifest.outputs.length,elevationSamples:elevation.heights.length,elevationTiles:elevationSource.tiles.length,threeVersion:threeSource.version,threeFilesVerified:threeSource.files.length,independentPages:3},null,2));
