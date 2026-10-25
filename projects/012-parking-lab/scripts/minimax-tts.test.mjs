import test from 'node:test';
import assert from 'node:assert/strict';
import { MiniMaxTtsError, parsePrivateEnv, miniMaxConfig, publicMiniMaxConfig, audioFileFor, cachedClipMatches,
  manifestMatchesConfig, buildMiniMaxRequest, decodeMiniMaxResponse, synthesizeMiniMax, selectNarrationKeys, sha256, safeMiniMaxError } from './minimax-tts.mjs';
import { parseArguments } from './generate-minimax-narration.mjs';

const fakeKey = 'test-only-never-a-real-credential';
const config = miniMaxConfig({ MINIMAX_API_KEY: fakeKey });
const mp3 = Buffer.alloc(2048, 17);
// MPEG-1 Layer III, 128 kbps, 44.1 kHz header; mock bytes never become app assets.
mp3.set([0xff, 0xfb, 0x90, 0x00], 0);
const payload = () => ({ base_resp: { status_code: 0, status_msg: 'success' }, data: { status: 2, audio: mp3.toString('hex') }, extra_info: { audio_length: 2250, audio_format: 'mp3' } });

test('request uses the documented non-streaming hex API with the existing project voice', () => {
  const body = buildMiniMaxRequest(config, '先看右镜。');
  assert.equal(config.endpoint, 'https://api.minimaxi.com/v1/t2a_v2');
  assert.equal(body.model, 'speech-2.8-hd');
  assert.equal(body.stream, false);
  assert.equal(body.output_format, 'hex');
  assert.deepEqual(body.voice_setting, { voice_id: 'male-qn-qingse', speed: 0.95, vol: 1, pitch: 0 });
  assert.deepEqual(body.audio_setting, { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 });
  assert.equal(JSON.stringify(body).includes(fakeKey), false);
});

test('private env parsing handles BOM, export, quoted values and the legacy endpoint alias without executing text', () => {
  const parsed = parsePrivateEnv(`\uFEFF# private\nexport MINIMAX_API_KEY='${fakeKey}' # local\nMINIMAX_API_BASE=https://api.minimax.cn # old name\nMINIMAX_VOICE_ID="Chinese (Mandarin)_Gentleman"\nUNRELATED_SECRET=do-not-load\nMINIMAX_MODEL=speech-2.8-hd`);
  assert.equal(parsed.MINIMAX_API_KEY, fakeKey);
  assert.equal(parsed.UNRELATED_SECRET, undefined);
  assert.equal(miniMaxConfig(parsed).endpoint, 'https://api.minimax.cn/v1/t2a_v2');
  assert.equal(miniMaxConfig(parsed).voiceId, 'Chinese (Mandarin)_Gentleman');
  assert.equal(parsePrivateEnv('MINIMAX_API_KEY=$(write-something)').MINIMAX_API_KEY, '$(write-something)');
});

test('configuration fails without credentials and rejects credential-bearing or untrusted URLs', () => {
  assert.throws(() => miniMaxConfig({}), error => error.code === 'MISSING_API_KEY');
  for (const value of ['http://api.minimax.cn', 'https://api.minimax.cn.attacker.invalid', 'https://secret@api.minimax.cn', 'https://api.minimax.cn/?token=secret', 'https://api.minimax.cn/other']) {
    assert.throws(() => miniMaxConfig({ MINIMAX_API_KEY: fakeKey, MINIMAX_BASE_URL: value }), error => error.code === 'INVALID_BASE_URL' && !error.message.includes(value));
  }
  assert.equal(miniMaxConfig({ MINIMAX_API_KEY: fakeKey, MINIMAX_BASE_URL: 'https://api.minimax.io/v1' }).endpoint, 'https://api.minimax.io/v1/t2a_v2');
});

test('complete MP3 output is decoded and duration is converted from milliseconds to seconds', () => {
  const result = decodeMiniMaxResponse(payload());
  assert.deepEqual(result.bytes, mp3);
  assert.equal(result.duration, 2.25);
});

test('200 API failures never expose provider error messages or secrets', () => {
  assert.throws(() => decodeMiniMaxResponse({ base_resp: { status_code: 1004, status_msg: `Authorization Bearer ${fakeKey}` }, trace_id: fakeKey }), error => {
    assert.match(safeMiniMaxError(error), /1004/);
    assert.equal(safeMiniMaxError(error).includes(fakeKey), false);
    return error.code === 'API_REJECTED';
  });
});

test('incomplete, malformed, non-MP3 or durationless responses cannot be published as valid audio', () => {
  for (const change of [
    value => { value.data.status = 1; },
    value => { value.data.audio = 'https://example.invalid/audio.mp3'; },
    value => { value.data.audio = 'abc'; },
    value => { value.data.audio = Buffer.alloc(2048).toString('hex'); },
    value => { value.data.audio = mp3.subarray(0, 40).toString('hex'); },
    value => { value.extra_info.audio_format = 'wav'; },
    value => { delete value.extra_info.audio_length; },
    value => { value.extra_info.audio_length = 0; },
  ]) {
    const value = payload(); change(value);
    assert.throws(() => decodeMiniMaxResponse(value), MiniMaxTtsError);
  }
});

