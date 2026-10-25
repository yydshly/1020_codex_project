// SPDX-License-Identifier: GPL-3.0-only
// Reused from this workspace's 012 project; no dependency on that checkout.
import { createHash } from 'node:crypto';

// Official API: https://platform.minimax.io/docs/api-reference/speech-t2a-http
// Official voices: https://platform.minimax.io/docs/faq/system-voice-id
export const MINIMAX_DEFAULTS = Object.freeze({
  provider: 'minimax', model: 'speech-2.8-hd', voiceId: 'male-qn-qingse',
  format: 'mp3', sampleRate: 32000, bitrate: 128000, channel: 1,
  speed: 0.95, volume: 1, pitch: 0, languageBoost: 'Chinese',
});
const ENV_NAMES = new Set(['MINIMAX_API_KEY', 'MINIMAX_BASE_URL', 'MINIMAX_API_BASE', 'MINIMAX_MODEL', 'MINIMAX_VOICE_ID']);
const OFFICIAL_HOSTS = new Set(['api.minimaxi.com', 'api.minimax.cn', 'api.minimax.io', 'api.minimax.chat', 'api-bj.minimaxi.com', 'api-bj.minimax.cn', 'api-uw.minimax.io']);
const PUBLIC_FIELDS = Object.keys(MINIMAX_DEFAULTS);

export class MiniMaxTtsError extends Error {
  constructor(code, message) { super(message); this.name = 'MiniMaxTtsError'; this.code = code; }
}
const fail = (code, message) => { throw new MiniMaxTtsError(code, message); };

/** Read only the explicitly supported settings. Never evaluates shell syntax. */
export function parsePrivateEnv(text) {
  const values = {};
  for (const line of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || !ENV_NAMES.has(match[1])) continue;
    let value = match[2];
    if (value.startsWith('"')) {
      const quoted = value.match(/^("(?:\\.|[^"\\])*")\s*(?:#.*)?$/);
      if (!quoted) fail('ENV_FORMAT', 'MiniMax configuration contains an invalid quoted value.');
      try { value = JSON.parse(quoted[1]); } catch { fail('ENV_FORMAT', 'MiniMax configuration contains an invalid quoted value.'); }
    } else if (value.startsWith("'")) {
      const quoted = value.match(/^'([^']*)'\s*(?:#.*)?$/);
      if (!quoted) fail('ENV_FORMAT', 'MiniMax configuration contains an invalid quoted value.');
      value = quoted[1];
    } else value = value.replace(/\s+#.*$/, '').trim();
    values[match[1]] = value;
  }
  return values;
}

export function miniMaxConfig(environment = {}) {
  const apiKey = String(environment.MINIMAX_API_KEY ?? '').trim();
  if (!apiKey) fail('MISSING_API_KEY', 'MINIMAX_API_KEY is not configured. Supply server environment or an external --env-file.');
  if (/[\r\n]/.test(apiKey)) fail('INVALID_API_KEY', 'MINIMAX_API_KEY contains an invalid line break.');
  let url;
  try { url = new URL(environment.MINIMAX_BASE_URL || environment.MINIMAX_API_BASE || 'https://api.minimaxi.com'); }
  catch { fail('INVALID_BASE_URL', 'MINIMAX_BASE_URL must be an official MiniMax HTTPS endpoint.'); }
  if (url.protocol !== 'https:' || !OFFICIAL_HOSTS.has(url.hostname) || url.username || url.password || url.search || url.hash || url.port && url.port !== '443' || !['/', '/v1', '/v1/', '/v1/t2a_v2'].includes(url.pathname)) {
    fail('INVALID_BASE_URL', 'MINIMAX_BASE_URL must be an official MiniMax HTTPS endpoint without credentials or query parameters.');
  }
  const config = { ...MINIMAX_DEFAULTS, apiKey, endpoint: `${url.origin}/v1/t2a_v2` };
  for (const [envName, field] of [['MINIMAX_MODEL', 'model'], ['MINIMAX_VOICE_ID', 'voiceId']]) {
    if (environment[envName]) config[field] = String(environment[envName]).trim();
    if (!config[field] || config[field].length > 180 || /[\r\n\u0000]/.test(config[field]) || config[field] === apiKey) fail('INVALID_CONFIG', 'MiniMax model or voice identifier is invalid.');
  }
  return config;
}

