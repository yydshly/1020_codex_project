// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {getDirectorShots} from '../web/data/director-shots.mjs';
import {narrationManifest} from '../web/assets/narration/manifest.mjs';
import {containsMp3Frame,sha256} from './minimax-tts.mjs';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..'),web=resolve(projectRoot,'web');
const json=JSON.parse(await readFile(resolve(web,'assets/narration/manifest.json'),'utf8'));
assert.deepEqual(narrationManifest,json,'Static JS and JSON metadata must match');
assert.equal(json.provider,'minimax');assert.equal(json.state,'ready');assert.equal(json.schema,'abyss-director-narration/v1');assert.equal(json.format,'mp3');
const shots=['vents','canyon'].flatMap(id=>getDirectorShots(id));
assert.equal(Object.keys(json.clips).length,shots.length);
const decode=process.argv.includes('--decode'),decodedClips=[];
let bytes=0,duration=0;
for(const shot of shots){
  const clip=json.clips[shot.id];assert.ok(clip,`Missing narration ${shot.id}`);assert.equal(clip.text,shot.narration);
  assert.ok(Number.isFinite(clip.duration)&&clip.duration>0);assert.match(clip.file,/^assets\/narration\/[a-z][a-z0-9-]*-[a-f0-9]{12}\.mp3$/);
  const destination=resolve(web,clip.file),within=relative(web,destination);assert.ok(within&&!isAbsolute(within)&&within!=='..'&&!within.startsWith(`..${sep}`));
  const data=await readFile(destination);assert.equal(data.length,clip.bytes);assert.equal(sha256(data),clip.sha256);assert.equal(containsMp3Frame(data),true);
  if(decode){
    const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',destination],{encoding:'utf8',windowsHide:true});
    assert.equal(probe.status,0,`ffprobe must read ${shot.id}`);
    const metadata=JSON.parse(probe.stdout),stream=metadata.streams.find(item=>item.codec_name==='mp3'),decodedDuration=Number(metadata.format.duration);
    assert.ok(stream,`MP3 codec required ${shot.id}`);assert.equal(Number(stream.sample_rate),json.sampleRate);assert.equal(stream.channels,json.channel);
    assert.ok(Number.isFinite(decodedDuration)&&Math.abs(decodedDuration-clip.duration)<=.3,`API/file duration mismatch ${shot.id}`);
    const decoded=spawnSync('ffmpeg',['-hide_banner','-nostats','-xerror','-i',destination,'-af','volumedetect','-f','null','-'],{encoding:'utf8',windowsHide:true});
    assert.equal(decoded.status,0,`Full audio decode must succeed ${shot.id}`);
    const meanDb=Number(decoded.stderr.match(/mean_volume:\s*(-?[\d.]+|-inf)\s*dB/)?.[1]),maxDb=Number(decoded.stderr.match(/max_volume:\s*(-?[\d.]+|-inf)\s*dB/)?.[1]);
    assert.ok(Number.isFinite(meanDb)&&meanDb>-55&&Number.isFinite(maxDb)&&maxDb>-35,`Narration must contain audible signal ${shot.id}`);
    decodedClips.push({id:shot.id,apiDuration:clip.duration,decodedDuration,meanDb,maxDb});
  }
  bytes+=data.length;duration+=clip.duration;
}
const metadata=JSON.stringify(json);assert.ok(!/"(?:apiKey|endpoint|Authorization|trace_id|base_resp)"/.test(metadata),'No private provider response or credential fields in public metadata');
console.log(JSON.stringify({passed:true,provider:json.provider,model:json.model,voiceId:json.voiceId,clips:shots.length,bytes,durationSeconds:Number(duration.toFixed(3)),...(decode?{decodedClips}:{}),checks:['story text matches','paired manifest equality','API duration metadata','MP3 frame present','byte counts and SHA-256','no private fields',...(decode?['full ffmpeg decode','ffprobe/API duration tolerance .3s','non-silent signal']:[])]},null,2));
