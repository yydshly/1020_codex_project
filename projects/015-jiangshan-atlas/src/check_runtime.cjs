// SPDX-License-Identifier: GPL-3.0-only
// Check the vendored source boundary and derive counts from actual data bundles.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const project=path.resolve(__dirname,'..');
const web=path.join(project,'web');
const root=path.join(web,'upstream');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'SOURCE.json'),'utf8'));
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
for(const file of manifest.files) {
  const local=fs.readFileSync(path.join(root,file.path));
  assert.equal(sha(local),file.local_sha256,`Vendored file changed: ${file.path}`);
  if(file.path.endsWith('.js')) new vm.Script(local.toString(),{filename:file.path});
  if(file.modified) assert.equal(file.path,'index.html');
}
const sandbox={window:{}};
vm.createContext(sandbox);
for(const name of ['map_data.js','lore_data.js','china_geo_data.js','atlas_boot.js','atlas_snapshots.js']) {
  vm.runInContext(fs.readFileSync(path.join(root,'js',name),'utf8'),sandbox,{filename:name});
}
const data=sandbox.window;
const dynasties=data.DYNASTY_DATA;
const stats={
  commit:manifest.commit,
  periods:dynasties.length,
  snapshots:Object.keys(data.ATLAS_SNAPSHOTS).length,
  phaseLinkedSnapshots:new Set(dynasties.flatMap(dynasty=>[
    ...(dynasty.snapKey?[dynasty.snapKey]:[]),
    ...(dynasty.phases||[]).map(phase=>phase.snap||phase.snapKey),
  ])).size,
  milestones:dynasties.reduce((sum,dynasty)=>sum+(dynasty.milestones||[]).length,0),
  settlementEntries:dynasties.reduce((sum,dynasty)=>sum+(dynasty.settlements||[]).length,0),
  personProfiles:data.ATLAS_LORE_DATA.PERSON_PROFILES.length,
  journeys:data.ATLAS_LORE_DATA.HISTORICAL_JOURNEYS.length,
};
assert.equal(stats.periods,18);
for(const dynasty of dynasties) {
  for(const phase of dynasty.phases||[]) assert.ok(data.ATLAS_SNAPSHOTS[phase.snap||phase.snapKey],`Missing ${phase.snap||phase.snapKey}`);
}
for(const name of ['showcase.js','guide.js','playbook.js']) {
  if(fs.existsSync(path.join(web,name))) new vm.Script(fs.readFileSync(path.join(web,name),'utf8'),{filename:name});
}
// Check local links and initial asset URLs in the new pages and original entry.
let checkedLinks=0;
for(const page of ['index.html','guide.html','playbook.html','upstream/index.html']) {
  const html=fs.readFileSync(path.join(web,page),'utf8');
  for(const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const href=match[1];
    if(/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(href)||!href) continue;
    const target=path.resolve(path.dirname(path.join(web,page)),decodeURIComponent(href.split(/[?#]/)[0]));
    if(!target.startsWith(web+path.sep) && target!==web) continue; // Parent catalog is supplied by the site's build.
    const resolved=fs.existsSync(target)&&fs.statSync(target).isDirectory()?path.join(target,'index.html'):target;
    assert.ok(fs.existsSync(resolved),`${page}: missing ${href}`);
    checkedLinks++;
  }
}
const statsPath=path.join(web,'capabilities.json');
if(process.argv.includes('--write-stats')) fs.writeFileSync(statsPath,JSON.stringify(stats,null,2)+'\n');
else assert.deepEqual(JSON.parse(fs.readFileSync(statsPath,'utf8')),stats,'Refresh capabilities.json');
console.log(JSON.stringify({verifiedFiles:manifest.files.length,checkedLinks,...stats},null,2));