/** No endpoint, key, headers, raw error response or trace ID enters public files. */
export function publicMiniMaxConfig(config) {
  return Object.fromEntries(PUBLIC_FIELDS.map(field => [field, config[field]]));
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function requestFingerprint(config, text) {
  return sha256(JSON.stringify({ ...publicMiniMaxConfig(config), text }));
}
export function audioFileFor(key, config, text, directory = 'assets/narration') {
  if (!/^[a-z][a-z0-9_-]*$/.test(key)) fail('INVALID_CLIP', 'Narration clip key is invalid.');
  if (typeof directory !== 'string' || !/^[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*$/.test(directory)) fail('INVALID_DIRECTORY', 'Narration directory must be a safe public relative path.');
  return `${directory}/${key}-${requestFingerprint(config, text).slice(0, 12)}.mp3`;
}
export function manifestMatchesConfig(manifest, config) {
  return Boolean(manifest && PUBLIC_FIELDS.every(field => manifest[field] === config[field]));
}
export function cachedClipMatches(manifest, key, text, config, bytes, directory = 'assets/narration') {
  const clip = manifest?.clips?.[key];
  return manifestMatchesConfig(manifest, config) && clip?.text === text && clip.file === audioFileFor(key, config, text, directory) &&
    Number.isFinite(clip.duration) && clip.duration > 0 && Buffer.isBuffer(bytes) && bytes.length === clip.bytes && clip.sha256 === sha256(bytes) && containsMp3Frame(bytes);
}

export function buildMiniMaxRequest(config, text) {
  if (typeof text !== 'string' || !text.trim() || text.length >= 10000) fail('INVALID_TEXT', 'Narration text must contain between 1 and 9999 characters.');
  return { model: config.model, text, stream: false, output_format: 'hex', language_boost: config.languageBoost,
    voice_setting: { voice_id: config.voiceId, speed: config.speed, vol: config.volume, pitch: config.pitch },
    audio_setting: { sample_rate: config.sampleRate, bitrate: config.bitrate, format: config.format, channel: config.channel },
    subtitle_enable: false };
}

export function containsMp3Frame(bytes) {
  if (!Buffer.isBuffer(bytes)) return false;
  let offset = 0;
  if (bytes.toString('ascii', 0, 3) === 'ID3') {
    if (bytes.length < 10 || [6, 7, 8, 9].some(i => bytes[i] >= 128)) return false;
    offset = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
  }
  // Some encoders add a small pad after metadata. Require an actual MPEG audio
  // header, not merely an ID3 tag or a response claiming to be MP3.
  for (let i = offset; i + 4 < Math.min(bytes.length, offset + 4096); i++) {
    if (bytes[i] === 255 && (bytes[i + 1] & 224) === 224 && ((bytes[i + 1] >> 3) & 3) !== 1 &&
      ((bytes[i + 1] >> 1) & 3) === 1 && ((bytes[i + 2] >> 4) & 15) > 0 && ((bytes[i + 2] >> 4) & 15) < 15 &&
      ((bytes[i + 2] >> 2) & 3) !== 3) return true;
  }
  return false;
}

export function decodeMiniMaxResponse(payload) {
  const code = payload?.base_resp?.status_code;
  if (code !== 0) {
    const safeCode = Number.isInteger(code) && code >= 0 && code < 1e9 ? String(code) : 'unknown';
    fail('API_REJECTED', `MiniMax rejected synthesis (status ${safeCode}); check account, model and voice settings.`);
  }
  const hex = payload?.data?.audio;
  if (payload?.data?.status !== 2 || typeof hex !== 'string' || !hex.length || hex.length % 2 || !/^[a-f0-9]+$/i.test(hex)) fail('INVALID_AUDIO_RESPONSE', 'MiniMax did not return complete hexadecimal audio.');
  if (payload.extra_info?.audio_format && payload.extra_info.audio_format !== 'mp3') fail('INVALID_AUDIO_FORMAT', 'MiniMax returned a format other than the requested MP3.');
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length < 1024 || !containsMp3Frame(bytes)) fail('INVALID_MP3', 'MiniMax returned empty or unrecognized MP3 data.');
  const milliseconds = payload.extra_info?.audio_length;
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) fail('INVALID_DURATION', 'MiniMax did not report a valid audio duration.');
  return { bytes, duration: milliseconds / 1000 };
}

/** Native server-side fetch. No implicit retries and no alternate provider. */
export async function synthesizeMiniMax(text, config, { fetchImpl = globalThis.fetch, timeoutMs = 60000 } = {}) {
  const body = buildMiniMaxRequest(config, text);
  let response;
  try {
    response = await fetchImpl(config.endpoint, { method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch { fail('REQUEST_FAILED', 'MiniMax request failed or timed out. Check connectivity and endpoint; no alternate voice was generated.'); }
  if (!response.ok) {
    const status = Number.isInteger(response.status) ? response.status : 'unknown';
    fail('HTTP_ERROR', `MiniMax returned HTTP ${status}; no audio was generated.`);
  }
  let payload;
  try { payload = await response.json(); } catch { fail('INVALID_RESPONSE', 'MiniMax returned an unreadable response.'); }
  return decodeMiniMaxResponse(payload);
}

export function selectNarrationKeys(catalog, keys = [], limit = Infinity) {
  const selected = keys.length ? [...new Set(keys)] : Object.keys(catalog);
  if (selected.some(key => !Object.hasOwn(catalog, key) || !/^[a-z][a-z0-9_-]*$/.test(key))) fail('UNKNOWN_CLIP', 'A requested clip key does not exist in the storyboard. --key selects a narration clip, not an API key.');
  if (limit !== Infinity && (!Number.isInteger(limit) || limit < 1)) fail('INVALID_LIMIT', '--limit must be a positive integer.');
  return selected.slice(0, limit);
}

/** Safe by construction: unknown exceptions never expose raw messages or causes. */
export function safeMiniMaxError(error) {
  return error instanceof MiniMaxTtsError ? `${error.code}: ${error.message}` : 'GENERATION_FAILED: MiniMax generation could not finish. Check the private configuration and writable output directory.';
}
