import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateSpeechCatalog, loadSpeechCatalog, resolveSpeechClip, warmSpeechClips } from './speech-catalog.js';

const narration = { center: { title: '回正', text: '回正，按 X。' } };
const bytes = Buffer.alloc(1200, 12);
const fixture = () => ({ provider: 'minimax', model: 'speech-2.8-hd', voiceId: 'male-qn-qingse', format: 'mp3',
  clips: { center: { file: 'audio/minimax/center-123abcdef.mp3', text: narration.center.text, duration: 1.2, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } } });

test('only a complete MiniMax package for the current captions resolves to public audio URLs', () => {
  const catalog = validateSpeechCatalog(fixture(), narration);
  assert.deepEqual(resolveSpeechClip(catalog, 'center', '/parking/'), { src: '/parking/audio/minimax/center-123abcdef.mp3', provider: 'minimax', duration: 1.2 });
  assert.equal(resolveSpeechClip(catalog, 'unknown'), null);
  for (const mutate of [
    value => { value.provider = 'Huihui'; },
    value => { value.clips.center.text = '旧口令'; },
    value => { value.clips.center.file = 'https://untrusted.example/speech.mp3'; },
    value => { value.clips.center.file = 'audio/minimax/../secret.mp3'; },
    value => { delete value.clips.center; },
  ]) {
    const invalid = fixture(); mutate(invalid); assert.throws(() => validateSpeechCatalog(invalid, narration));
  }
});

test('an absent manifest or an HTML fallback cannot be presented as a ready voice package', async () => {
  await assert.rejects(loadSpeechCatalog(narration, { fetcher: async () => ({ ok: false }) }));
  await assert.rejects(loadSpeechCatalog(narration, { fetcher: async () => ({ ok: true, json: async () => { throw new SyntaxError('HTML'); } }) }));
  let url, options;
  const loaded = await loadSpeechCatalog(narration, { baseUrl: '/parking/', fetcher: async (request, settings) => { url = request; options = settings; return { ok: true, json: async () => fixture() }; } });
  assert.equal(url, '/parking/audio/minimax/manifest.json');
  assert.equal(options.cache, 'no-store');
  assert.equal(loaded.provider, 'minimax');
});

test('live cue preparation verifies cached audio bytes and rejects truncated or substituted responses', async () => {
  const catalog = validateSpeechCatalog(fixture(), narration);
  let calls = 0;
  await warmSpeechClips(catalog, ['center', 'center'], { fetcher: async () => { calls++; return { ok: true, arrayBuffer: async () => bytes }; } });
  assert.equal(calls, 1);
  await assert.rejects(warmSpeechClips(catalog, ['center'], { fetcher: async () => ({ ok: true, arrayBuffer: async () => Buffer.alloc(2) }) }), /不完整/);
  await assert.rejects(warmSpeechClips(catalog, ['center'], { fetcher: async () => ({ ok: true, arrayBuffer: async () => Buffer.alloc(bytes.length, 3) }) }), /不一致/);
  await assert.rejects(warmSpeechClips(catalog, ['unknown'], { fetcher: async () => { throw new Error('should not fetch'); } }), /尚未准备/);
});
