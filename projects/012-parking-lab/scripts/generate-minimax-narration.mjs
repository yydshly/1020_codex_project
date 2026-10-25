import { readFile, writeFile, mkdir, realpath, rename } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { NARRATION } from '../src/narration.js';
import { MiniMaxTtsError, parsePrivateEnv, miniMaxConfig, publicMiniMaxConfig, audioFileFor, cachedClipMatches,
  manifestMatchesConfig, selectNarrationKeys, sha256, synthesizeMiniMax, safeMiniMaxError } from './minimax-tts.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(projectRoot, 'public');
const outputRoot = resolve(publicRoot, 'audio/minimax');
const manifestPath = resolve(outputRoot, 'manifest.json');
const HELP = `Generate real MiniMax narration with native server-side fetch.

  node scripts/generate-minimax-narration.mjs --env-file ABSOLUTE_EXTERNAL_ENV --key center --limit 1
  node scripts/generate-minimax-narration.mjs --env-file ABSOLUTE_EXTERNAL_ENV

--key NAME     Select a NARRATION clip key, NOT an API credential. Repeat or use commas.
--limit N      Process at most N selected clips (cache hits count toward this limit).
--interval-ms N Minimum time between actual request starts, integer 0–60000 ms.
                Default: 6500 ms. Cache hits do not wait. No automatic retries.
--env-file P   Read a private .env file outside this project; process environment wins.
--force        Regenerate selected clips even when cached.
--help         Show this help. No key is accepted on the command line.

Environment: MINIMAX_API_KEY, MINIMAX_BASE_URL (legacy MINIMAX_API_BASE),
MINIMAX_MODEL, MINIMAX_VOICE_ID. Default: speech-2.8-hd / male-qn-qingse / speed 0.95.
Writes public/audio/minimax/manifest.json and versioned MP3 files. Keeps Huihui WAVs.
`;

export function parseArguments(argv) {
  const options = { keys: [], limit: Infinity, intervalMs: 6500, force: false, envFile: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--force') options.force = true;
    else if (['--key', '--limit', '--env-file', '--interval-ms'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new MiniMaxTtsError('CLI_ARGUMENT', 'An option is missing its value. Use --help.');
      if (arg === '--key') options.keys.push(...value.split(',').map(key => key.trim()).filter(Boolean));
      if (arg === '--limit') options.limit = Number(value);
      if (arg === '--env-file') options.envFile = value;
      if (arg === '--interval-ms') {
        if (!/^\d+$/.test(value) || !Number.isInteger(Number(value)) || Number(value) > 60000) {
          throw new MiniMaxTtsError('INVALID_INTERVAL', '--interval-ms must be an integer from 0 through 60000.');
        }
        options.intervalMs = Number(value);
      }
    } else throw new MiniMaxTtsError('CLI_ARGUMENT', 'Unrecognized command-line option. Use --help; API credentials belong in private environment settings.');
  }
  return options;
}

async function loadEnvironment(file, environment) {
  let privateValues = {};
  if (file) {
    if (!isAbsolute(file)) throw new MiniMaxTtsError('ENV_PATH', '--env-file requires an absolute path outside this project.');
    let resolved;
    try { resolved = await realpath(file); } catch { throw new MiniMaxTtsError('ENV_READ', 'Could not read the explicitly supplied private environment file.'); }
    const withinProject = relative(await realpath(projectRoot), resolved);
    if (!withinProject || !isAbsolute(withinProject) && withinProject !== '..' && !withinProject.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
      throw new MiniMaxTtsError('ENV_PATH', 'Keep API credentials outside this project and supply that absolute --env-file path.');
    }
    try { privateValues = parsePrivateEnv(await readFile(resolved, 'utf8')); }
    catch (error) { if (error instanceof MiniMaxTtsError) throw error; throw new MiniMaxTtsError('ENV_READ', 'Could not read the explicitly supplied private environment file.'); }
  }
  return { ...privateValues, ...Object.fromEntries(Object.entries(environment).filter(([, value]) => value !== undefined && value !== '')) };
}

async function loadManifest() {
  try { return JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new MiniMaxTtsError('MANIFEST_READ', 'The existing MiniMax manifest is unreadable; it has been left intact.');
  }
}
async function writeManifest(manifest) {
  const temporary = `${manifestPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rename(temporary, manifestPath);
}

export async function generateMiniMaxNarration({ argv = process.argv.slice(2), environment = process.env, fetchImpl = globalThis.fetch, log = console.log } = {}) {
  const options = parseArguments(argv);
  if (options.help) { log(HELP); return { generated: 0, cached: 0 }; }
  const keys = selectNarrationKeys(NARRATION, options.keys, options.limit);
  const config = miniMaxConfig(await loadEnvironment(options.envFile, environment));
  const oldManifest = await loadManifest();
  const manifest = { ...publicMiniMaxConfig(config), clips: manifestMatchesConfig(oldManifest, config) ? { ...oldManifest.clips } : {} };
  let generated = 0, cached = 0;
  let previousRequestStartedAt = null;
  // Do not publish an empty manifest or relabel an old provider after failure.
  for (const key of keys) {
    const text = NARRATION[key].text;
    const file = audioFileFor(key, config, text);
    const destination = resolve(outputRoot, basename(file));
    let existing;
    try { existing = await readFile(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!options.force && cachedClipMatches(manifest, key, text, config, existing)) {
      cached++; log(`${key}: cached (${existing.length} bytes)`); continue;
    }
    if (previousRequestStartedAt !== null) {
      const waitMs = Math.max(0, options.intervalMs - (performance.now() - previousRequestStartedAt));
      if (waitMs > 0) await delay(waitMs);
    }
    previousRequestStartedAt = performance.now();
    const audio = await synthesizeMiniMax(text, config, { fetchImpl });
    await mkdir(outputRoot, { recursive: true });
    // Only authentic successful API output is written under the MiniMax provider.
    const temporaryAudio = `${destination}.${process.pid}.tmp`;
    await writeFile(temporaryAudio, audio.bytes);
    await rename(temporaryAudio, destination);
    manifest.clips[key] = { file, text, sha256: sha256(audio.bytes), bytes: audio.bytes.length,
      ...(audio.duration !== undefined ? { duration: audio.duration } : {}) };
    await writeManifest(manifest);
    generated++;
    log(`${key}: generated (${audio.bytes.length} bytes${audio.duration !== undefined ? `, ${audio.duration.toFixed(2)} seconds` : ''})`);
  }
  log(`MiniMax narration: ${generated} generated, ${cached} cached.`);
  return { generated, cached, manifest };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  generateMiniMaxNarration().catch(error => { console.error(safeMiniMaxError(error)); process.exitCode = 1; });
}
