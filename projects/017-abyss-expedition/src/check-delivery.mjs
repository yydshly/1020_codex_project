// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {missions} from '../web/data/missions.mjs';
import {getDirectorShots,directorMissionBriefs} from '../web/data/director-shots.mjs';
import {validateShots} from '../web/core/director-core.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const web=path.join(root,'web');
let localLinks=0;
for(const page of ['index.html','method.html','research.html','overview.html']){
  const html=await readFile(path.join(web,page),'utf8');
  for(const match of html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)){
    const raw=match[1];if(/^(?:https?:|data:|mailto:)/.test(raw))continue;
    const target=decodeURIComponent(raw.split(/[?#]/)[0]);if(!target)continue;
    await access(path.resolve(web,target));localLinks++;
  }
}
const provenance=JSON.parse(await readFile(path.join(web,'vendor/three/source.json'),'utf8'));
for(const file of provenance.files){
  const bytes=await readFile(path.join(web,'vendor/three',file.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,`Third-party file changed: ${file.path}`);
}
const sources=JSON.parse(await readFile(path.join(web,'sources.json'),'utf8'));
const materials=JSON.parse(await readFile(path.join(web,'assets/materials/sources.json'),'utf8'));
for(const file of materials.files){
  const bytes=await readFile(path.join(web,'assets/materials',file.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,`Material file changed: ${file.path}`);
}
const sourceIds=new Set(sources.map(source=>source.id));
const observationNotes=JSON.parse(await readFile(path.join(web,'data/observation-notes.json'),'utf8'));
let directorShots=0;
for(const name of ['vents','canyon']){
  const mission=JSON.parse(await readFile(path.join(web,'data',name+'.json'),'utf8'));
  assert.ok(mission.dataNotice.includes('教学模拟'));
  assert.equal(mission.entities.length,8);
  assert.equal(mission.events.length,10);
  assert.ok(mission.events.some(event=>event.id===missions.find(meta=>meta.id===name)?.entryEventId),'Featured entry must refer to a real mission event');
  assert.ok(mission.entities.filter(entity=>entity.sample).length>=3);
  for(const entity of mission.entities){const note=observationNotes[`${name}.${entity.id}`];assert.ok(note,`Missing observation note ${name}.${entity.id}`);for(const field of ['focus','method','compare'])assert.ok(typeof note[field]==='string'&&note[field].length>0&&note[field].length<=35,`Invalid observation note ${field}`);}
  for(const entity of mission.entities)for(const id of entity.sourceIds)assert.ok(sourceIds.has(id),`Missing source ${id}`);
  for(const event of mission.events)assert.ok(mission.frames.some(frame=>frame.time===event.time),'Every event needs a matching telemetry keyframe');
  const shots=getDirectorShots(name);validateShots(shots);directorShots+=shots.length;
  assert.ok(directorMissionBriefs[name].notice.includes('教学模拟'));
  for(const shot of shots){const event=mission.events.find(event=>event.id===shot.eventId);assert.ok(event&&event.entityId===shot.entityId,`Director shot must match its mission event: ${shot.id}`);assert.ok(['establishing','approach','orbit','detail','compare','departure'].includes(shot.framing));assert.ok(shot.objective&&shot.callouts.length>0);}
}
for(const file of ['app.js','scene.js']){
  const code=await readFile(path.join(web,file),'utf8');
  assert.ok(!/from\s+['"][^'"]*(?:upstream|atlas-terrain|atlas-workbench)/.test(code),'Do not import original atlas runtime');
}
console.log(JSON.stringify({passed:true,localLinks,thirdPartyFiles:provenance.files.length,materialFiles:materials.files.length,scienceSources:sourceIds.size,missions:2,directorShots,atlasRuntimeImported:false},null,2));
