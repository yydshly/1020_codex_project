/** Public metadata only. API credentials are used by the offline generator. */
export function validateSpeechCatalog(value, narration) {
  if (!value || value.provider !== 'minimax' || value.format !== 'mp3' || typeof value.model !== 'string' || !value.model.startsWith('speech-') || typeof value.voiceId !== 'string' || !value.voiceId || !value.clips) {
    throw new Error('MiniMax 语音包尚未准备好。');
  }
  const clips = {};
  for (const [key, entry] of Object.entries(narration)) {
    const clip = value.clips[key];
    if (!clip || clip.text !== entry.text || typeof clip.file !== 'string' || !/^audio\/minimax\/[a-z0-9_-]+\.mp3$/.test(clip.file) || !/^[a-f0-9]{64}$/.test(clip.sha256) || !Number.isFinite(clip.bytes) || clip.bytes < 1024 || !Number.isFinite(clip.duration) || clip.duration <= 0) {
      throw new Error(`MiniMax 讲解尚未准备完整：${entry.title}。`);
    }
    clips[key] = { ...clip };
  }
  return { provider: 'minimax', model: value.model, voiceId: value.voiceId, speed: value.speed, format: 'mp3', clips };
}

export async function loadSpeechCatalog(narration, { fetcher = fetch, baseUrl = './' } = {}) {
  const response = await fetcher(`${baseUrl}audio/minimax/manifest.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error('MiniMax 语音包尚未生成或当前不可读取。');
  let manifest;
  try { manifest = await response.json(); }
  catch { throw new Error('MiniMax 语音包尚未生成或当前不可读取。'); }
  return validateSpeechCatalog(manifest, narration);
}

export function resolveSpeechClip(catalog, key, baseUrl = './') {
  const clip = catalog?.clips[key];
  return clip ? { src: `${baseUrl}${clip.file}`, duration: clip.duration, provider: 'minimax' } : null;
}

/** Warm the short, time-sensitive cues before live practice, never while driving. */
export async function warmSpeechClips(catalog, keys, { fetcher = fetch, baseUrl = './' } = {}) {
  const unique = [...new Set(keys)];
  await Promise.all(unique.map(async key => {
    const clip = catalog?.clips[key];
    if (!clip) throw new Error('关键操作语音尚未准备完整。');
    const response = await fetcher(`${baseUrl}${clip.file}`, { cache: 'force-cache' });
    if (!response.ok) throw new Error('关键操作语音未能加载，请重试。');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== clip.bytes) throw new Error('关键操作语音不完整，请重新准备。');
    // Verify actual cached bytes, rather than treating a 200 HTML fallback as audio.
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
      if (hash !== clip.sha256) throw new Error('关键操作语音与生成记录不一致。');
    }
  }));
}

export const LIVE_SPEECH_KEYS = Object.freeze(['prepare_right', 'prepare_left', 'right_turn', 'left_turn', 'prepare_center_right', 'prepare_center_left', 'center', 'brake', 'warning_line', 'recovery_early', 'recovery_clearance', 'recovery_wrong_direction', 'correction_intro', 'correction_left_tight', 'correction_right_tight', 'correction_return', 'correction_good', 'correction_retry']);
