// Isolate native renderer lifetime per scene; native allocation failures cannot
// contaminate later shards. Every worker still computes exact global frame IDs.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
const script=fileURLToPath(new URL('./render.mjs',import.meta.url));
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=process.argv[2]||'round-02';
const timing=JSON.parse(fs.readFileSync(new URL('../../notes/v3/timing.json',import.meta.url)));
for(const scene of timing.scenes){
 const r=spawnSync(process.execPath,['--expose-gc',script,'frames',String(scene.start_frame),String(scene.end_frame)],{cwd:root,stdio:'inherit'});
 if(r.status!==0)throw Error(`frame shard ${scene.id} failed: ${r.status}`);
}
const r=spawnSync('ffmpeg',['-y','-v','error','-framerate','60','-i','.cache/v3-source/frames/%05d.png','-i','web/media/v3/mix.wav','-t','20','-c:v','libx264rgb','-crf','0','-preset','fast','-pix_fmt','rgb24','-color_primaries','bt709','-color_trc','iec61966-2-1','-colorspace','rgb','-color_range','pc','-c:a','aac','-b:a','320k','-ar','48000','-movflags','+faststart+write_colr',`web/media/v3/${output}.mp4`],{cwd:root,stdio:'inherit'});
if(r.status!==0)throw Error('full encode failed');
console.log(`web/media/v3/${output}.mp4`);
