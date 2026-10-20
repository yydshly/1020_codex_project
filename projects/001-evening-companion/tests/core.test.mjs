import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, restoreState, extractMemory, upsertMemory, demoReply, makeReminder, dueReminders } from '../src/ui/core.mjs';

test('questions and refusals do not become long-term facts', () => {
  for (const input of ['不要记住我的名字', '你记得我喜欢什么吗', '我喜欢什么', '我喜欢雨天吗？', '今天有点累']) assert.equal(extractMemory(input), null);
  assert.equal(extractMemory('记住：我喜欢雨天').text, '我喜欢雨天');
});
test('a changed name replaces the old name, including after restart', () => {
  const state = initialState();
  upsertMemory(state.memories, extractMemory('叫我小林'), 100);
  const restored = restoreState(JSON.stringify(state));
  upsertMemory(restored.memories, extractMemory('以后叫我小夏'), 200);
  assert.equal(restored.memories.length, 1);
  assert.equal(restored.memories[0].text, '称呼：小夏');
  assert.equal(restored.memories[0].createdAt, 100);
  assert.match(demoReply('我叫什么？', restored.memories), /小夏/);
  assert.doesNotMatch(demoReply('我叫什么？', restored.memories), /小林/);
});
test('duplicate explicit memories are updated rather than duplicated', () => {
  const memories = [];
  upsertMemory(memories, extractMemory('记住：喝茶'), 1);
  upsertMemory(memories, extractMemory('记住：喝茶'), 2);
  assert.equal(memories.length, 1);
  assert.equal(memories[0].updatedAt, 2);
});
test('quiet mode defers a due reminder; resume delivers it once', () => {
  const state = initialState();
  state.reminders.push(makeReminder('喝水', 10, 1000));
  assert.equal(dueReminders(state, 10999).length, 0);
  state.quiet = true;
  assert.equal(dueReminders(state, 12000).length, 0);
  const restored = restoreState(JSON.stringify(state)); restored.quiet = false;
  const due = dueReminders(restored, 13000);
  assert.equal(due.length, 1);
  due[0].status = 'done';
  assert.equal(dueReminders(restored, 14000).length, 0);
});
test('corrupt storage is recoverable and reminder values are validated', () => {
  assert.deepEqual(restoreState('{not-json'), initialState());
  assert.deepEqual(restoreState('{"version":2}'), initialState());
  assert.equal(restoreState('{"version":1,"messages":[null,{"role":"system","content":"bad"}]}').messages.length, 0);
  assert.throws(() => makeReminder('', 10));
  assert.throws(() => makeReminder('test', -1));
  assert.throws(() => makeReminder('test', Infinity));
});