test('native fetch uses Bearer authentication only in headers and refuses credential redirects', async () => {
  let calls = 0;
  const result = await synthesizeMiniMax('回正。', config, { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, config.endpoint);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${fakeKey}`);
    assert.equal(options.body.includes(fakeKey), false);
    assert.equal(options.signal instanceof AbortSignal, true);
    return { ok: true, status: 200, json: async () => payload() };
  } });
  assert.equal(calls, 1);
  assert.equal(result.duration, 2.25);
});

test('network, HTTP and unreadable-response errors are sanitized without automatic retries', async () => {
  for (const fetchImpl of [
    async () => { throw new Error(`failed request ${fakeKey}`); },
    async () => ({ ok: false, status: 401, json: async () => ({ secret: fakeKey }) }),
    async () => ({ ok: true, status: 200, json: async () => { throw new Error(fakeKey); } }),
  ]) {
    await assert.rejects(synthesizeMiniMax('看镜。', config, { fetchImpl }), error => !safeMiniMaxError(error).includes(fakeKey));
  }
  assert.equal(safeMiniMaxError(new Error(fakeKey)).includes(fakeKey), false);
});

test('public configuration and filenames cannot contain authentication data', () => {
  const fields = publicMiniMaxConfig(config);
  assert.equal(fields.provider, 'minimax');
  assert.equal(fields.speed, 0.95);
  assert.equal(fields.apiKey, undefined);
  assert.equal(fields.endpoint, undefined);
  assert.match(audioFileFor('center', config, '回正。'), /^audio\/minimax\/center-[a-f0-9]{12}\.mp3$/);
  assert.throws(() => audioFileFor('../secret', config, '回正。'), error => error.code === 'INVALID_CLIP');
});

test('cache requires exact provider, configuration, text, filename, byte size and hash', () => {
  const text = '回正。';
  const manifest = { ...publicMiniMaxConfig(config), clips: { center: { text, file: audioFileFor('center', config, text), bytes: mp3.length, sha256: sha256(mp3) } } };
  assert.equal(cachedClipMatches(manifest, 'center', text, config, mp3), true);
  assert.equal(cachedClipMatches(manifest, 'center', '新的文稿。', config, mp3), false);
  assert.equal(cachedClipMatches(manifest, 'center', text, { ...config, voiceId: 'other-voice' }, mp3), false);
  assert.equal(cachedClipMatches(manifest, 'center', text, { ...config, model: 'speech-2.8-turbo' }, mp3), false);
  assert.equal(cachedClipMatches({ ...manifest, provider: 'huihui' }, 'center', text, config, mp3), false);
  const corrupt = Buffer.from(mp3); corrupt[40] ^= 1;
  assert.equal(cachedClipMatches(manifest, 'center', text, config, corrupt), false);
  assert.equal(cachedClipMatches(manifest, 'center', text, config, undefined), false);
  assert.equal(manifestMatchesConfig(manifest, { ...config, speed: 1 }), false);
});

test('clip selection limits paid requests and treats --key only as a fixed narration identifier', () => {
  const catalog = { intro: { text: '介绍' }, center: { text: '回正' }, brake: { text: '刹车' } };
  assert.deepEqual(selectNarrationKeys(catalog, [], 1), ['intro']);
  assert.deepEqual(selectNarrationKeys(catalog, ['center', 'brake', 'center'], 2), ['center', 'brake']);
  assert.throws(() => selectNarrationKeys(catalog, [fakeKey]), error => error.code === 'UNKNOWN_CLIP' && !error.message.includes(fakeKey));
  assert.throws(() => selectNarrationKeys(catalog, [], 0), error => error.code === 'INVALID_LIMIT');
  assert.deepEqual(parseArguments(['--key', 'center,brake', '--limit', '1']).keys, ['center', 'brake']);
  assert.throws(() => parseArguments(['--api-key', fakeKey]), error => !error.message.includes(fakeKey));
});

test('request interval defaults to 6500 ms and accepts only bounded decimal integers', () => {
  assert.equal(parseArguments([]).intervalMs, 6500);
  for (const value of ['0', '1', '6500', '60000']) {
    assert.equal(parseArguments(['--interval-ms', value]).intervalMs, Number(value));
  }
  for (const value of ['-1', '60001', '1.5', 'NaN', 'Infinity', '1e3', '0x10', ' 10 ', fakeKey]) {
    assert.throws(() => parseArguments(['--interval-ms', value]), error => error.code === 'INVALID_INTERVAL' && !error.message.includes(fakeKey));
  }
  for (const args of [['--interval-ms'], ['--interval-ms', ''], ['--interval-ms', '--force']]) {
    assert.throws(() => parseArguments(args), error => error.code === 'CLI_ARGUMENT');
  }
});
