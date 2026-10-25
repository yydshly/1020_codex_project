import test from 'node:test';
import assert from 'node:assert/strict';
import { observationGuide, recognitionChallenge } from './observation-guide.js';

test('all modes can describe missing body or stripe without demanding hidden references', () => {
  for (const side of ['left', 'right']) {
    assert.equal(observationGuide(side).needsAdjustment, true);
    const absent = observationGuide(side, { body: { visible: true }, lineVisible: false });
    assert.match(absent.text, /不用找后轮或库角/);
    assert.doesNotMatch(absent.look, /后轮|库角/);
    const stripe = observationGuide(side, { body: { visible: true }, lineVisible: true, cornerVisible: false });
    assert.match(stripe.look, /车身与库侧线/);
    assert.match(stripe.text, /镜中可能倾斜或弯曲/);
    assert.doesNotMatch(stripe.text, /黄色纵线/);
  }
});

test('a tiny visible side-line fragment does not unlock trajectory judgment', () => {
  const observation = { body: { visible: true }, lineVisible: true, lineReadable: false };
  assert.equal(recognitionChallenge('compare', observation).available, false);
  assert.equal(recognitionChallenge('mirror', observation).available, true);
  assert.match(observationGuide('left', observation).text, /不足以比较走势/);
});

test('a visible bay-back stripe is identified separately and cannot replace the side stripe', () => {
  const observation = { body: { visible: true }, lineVisible: true, lineReadable: true, backLine: { visible: true } };
  assert.match(observationGuide('right', observation).text, /库底线，不能用它判断/);
  assert.match(observationGuide('right', observation).text, /不把两镜画面宽窄直接/);
  const onlyBack = { ...observation, lineVisible: false };
  assert.equal(recognitionChallenge('compare', onlyBack).available, false);
});

test('a visible entrance edge is never described as a bay-back stripe', () => {
  const observation = { body: { visible: true }, lineVisible: true, lineReadable: true,
    entranceLine: { visible: true }, backLine: { visible: false } };
  const guide = observationGuide('left', observation);
  assert.match(guide.text, /库口外沿，不是库底/);
  assert.doesNotMatch(guide.text, /库尾横向封口/);
});

test('recognition must use available references and does not accept the wheel or mirror frame', () => {
  assert.equal(recognitionChallenge('mirror').available, false);
  assert.equal(recognitionChallenge('mirror', { body: { visible: true } }).correct, 'body');
  assert.equal(recognitionChallenge('compare', { body: { visible: true }, lineVisible: false }).available, false);
  const challenge = recognitionChallenge('compare', { body: { visible: true }, lineVisible: true });
  assert.equal(challenge.available, true);
  assert.equal(challenge.correct, 'relation');
  assert.equal(recognitionChallenge('turn'), null);
});

test('a visible corner or stripe cannot replace an occluded body reference in the observation gate', () => {
  for (const side of ['left', 'right']) {
    const observation = { body: { visible: false }, lineVisible: true, cornerVisible: true };
    const guide = observationGuide(side, observation);
    assert.equal(guide.needsAdjustment, true);
    assert.match(guide.look, /找到本车车身/);
    assert.equal(recognitionChallenge('mirror', observation).available, false);
    assert.equal(recognitionChallenge('compare', observation).available, false);
  }
});

test('recognition is available only for explicitly visible references, with unique valid answer choices', () => {
  assert.equal(recognitionChallenge('mirror', { body: { visible: 'true' } }).available, false);
  assert.equal(recognitionChallenge('compare', { body: { visible: true }, lineVisible: 1 }).available, false);
  for (const step of ['mirror', 'compare']) {
    const challenge = recognitionChallenge(step, { body: { visible: true }, lineVisible: true, cornerVisible: false });
    assert.equal(challenge.available, true, 'a hidden corner is not required for either recognition task');
    assert.equal(challenge.options.filter(option => option.value === challenge.correct).length, 1);
    assert.equal(new Set(challenge.options.map(option => option.value)).size, challenge.options.length);
    assert.notEqual(challenge.correct, 'wheel');
    assert.notEqual(challenge.correct, 'frame');
  }
});
