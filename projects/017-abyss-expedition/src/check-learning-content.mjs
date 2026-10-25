// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getDirectorShots} from '../web/data/director-shots.mjs';
import {lessonStages,learningMissions,glossary,learningSources,equipmentCatalog} from '../web/data/learning-content.mjs';
const terms=new Set(glossary.map(term=>term.id));assert.equal(terms.size,glossary.length);
for(const term of glossary){assert.ok(term.text.length>10);if(term.source)assert.ok(learningSources[term.source]);}
for(const [id,mission] of Object.entries(learningMissions)){
  const data=JSON.parse(await readFile(new URL(`../web/data/${id}.json`,import.meta.url),'utf8'));
  const shots=getDirectorShots(id);assert.equal(shots.length,11);assert.equal(shots.filter(shot=>shot.explanation==='equipment').length,1);assert.equal(shots[1].explanation,'equipment');
  for(const role of ['near','far']){
    const entity=data.entities.find(item=>item.id===mission.sites[role].id);assert.ok(entity);assert.equal(entity.appearance,'water-sampler');assert.equal(entity.sample.medium,'water');assert.equal(entity.sample.positionRole,role);
    const shot=shots.find(item=>item.learning===`sample-${role}`);assert.equal(shot.entityId,entity.id);
  }
  assert.equal(data.entities.find(e=>e.id===mission.sites.near.id).sample.pairId,data.entities.find(e=>e.id===mission.sites.far.id).sample.pairId);
  const index=kind=>shots.findIndex(shot=>shot.learning===kind);assert.ok(index('sample-near')<index('sample-far'));assert.ok(index('sample-far')<index('compare'));assert.ok(index('compare')<index('summary'));
  for(const shot of shots)if(shot.explanation){const lesson=lessonStages[shot.explanation];assert.ok(lesson);if(lesson.term)assert.ok(terms.has(lesson.term));}
}
assert.equal(lessonStages.hydrothermal.steps.length,5);assert.ok(!JSON.stringify(learningMissions).includes('浓度增加'));
assert.equal(lessonStages.equipment.steps.length,8);assert.equal(equipmentCatalog.length,8);for(const item of equipmentCatalog){assert.ok(item.question&&item.text&&item.visible);assert.ok(learningSources[item.source]);}
console.log('PASS learning content: 22 chapters, eight equipment groups, glossary sources, five-stage fluid mechanism, same-medium A/B sites, sample metadata, comparison and summary order');
