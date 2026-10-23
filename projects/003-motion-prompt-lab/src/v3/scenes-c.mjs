import {C,text,rect,line,group,heading,page,cursor,breath,ease,out,reveal,footer,M,TIMING,clickPulse} from './shared.mjs';
export function scene06(f){
 const click=TIMING.key_actions.find(e=>e.id==='source-evidence').frame-TIMING.scenes[5].start_frame;
 const p=out((f-click-1)/M.reveal_frames);
 let b=heading('官方来源');
 b+=group(rect(300,206,774,398,C.deep,12)+text('固定版本',342,271,25,C.white)+line(342,304,1032,304,C.white,1),
 `rotate(${-2+2*p} 687 405)`);
 b+=reveal(text('hexgrad/kokoro',342,387,54,C.white)+text('dfb907a02bba',344,451,32,C.logoPaper),f,click+1);
 b+=line(342,508,1032,508,C.white,1);
 b+=text('研究与实测分开记录',340,646,23,C.green);return group(b,`translate(0 ${breath(f)})`);
}
export function scene07(f){
 const click=TIMING.key_actions.find(e=>e.id==='recap').frame-TIMING.scenes[6].start_frame;
 let b='';
 const labels=['理解原理','运行验证','改造实践'],xs=[100,470,840];
 labels.forEach((s,i)=>{
 const p=out((f-click-i*M.node_stagger_frames+1)/M.slow_reveal_frames);
 const y=295+i*90;
 b+=group(text(s,xs[i],y,i===0?54:42,C.ink)+line(xs[i],y+30,xs[i]+280,y+30,C.green,3,i?'stroke-dasharray="6 8"':''),`translate(0 ${40*(1-p)})`,p);
 if(i<2){const grow=ease((f-click-i*M.slow_reveal_frames)/M.camera_frames);b+=line(xs[i]+285,y+33,xs[i]+285+65*grow,y+33+58*grow,C.green,3);}
 if(i===1)b+=reveal(text('待实测',xs[i],y+76,24,C.orange),f,click+M.node_stagger_frames);
 });
 const journey=ease(f/(TIMING.scenes[6].end_frame-TIMING.scenes[6].start_frame+M.slow_reveal_frames));
 return heading('研究中')+group(b,`translate(640 360) scale(${1+.05*journey}) translate(-640 ${-360-36*journey})`);
}
export function scene08(f){
 const progress=ease(f/(TIMING.scenes[7].end_frame-TIMING.scenes[7].start_frame+M.slow_reveal_frames));
 return group(text('GitHub 项目研究集',640,345,64,C.deep,'text-anchor="middle"')+
 line(264,395,264+752*progress,395,C.green,3)+
 `<circle cx="${264+752*progress}" cy="395" r="5" fill="${C.green}"/>`+
 text('github.com/yydshly/1020_codex_project',640,458,31,C.green,'text-anchor="middle"')+
 text('研究中',640,560,23,C.orange,'text-anchor="middle"'),`translate(640 395) scale(${1+.13*(1-progress)}) translate(-640 -395)`);
}
