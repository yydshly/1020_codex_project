import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createNarrator, NARRATION } from './narration.js';

class FakeAudio {
  constructor(src) { this.src = src; this.handlers = new Map(); this.playCalls = 0; this.pauseCalls = 0; }
  addEventListener(event, handler) { this.handlers.set(event, handler); }
  removeEventListener(event, handler) { if (this.handlers.get(event) === handler) this.handlers.delete(event); }
  play() { this.playCalls++; return this.pending ?? Promise.resolve(); }
  pause() { this.pauseCalls++; }
  removeAttribute() {}
  load() {}
  emit(event) { this.handlers.get(event)?.(); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const resolveClip = key => ({ src: `/parking/audio/minimax/${key}-test.mp3`, provider: 'minimax' });
function harness() {
  const clips = [], states = [];
  const player = createNarrator({ resolveClip, audioFactory: src => { const audio = new FakeAudio(src); clips.push(audio); return audio; }, onStatus: status => states.push(status) });
  return { player, clips, states };
}

test('narration finishes and loads assets relative to the configured app base', async () => {
  const { player, clips } = harness();
  const played = player.play('straight');
  assert.equal(clips[0].src, '/parking/audio/minimax/straight-test.mp3');
  await tick();
  assert.equal(player.status.state, 'playing');
  clips[0].emit('ended');
  assert.equal(await played, 'ended');
  assert.deepEqual(player.status, { state: 'ended', key: 'straight' });
});

test('replacement cancels old clip; stale completion cannot stop its replacement', async () => {
  const { player, clips } = harness();
  const first = player.play('intro');
  const staleEnded = clips[0].handlers.get('ended');
  const second = player.play('right_turn');
  assert.equal(await first, 'cancelled');
  assert.equal(clips[0].pauseCalls, 1);
  staleEnded();
  await tick();
  assert.deepEqual(player.status, { state: 'playing', key: 'right_turn' });
  clips[1].emit('ended');
  assert.equal(await second, 'ended');
});

test('pause while loading stays paused when the pending play promise resolves', async () => {
  let release;
  const audio = new FakeAudio('');
  audio.pending = new Promise(resolve => { release = resolve; });
  const player = createNarrator({ resolveClip, audioFactory: () => audio });
  const played = player.play('center');
  player.pause();
  release();
  await tick();
  assert.equal(player.status.state, 'paused');
  assert.equal(audio.pauseCalls, 2);
  player.resume();
  await tick();
  assert.equal(player.status.state, 'playing');
  assert.equal(audio.playCalls, 2);
  player.stop();
  assert.equal(await played, 'cancelled');
  assert.equal(player.status.state, 'idle');
});

test('blocked autoplay reports actionable error and allows a later new play', async () => {
  let attempt = 0;
  const player = createNarrator({ resolveClip, audioFactory: src => {
    const audio = new FakeAudio(src);
    if (attempt++ === 0) audio.play = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    return audio;
  } });
  assert.equal(await player.play('intro'), 'error');
  assert.match(player.status.message, /点击播放/);
  const retry = player.play('intro');
  await tick();
  assert.equal(player.status.state, 'playing');
  player.stop();
  assert.equal(await retry, 'cancelled');
});

test('missing media reports failure; persistent volume and rate are clamped', async () => {
  const { player, clips } = harness();
  player.setVolume(0.3);
  player.setRate(1.2);
  const first = player.play('park');
  assert.equal(clips[0].volume, 0.3);
  assert.equal(clips[0].playbackRate, 1.2);
  clips[0].emit('error');
  assert.equal(await first, 'error');
  const second = player.play('finish', { rate: 5, volume: -2 });
  assert.equal(clips[1].volume, 0);
  assert.equal(clips[1].playbackRate, 2);
  player.stop();
  assert.equal(await second, 'cancelled');
});

test('unknown narration key settles without creating an audio request', async () => {
  const { player, clips } = harness();
  assert.equal(await player.play('unknown'), 'error');
  assert.equal(clips.length, 0);
  assert.ok(Object.values(NARRATION).every(clip => clip.title && clip.text));
});

test('playback progress reports timing and preserves it while paused', async () => {
  const { player, clips } = harness();
  const played = player.play('center');
  await tick();
  clips[0].currentTime = 2.5;
  clips[0].duration = 10;
  clips[0].emit('timeupdate');
  assert.equal(player.status.currentTime, 2.5);
  assert.equal(player.status.duration, 10);
  player.pause();
  assert.equal(player.status.state, 'paused');
  assert.equal(player.status.currentTime, 2.5);
  player.stop();
  assert.equal(await played, 'cancelled');
  assert.deepEqual(player.status, { state: 'idle', key: null });
});

test('quick pause and resume ignores the cancelled earlier play attempt', async () => {
  let rejectFirst;
  const audio = new FakeAudio('');
  audio.pending = new Promise((_, reject) => { rejectFirst = reject; });
  const player = createNarrator({ resolveClip, audioFactory: () => audio });
  const played = player.play('center');
  player.pause();
  audio.pending = Promise.resolve();
  player.resume();
  rejectFirst(Object.assign(new Error('interrupted'), { name: 'AbortError' }));
  await tick();
  assert.equal(player.status.state, 'playing');
  audio.emit('ended');
  assert.equal(await played, 'ended');
});

test('legacy Huihui audio retains its original source and exact generation provenance', async () => {
  const source = JSON.parse(await readFile(new URL('../public/audio/narration-source.json', import.meta.url), 'utf8'));
  const build = JSON.parse(await readFile(new URL('../public/audio/narration-build.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(build.clips).sort(), Object.keys(source).sort());
  assert.equal(build.voice, 'Microsoft Huihui Desktop');
  for (const [key, clip] of Object.entries(source)) {
    const data = await readFile(new URL(`../public/audio/${key}.wav`, import.meta.url));
    assert.equal(build.clips[key].text, clip.text, `${key}: audio was generated from an old caption`);
    assert.equal(build.clips[key].bytes, data.length, `${key}: truncated audio`);
    assert.equal(build.clips[key].sha256, createHash('sha256').update(data).digest('hex'), `${key}: audio does not match its generation record`);
  }
});

test('every generated voice contains non-silent playable PCM speech', async () => {
  const source = JSON.parse(await readFile(new URL('../public/audio/narration-source.json', import.meta.url), 'utf8'));
  for (const key of Object.keys(source)) {
    const data = await readFile(new URL(`../public/audio/${key}.wav`, import.meta.url));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF', key);
    assert.equal(data.toString('ascii', 8, 12), 'WAVE', key);
    let format, pcm;
    for (let offset = 12; offset + 8 <= data.length;) {
      const kind = data.toString('ascii', offset, offset + 4);
      const length = data.readUInt32LE(offset + 4);
      assert.ok(offset + 8 + length <= data.length, `${key}: truncated WAV chunk`);
      const chunk = data.subarray(offset + 8, offset + 8 + length);
      if (kind === 'fmt ') format = chunk;
      if (kind === 'data') pcm = chunk;
      offset += 8 + length + (length % 2);
    }
    assert.ok(format?.length >= 16 && pcm?.length > 44100, `${key}: missing speech audio`);
    assert.equal(format.readUInt16LE(0), 1, `${key}: expected PCM`);
    assert.equal(format.readUInt16LE(2), 1, `${key}: expected mono`);
    assert.equal(format.readUInt32LE(4), 22050, `${key}: expected 22050 Hz`);
    assert.equal(format.readUInt16LE(14), 16, `${key}: expected 16-bit speech`);
    if (['prepare_right', 'prepare_left', 'prepare_center_right', 'prepare_center_left'].includes(key)) {
      const duration = pcm.length / (22050 * 2);
      assert.ok(duration <= 3.8, `${key}: ${duration.toFixed(2)} seconds exceeds the preparation window`);
    }
    let audibleSamples = 0;
    for (let offset = 0; offset + 2 <= pcm.length; offset += 2) {
      if (Math.abs(pcm.readInt16LE(offset)) > 64) audibleSamples++;
    }
    assert.ok(audibleSamples / (pcm.length / 2) > 0.01, `${key}: speech is silent or too quiet`);
  }
});

test('missing MiniMax package never falls back to legacy speech or pretends playback ended', async () => {
  let requested = false;
  const player = createNarrator({ audioFactory: () => { requested = true; return new FakeAudio(''); } });
  assert.equal(await player.play('center'), 'error');
  assert.equal(requested, false);
  assert.match(player.status.message, /MiniMax/);
});
