// SPDX-License-Identifier: GPL-3.0-only
// --contracts-only uses a fake key and never requests or writes audio.
// --decode additionally validates every real MP3 with ffprobe and ffmpeg.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {environmentGuides} from '../web/data/environment-guide.mjs';
import {MINIMAX_DEFAULTS,MiniMaxTtsError,audioFileFor,cachedClipMatches,requestFingerprint,containsMp3Frame,sha256,miniMaxConfig,publicMiniMaxConfig} from './minimax-tts.mjs';
import {ENVIRONMENT_AUDIO_DIRECTORY,environmentNarrationCatalog,parseEnvironmentArguments,loadEnvironmentPrivateSettings,generateEnvironmentNarration} from './generate-environment-narration.mjs';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..'),web=resolve(projectRoot,'web');
const fakeKey='ENVIRONMENT_TEST_FAKE_KEY_NO_NETWORK';
const catalog=environmentNarrationCatalog(),chapters=Object.entries(catalog);
assert.equal(chapters.length,['vents','canyon'].reduce((sum,id)=>sum+environmentGuides[id].chapters.length,0));
assert.equal(parseEnvironmentArguments([]).intervalMs,6500);
assert.deepEqual(parseEnvironmentArguments(['--key',`${chapters[0][0]},${chapters[1][0]}`,'--limit','2']).keys,[chapters[0][0],chapters[1][0]]);
for(const argv of [['--api-key',fakeKey],['--force'],['--key',','],['--key','first,'],['--interval-ms','6499'],['--interval-ms','6500.5'],['--interval-ms','60001'],['--env-file']])assert.throws(()=>parseEnvironmentArguments(argv),MiniMaxTtsError);
const invalidGuides=[null,{}, {vents:{chapters:[]},canyon:{chapters:[]}}, {vents:{chapters:[{id:'same',narration:'A'}]},canyon:{chapters:[{id:'same',narration:'B'}]}}, {vents:{chapters:[{id:'../bad',narration:'A'}]},canyon:{chapters:[{id:'other',narration:'B'}]}}, {vents:{chapters:[{id:'blank',narration:' '}]},canyon:{chapters:[{id:'other',narration:'B'}]}}];
for(const invalid of invalidGuides)assert.throws(()=>environmentNarrationCatalog(invalid),MiniMaxTtsError);
await assert.rejects(()=>loadEnvironmentPrivateSettings(fileURLToPath(new URL('../web/data/environment-guide.mjs',import.meta.url)),{}),error=>error.code==='ENV_PATH');
let networkCalls=0;const logs=[];
const plan=await generateEnvironmentNarration({argv:['--dry-run'],environment:{MINIMAX_API_KEY:fakeKey},fetchImpl:async()=>{networkCalls++;throw new Error('No requests are allowed during dry run');},log:value=>logs.push(value)});
assert.equal(networkCalls,0);assert.equal(plan.plan.selected,chapters.length);assert.equal(JSON.stringify({plan,logs}).includes(fakeKey),false);
assert.equal(Object.hasOwn(plan.plan,'endpoint'),false);
const config=miniMaxConfig({MINIMAX_API_KEY:fakeKey}),[fixtureId,fixture]=chapters[0],bytes=Buffer.alloc(2048);bytes.set([0xff,0xfb,0x90,0]);
const file=audioFileFor(fixtureId,config,fixture.text,ENVIRONMENT_AUDIO_DIRECTORY);
assert.ok(file.startsWith(`${ENVIRONMENT_AUDIO_DIRECTORY}/`));assert.ok(!file.startsWith('assets/narration/'));
const cache={...publicMiniMaxConfig(config),clips:{[fixtureId]:{file,text:fixture.text,duration:2,bytes:bytes.length,sha256:sha256(bytes)}}};
assert.equal(cachedClipMatches(cache,fixtureId,fixture.text,config,bytes,ENVIRONMENT_AUDIO_DIRECTORY),true);
assert.equal(cachedClipMatches(cache,fixtureId,fixture.text+'changed',config,bytes,ENVIRONMENT_AUDIO_DIRECTORY),false);
assert.equal(cachedClipMatches(cache,fixtureId,fixture.text,config,bytes),false,'A film clip path cannot satisfy an environment cache');
const contractChecks=['dynamic guide catalog and duplicate/invalid text rejection','external private configuration only','dry-run performs zero requests and redacts key','bounded 6500ms CLI and no forced regeneration','independent environment directory and text/config/byte hash cache'];
if(process.argv.includes('--contracts-only')){
  console.log(JSON.stringify({passed:true,networkCalls,clips:chapters.length,checks:contractChecks},null,2));
}else{
  const jsonPath=resolve(web,ENVIRONMENT_AUDIO_DIRECTORY,'manifest.json'),modulePath=resolve(web,ENVIRONMENT_AUDIO_DIRECTORY,'manifest.mjs');
  const json=JSON.parse(await readFile(jsonPath,'utf8')),{environmentNarrationManifest}=await import(pathToFileURL(modulePath).href);
  assert.deepEqual(environmentNarrationManifest,json,'Static JS and JSON manifests must match');
  const publicKeys=['schema',...Object.keys(MINIMAX_DEFAULTS),'state','clips','generatedAt'];
  assert.ok(Object.keys(json).every(key=>publicKeys.includes(key)),'Public manifest fields are allowlisted');
  for(const [key,value] of Object.entries(MINIMAX_DEFAULTS))assert.equal(json[key],value,`Audio configuration ${key} must match the established voice`);
  assert.equal(json.schema,'abyss-environment-narration/v1');assert.equal(json.state,'ready');assert.equal(Object.keys(json.clips).length,chapters.length);
  const decode=process.argv.includes('--decode'),decodedClips=[],missionDurations={vents:0,canyon:0};let totalBytes=0,totalDuration=0;
  for(const [id,chapter] of chapters){
    const clip=json.clips[id];assert.ok(clip,`Missing environment narration ${id}`);
    assert.ok(Object.keys(clip).every(key=>['file','duration','text','sha256','bytes','mission','requestHash'].includes(key)),'Clip fields are allowlisted');
    assert.equal(clip.text,chapter.text);assert.equal(clip.mission,chapter.mission);assert.equal(clip.requestHash,requestFingerprint(json,chapter.text));
    assert.ok(Number.isFinite(clip.duration)&&clip.duration>0);
    assert.equal(clip.file,audioFileFor(id,json,chapter.text,ENVIRONMENT_AUDIO_DIRECTORY));
    assert.match(clip.file,/^assets\/environment-narration\/[a-z][a-z0-9-]*-[a-f0-9]{12}\.mp3$/);
    const destination=resolve(web,clip.file),within=relative(web,destination);assert.ok(within&&!isAbsolute(within)&&within!=='..'&&!within.startsWith(`..${sep}`));
    const data=await readFile(destination);assert.equal(data.length,clip.bytes);assert.equal(sha256(data),clip.sha256);assert.equal(containsMp3Frame(data),true);
    if(decode){
      const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',destination],{encoding:'utf8',windowsHide:true});
      assert.equal(probe.status,0,`ffprobe must read ${id}`);
      const metadata=JSON.parse(probe.stdout),stream=metadata.streams.find(item=>item.codec_name==='mp3'),decodedDuration=Number(metadata.format.duration);
      assert.ok(stream,`MP3 codec required ${id}`);assert.equal(Number(stream.sample_rate),json.sampleRate);assert.equal(stream.channels,json.channel);
      assert.ok(Number.isFinite(decodedDuration)&&Math.abs(decodedDuration-clip.duration)<=.3,`API/file duration mismatch ${id}`);
      const decoded=spawnSync('ffmpeg',['-hide_banner','-nostats','-xerror','-i',destination,'-af','volumedetect','-f','null','-'],{encoding:'utf8',windowsHide:true});
      assert.equal(decoded.status,0,`Full audio decode must succeed ${id}`);
      const meanDb=Number(decoded.stderr.match(/mean_volume:\s*(-?[\d.]+|-inf)\s*dB/)?.[1]),maxDb=Number(decoded.stderr.match(/max_volume:\s*(-?[\d.]+|-inf)\s*dB/)?.[1]);
      assert.ok(Number.isFinite(meanDb)&&meanDb>-55&&Number.isFinite(maxDb)&&maxDb>-35,`Narration must be audible ${id}`);
      decodedClips.push({id,apiDuration:clip.duration,decodedDuration,meanDb,maxDb});
    }
    totalBytes+=data.length;totalDuration+=clip.duration;missionDurations[chapter.mission]+=clip.duration;
  }
  const metadata=JSON.stringify(json);assert.ok(!/"(?:apiKey|endpoint|Authorization|trace_id|base_resp)"/.test(metadata),'No credential or private provider-response fields');
  console.log(JSON.stringify({passed:true,networkCalls,provider:json.provider,model:json.model,voiceId:json.voiceId,speed:json.speed,clips:chapters.length,bytes:totalBytes,durationSeconds:Number(totalDuration.toFixed(3)),missionDurationSeconds:Object.fromEntries(Object.entries(missionDurations).map(([id,value])=>[id,Number(value.toFixed(3))])),...(decode?{decodedClips}:{}),checks:[...contractChecks,'guide text matches','paired manifest equality','public field allowlist','request/config/text fingerprints','API duration metadata','MP3 frames, bytes and SHA-256',...(decode?['full ffmpeg decode','ffprobe/API duration tolerance .3s','non-silent signal']:[])]},null,2));
}
