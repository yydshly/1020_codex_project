import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Resvg} from '@resvg/resvg-js';
import {createCanvas,ImageData} from '@napi-rs/canvas';
import {frame,rect,C,clamp,ease,tab,group,TIMING,M} from './shared.mjs';
import {scene01,scene03,scene05} from './scenes-a.mjs';
import {contentBridge,bridgeBodyTransform} from './transitions.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));process.chdir(root);
let other={};try{other=await import('./scenes-b.mjs')}catch{}
let last={};try{last=await import('./scenes-c.mjs')}catch{}
const scenes=[scene01,other.scene02,scene03,other.scene04,scene05,last.scene06,last.scene07,last.scene08];
const timing=JSON.parse(fs.readFileSync('notes/v3/timing.json'));
const fonts=['msyh.ttc.subset.ttf','segoeui.ttf.subset.ttf'].map(f=>path.resolve('.cache/v3-source/fonts/'+f));
const sourceLogo=fs.readFileSync('.cache/v3-source/product/source-favicon.svg','utf8').replace("<svg ","<svg x='-40' y='-40' width='80' height='80' ");
const blurCanvas=createCanvas(1280,720),blurCtx=blurCanvas.getContext('2d');
const sampleCanvas=createCanvas(1280,720),sampleCtx=sampleCanvas.getContext('2d');
export function svgAt(f){
 const si=Math.min(7,TIMING.scenes.findIndex(s=>f>=s.start_frame&&f<s.end_frame)),s=TIMING.scenes[si],l=f-s.start_frame;
 let body=(scenes[si]||scene01)(l),bodyTransform='',bridge='';
 const anchors=TIMING.handoff.anchors;
 let a=anchors[si],x=a[0],y=a[1],angle=a[2],scale=1;
 const span=M.exit_frames, duration=s.end_frame-s.start_frame;
 if(l>duration-span&&si<7){
   const q=ease((l-(duration-span))/(span-1)),p=q/2,b=anchors[si+1];
   x=a[0]+(b[0]-a[0])*p;y=a[1]+(b[1]-a[1])*p-(TIMING.handoff.arc_heights?.[si]??TIMING.handoff.arc_height)*Math.sin(p*Math.PI);
   angle=a[2]+(b[2]-a[2])*p;scale=1+.3*Math.sin(p*Math.PI);
   bodyTransform=`translate(${x} ${y}) rotate(${angle*q}) scale(${1-.96*q}) translate(${-a[0]} ${-a[1]})`;
   if([2,3,4,5,7].includes(si+1)){bodyTransform=bridgeBodyTransform(si+1,q,false);bridge=contentBridge(si+1,p);}
   if(si+1===5&&TIMING.handoff.record_curve){
    const u=1-p,points=TIMING.handoff.record_curve;
    x=u*u*u*points[0][0]+3*u*u*p*points[1][0]+3*u*p*p*points[2][0]+p*p*p*points[3][0];
    y=u*u*u*points[0][1]+3*u*u*p*points[1][1]+3*u*p*p*points[2][1]+p*p*p*points[3][1];
   }
 }
 if(l<span&&si>0){
   const q=ease(l/(span-1)),p=.5+q/2,b=anchors[si-1];
   x=b[0]+(a[0]-b[0])*p;y=b[1]+(a[1]-b[1])*p-(TIMING.handoff.arc_heights?.[si-1]??TIMING.handoff.arc_height)*Math.sin(p*Math.PI);
   angle=b[2]+(a[2]-b[2])*p;scale=1+.3*Math.sin(p*Math.PI);
   bodyTransform=`translate(${x} ${y}) rotate(${angle*(1-q)}) scale(${.04+.96*q}) translate(${-a[0]} ${-a[1]})`;
   if([2,3,4,5,7].includes(si)){bodyTransform=bridgeBodyTransform(si,q,true);bridge=contentBridge(si,p);}
   if(si===5&&TIMING.handoff.record_curve){
    const u=1-p,points=TIMING.handoff.record_curve;
    x=u*u*u*points[0][0]+3*u*u*p*points[1][0]+3*u*p*p*points[2][0]+p*p*p*points[3][0];
    y=u*u*u*points[0][1]+3*u*u*p*points[1][1]+3*u*p*p*points[2][1]+p*p*p*points[3][1];
   }
 }
 // Continuous source-brand paper marker: never full-screen and never disappears.
 body=group(body,bodyTransform)+bridge+group(sourceLogo,`translate(${x} ${y}) rotate(${angle}) scale(${scale})`);
 return frame(body);
}
function raster(f){return new Resvg(svgAt(Math.max(0,Math.min(TIMING.duration_frames-1,f))),{font:{fontFiles:fonts,loadSystemFonts:false,defaultFontFamily:'Microsoft YaHei'}}).render();}
function render(f,filename){
 const s=TIMING.scenes.find(s=>f>=s.start_frame&&f<s.end_frame),l=f-s.start_frame;
 const atExactHandoff=l===0||l===s.end_frame-s.start_frame-1;
 const fast=!atExactHandoff&&((l<M.exit_frames&&s.id>1)||(l>s.end_frame-s.start_frame-M.exit_frames&&s.id<8));
 if(!fast){fs.writeFileSync(filename,raster(f).asPng());return;}
 blurCtx.clearRect(0,0,1280,720);
 for(const [i,dt] of (TIMING.motion.shutter_samples??[-.35,0,.35]).entries()){const r=raster(f+dt);sampleCtx.putImageData(new ImageData(new Uint8ClampedArray(r.pixels),1280,720),0,0);blurCtx.globalAlpha=1/(i+1);blurCtx.drawImage(sampleCanvas,0,0);}
 fs.writeFileSync(filename,blurCanvas.toBuffer('image/png'));
}
const mode=process.argv[2]||'styles';
fs.mkdirSync('.cache/v3-source/frames',{recursive:true});
if(mode==='styles'){[0,365,685].forEach((f,i)=>{render(f,`web/media/v3/style-${i+1}.png`)});render(0,'web/media/v3/poster.png');}
else{
 const start=Number(process.argv[3]||0),end=Number(process.argv[4]||(mode==='proof'?240:1200));
 const globalFrames=mode==='full'||mode==='frames';
 const dir=globalFrames?'.cache/v3-source/frames':`.cache/v3-source/${mode}-frames`;fs.mkdirSync(dir,{recursive:true});
 for(let f=start;f<end;f++){
  const filename=`${dir}/${String(globalFrames?f:f-start).padStart(5,'0')}.png`,s=TIMING.scenes.find(s=>f>=s.start_frame&&f<s.end_frame),l=f-s.start_frame;
  const unchanged=(l>=M.exit_frames&&l<=s.end_frame-s.start_frame-M.exit_frames)||f===0;
  if(!(process.argv[6]==='resume-stable'&&unchanged&&fs.existsSync(filename)))render(f,filename);
  if(f%25===0)global.gc?.();
  if(f%150===0)console.log(`rendered ${f}`);
 }
 if(mode==='frames'){console.log(`frame shard ${start}..${end-1} done`);}
 else{
 const output=mode==='full'?`web/media/v3/${process.argv[5]||'round-01'}.mp4`:`web/media/v3/${mode}.mp4`;
 const args=['-y','-v','error','-framerate','60','-i',`${dir}/%05d.png`,'-ss',String(start/60),'-i','web/media/v3/mix.wav','-t',String((end-start)/60),'-c:v','libx264rgb','-crf','0','-preset','fast','-pix_fmt','rgb24','-color_primaries','bt709','-color_trc','iec61966-2-1','-colorspace','rgb','-color_range','pc','-c:a','aac','-b:a','320k','-ar','48000','-movflags','+faststart+write_colr',output];
 const r=spawnSync('ffmpeg',args,{stdio:'inherit'});if(r.status!==0)throw Error('encode failed');console.log(output);
 }
}
