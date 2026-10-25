import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NARRATION } from '../src/narration.js';
import { validateSpeechCatalog } from '../src/speech-catalog.js';

try {
  const root = new URL('../public/', import.meta.url);
  const catalog = validateSpeechCatalog(JSON.parse(await readFile(new URL('audio/minimax/manifest.json', root), 'utf8')), NARRATION);
  let totalBytes = 0, totalSeconds = 0;
  for (const [key, clip] of Object.entries(catalog.clips)) {
    const data = await readFile(new URL(clip.file, root));
    if (data.length !== clip.bytes || createHash('sha256').update(data).digest('hex') !== clip.sha256) throw new Error(`${key}: generated audio does not match its provenance.`);
    totalBytes += data.length; totalSeconds += clip.duration;
  }
  console.log(`Verified MiniMax package: ${Object.keys(catalog.clips).length} clips, ${totalBytes} bytes, ${totalSeconds.toFixed(2)} seconds; ${catalog.model} / ${catalog.voiceId}.`);
} catch (error) {
  console.error(error.code === 'ENOENT' ? 'MiniMax package is not generated yet. Supply the private environment file to the generation script first.' : 'MiniMax package verification failed; check the generated files and caption manifest.');
  process.exitCode = 1;
}
