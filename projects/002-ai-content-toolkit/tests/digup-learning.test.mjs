import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const context = { window: {} };
vm.runInNewContext(await readFile(new URL('../src/digup-learning.js', import.meta.url), 'utf8'), context);
const { rank, cases } = context.window.DigUpLearning;

test('the teaching example distinguishes semantic relevance from an exact identifier', () => {
  assert.equal(rank(cases.meaning, 'semantic')[0].id, 'photo');
  assert.equal(rank(cases.meaning, 'keywords')[0].id, 'note');
  assert.equal(rank(cases.meaning, 'hybrid')[0].id, 'photo');
  assert.equal(rank(cases.exact, 'semantic')[0].id, 'wrong');
  assert.equal(rank(cases.exact, 'hybrid')[0].id, 'right');
  assert.equal(rank(cases.exact, 'hybrid')[0].score, 5.2);
});

test('an absent answer stays empty in every teaching mode', () => {
  for (const mode of ['semantic', 'keywords', 'hybrid']) {
    assert.equal(rank(cases.absent, mode).length, 0);
  }
});

test('candidate thresholds are inclusive and negatives cannot boost the fusion score', () => {
  const example = {lookup:false, rows:[
    {id:'below',z:1.999,coverage:0.499},
    {id:'semantic',z:2,coverage:0},
    {id:'keyword',z:-2,coverage:0.5}
  ]};
  const results = rank(example, 'hybrid');
  assert.equal(results.length, 2);
  assert.equal(results.some(row=>row.id==='below'), false);
  assert.equal(results.find(row=>row.id==='keyword').score, 2*0.5**1.5);
});
