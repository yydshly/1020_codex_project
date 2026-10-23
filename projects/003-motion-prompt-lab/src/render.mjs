import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {drawFilm} from './film.mjs';
const timing=JSON.parse(await readFile(new URL('./timing.json',import.meta.url)));
const root=new URL('../',import.meta.url);
const font=new URL('../.cache/NotoSansCJKsc-Regular.otf',import.meta.url);
if(!GlobalFonts.registerFromPath(decodeURIComponent(font.pathname).replace(/^\/([A-Z]:)/,'$1'),'Lab Sans'))throw new Error('Font registration failed');
const fontData=await readFile(font);
await writeFile(new URL('../notes/font-provenance.json',import.meta.url),JSON.stringify({source:'https://github.com/notofonts/noto-cjk/tree/main/Sans/OTF/SimplifiedChinese',filename:'NotoSansCJKsc-Regular.otf',sha256:createHash('sha256').update(fontData).digest('hex'),license:'SIL Open Font License 1.1',note:'Exact downloaded font cached locally. Video embeds rasterized glyphs only; no system font used in offline rendering.'},null,2));
await mkdir(new URL('web/media/',root),{recursive:true});
const test=process.argv.includes('--test');
const frames=test?240:timing.fps*timing.duration;
const canvas=createCanvas(timing.width,timing.height);
const ctx=canvas.getContext('2d');
const output=new URL(test?'web/media/proof-4s.mp4':'web/media/research-film.mp4',root);
const path=u=>decodeURIComponent(u.pathname).replace(/^\/([A-Z]:)/,'$1');
await access(new URL('web/media/soundtrack.m4a',root));
const ff=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-framerate',String(timing.fps),'-vcodec','png','-i','pipe:0','-i',path(new URL('web/media/soundtrack.m4a',root)),'-t',String(frames/timing.fps),'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',path(output)],{stdio:['pipe','ignore','pipe']});
let err='';ff.stderr.on('data',d=>err+=d);
const done=new Promise((resolve,reject)=>{ff.once('error',reject);ff.once('close',code=>code===0?resolve():reject(new Error(err)));});
const started=Date.now();
for(let f=0;f<frames;f++){
  drawFilm(ctx,f,timing);
  const png=canvas.toBuffer('image/png');
  if(!ff.stdin.write(png))await once(ff.stdin,'drain');
  if(f%240===0)console.log(`Rendered ${f}/${frames}`);
}
ff.stdin.end();await done;
console.log(`Encoded ${frames} frames in ${((Date.now()-started)/1000).toFixed(1)} seconds.`);
if(!test){
  drawFilm(ctx,0,timing);await writeFile(new URL('web/media/poster.png',root),canvas.toBuffer('image/png'));
  await copyFile(new URL('web/media/poster.png',root),new URL('assets/cover.png',root));
  const sheet=createCanvas(1280,900),sc=sheet.getContext('2d');
  sc.fillStyle='#102c25';sc.fillRect(0,0,1280,900);
  for(let i=0;i<20;i++){
    drawFilm(ctx,i*60+30,timing);
    sc.drawImage(canvas,(i%4)*320,Math.floor(i/4)*180,320,180);
  }
  await writeFile(new URL('web/media/contact-sheet.jpg',root),sheet.toBuffer('image/jpeg',90));
  await writeFile(new URL('notes/render.json',root),JSON.stringify({frames,seconds:(Date.now()-started)/1000,renderer:'@napi-rs/canvas 0.1.80',fontSHA256:createHash('sha256').update(fontData).digest('hex'),output:'web/media/research-film.mp4'},null,2));
}
