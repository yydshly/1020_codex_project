import fs from 'node:fs';
export const C={paper:'#f6f5f0',white:'#fffefa',ink:'#263b34',green:'#1e4b40',deep:'#1e4b40',logoPaper:'#eee9dc',orange:'#ac573b'};
export const W=1280,H=720, FPS=60;
export const TIMING=JSON.parse(fs.readFileSync(new URL('../../notes/v3/timing.json',import.meta.url)));
export const M=TIMING.motion;
export const clickPulse=(f,at)=>f>=at&&f-at<M.click_pulse_frames?Math.exp(-(f-at)/M.spring_decay_frames)*Math.cos((f-at)*M.spring_radians_per_frame):0;
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const ease=v=>{v=clamp(v);return v*v*(3-2*v)};
export const out=v=>1-Math.pow(1-clamp(v),3);
export const lerp=(a,b,p)=>a+(b-a)*p;
export const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function text(s,x,y,size=24,color=C.ink,extra=''){return `<text x="${x}" y="${y}" fill="${color}" font-family="Segoe UI, Microsoft YaHei" font-size="${size}" ${extra}>${esc(s)}</text>`}
export function rect(x,y,w,h,fill=C.white,r=0,extra=''){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`}
export const line=(x1,y1,x2,y2,color=C.ink,width=1,extra='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${extra}/>`;
export const group=(body,transform='',opacity=1)=>`<g transform="${transform}" opacity="${opacity}">${body}</g>`;
export function tab(x,y,w=120,h=72,fill=C.green,label='研'){return rect(x,y,w,h,fill,9)+text(label,x+w/2,y+h*.68,h*.5,C.white,'text-anchor="middle"');}
export function cursor(x,y,press=0){return `<g transform="translate(${x} ${y}) scale(${1-.15*press})"><path d="M0 0 0 30 8 23 15 37 22 33 15 20 27 20Z" fill="${C.ink}" stroke="${C.white}" stroke-width="2"/></g>`}
export function heading(title,subtitle=''){return text(title,72,120,49)+ (subtitle?text(subtitle,74,162,21,C.green):'')}
export function page(body,x=278,y=208,w=856,h=416){return `<g filter="url(#shadow)">${rect(x,y,w,h,C.white,14)}</g>`+body}
export function shell(body, f, title='Kokoro'){return page(
 rect(278,208,182,416,C.paper,14)+tab(300,228,38,42)+text('研究总览',300,330,21)+text('能力对照',300,376,21)+text('实验记录',300,422,21)+
 line(480,270,1108,270,C.green,1)+text(title,490,250,24,C.deep)+body)}
export const breath=f=>Math.sin(f/M.breath_period_frames*Math.PI*2)*M.breath_amplitude;
export function frame(body){return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><filter id="shadow" x="-40%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="${C.deep}" flood-opacity=".12"/></filter><clipPath id="safe"><rect x="64" y="48" width="1152" height="624"/></clipPath></defs>${rect(0,0,1280,720,C.paper)}${body}</svg>`}
export function timedScene(index,frame){const timing=JSON.parse(fs.readFileSync(new URL('../../notes/v3/timing.json',import.meta.url)));const s=timing.scenes[index];return {local:frame-s.start_frame,duration:s.end_frame-s.start_frame,p:clamp((frame-s.start_frame)/(s.end_frame-s.start_frame)),timing,s};}
export function reveal(body,f,delay=0){const p=f<delay?0:out((f-delay+1)/M.reveal_frames);return group(body,`translate(0 ${26*(1-p)})`,p)}
export function footer(){return text('GitHub 项目研究集',72,658,18,C.green)}
