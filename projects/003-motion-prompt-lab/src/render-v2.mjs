import {Resvg} from '@resvg/resvg-js';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile,mkdir,rename,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {svgFrame,geometry} from './film-v2.mjs';
const root=new URL('../',import.meta.url),T=JSON.parse(await readFile(new URL('./timing-v2.json',import.meta.url)));
const font=fileURLToPath(new URL('.cache/NotoSansCJKsc-v2-subset.otf',root));
const opts={font:{fontFiles:[font],loadSystemFonts:false,defaultFontFamily:'Noto Sans CJK SC'}};
const media=new URL('web/media/v2/',root);
await mkdir(media,{recursive:true});
await mkdir(new URL('.cache/v2/',root),{recursive:true});
const mode=process.argv[2]||'full';
const encode=mode!=='stills';
const start=mode==='bridge'?510:0,frames=mode==='proof'?240:mode==='bridge'?270:1200;
const canvas=createCanvas(1280,720),ctx=canvas.getContext('2d');
const render=f=>new Resvg(svgFrame(f,T),opts).render().asPng();
if(mode==='stills'){
  const sample=[0,54,72,84,96,108,162,210,270,324,378,432,486,540,594,648,702,756,810,864,918,936,972,1026,1080,1140];
  const sheet=createCanvas(1280,Math.ceil(sample.length/4)*180),s=sheet.getContext('2d');
  for(let i=0;i<sample.length;i++){
    const png=render(sample[i]);
    await writeFile(new URL(`.cache/v2/frame-${sample[i]}.png`,root),png);
    if([108,486,810].includes(sample[i]))await writeFile(new URL(`style-${sample[i]}.png`,media),png);
    s.drawImage(await loadImage(png),i%4*320,Math.floor(i/4)*180,320,180);
  }
  await writeFile(new URL('.cache/v2/storyboard.png',root),sheet.toBuffer('image/png'));
  for(const f of [108,486,810])await writeFile(new URL(`style-${f}.svg`,media),svgFrame(f,T));
  console.log('Rendered storyboard and three style frames.');
}else{
  await access(new URL('soundtrack.m4a',media));
  const name=mode==='full'?'research-film-v2.mp4':mode==='proof'?'proof-4s.mp4':'bridge-proof.mp4';
  const temp=new URL(`.cache/v2/${name}`,root);
  const ff=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-framerate','60','-vcodec','png','-i','pipe:0','-ss',String(start/60),'-i',fileURLToPath(new URL('soundtrack.m4a',media)),'-t',String(frames/60),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',fileURLToPath(temp)],{stdio:['pipe','ignore','pipe']});
  let errors='';ff.stderr.on('data',d=>errors+=d);let exitError;
  ff.stdin.on('error',e=>{exitError=e;});
  const done=new Promise((res,rej)=>{ff.on('error',rej);ff.on('close',c=>c===0?res():rej(new Error(errors)));});
  const started=Date.now();
  for(let i=0;i<frames;i++){
    if(exitError)throw exitError;
    const f=start+i;
    // Three actual temporal samples: box shutter over half a frame. Identical in all output versions.
    const samples=T.motion.fastRanges?.some(([a,b])=>f>=a&&f<=b)?T.motion.fastSamples:T.motion.samples;
    for(let j=0;j<samples;j++){
      const sf=f+(j/(samples-1)-.5)*T.motion.shutterFrames;
      const png=render(sf);
      ctx.globalAlpha=1/(j+1);
      ctx.drawImage(await loadImage(png),0,0);
    }
    ctx.globalAlpha=1;
    if(!ff.stdin.write(canvas.toBuffer('image/png')))await once(ff.stdin,'drain');
    if(i%120===0)console.log(`${mode}: ${i}/${frames}, ${(Date.now()-started)/1000}s`);
  }
  ff.stdin.end();await done;
  await rename(temp,new URL(name,media));
  const png=render(0);await writeFile(new URL('poster.png',media),png);
  if(mode==='full'){
    const buf=await readFile(new URL(name,media));
    await writeFile(new URL('notes/v2-render.json',root),JSON.stringify({seconds:(Date.now()-started)/1000,frames,width:1280,height:720,fps:60,renderer:'SVG / resvg-js 2.6.2',motionBlur:T.motion,sha256:createHash('sha256').update(buf).digest('hex'),fontSHA256:createHash('sha256').update(await readFile(font)).digest('hex')},null,2));
    await writeFile(new URL('notes/v2-geometry.json',root),JSON.stringify({boundaries:T.sceneFrames.slice(1,-1).map(f=>({frame:f,before:geometry(f-0.001,T),after:geometry(f+0.001,T)})),note:'Shared frame functions; coordinate continuity does not prove perceptual object identity.'},null,2));
  }
  console.log(`Done ${name}: ${(Date.now()-started)/1000}s`);
}
