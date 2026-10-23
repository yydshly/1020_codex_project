import {C,text,rect,line,group,tab,heading,page,shell,cursor,breath,ease,out,reveal,footer,clamp,M,TIMING,clickPulse} from './shared.mjs';
export function scene01(f){
 const p=ease(f/M.camera_frames), y=breath(f);
 let b=text('GitHub 项目研究集',74,100,27,C.green)+text('文稿',68+24*p,280-20*p,132)+text('语音',80-10*p,515+8*p,132);
 b+=line(216,308,216,378,C.green,4)+`<path d="M196 358 L216 378 L236 358" stroke="${C.green}" stroke-width="4" fill="none"/>`;
 const word=ease((f-M.stagger_frames)/M.reveal_frames);
 b+=`<clipPath id="voice-word">${rect(320,316,250*word,80,C.white)}</clipPath><g clip-path="url(#voice-word)">${text('+ 音色',320,373,44,C.green)}</g>`;
 b+=line(74,567,540,567,C.green,2)+text('研究中',74,615,26,C.orange);
 const card=rect(0,0,500,440,C.deep,16)+text('六个 AI 内容工具',35,70,31,C.white)+line(35,104,465,104,C.white,1)+
 ['Kokoro','DigUp','Podcastfy','Local Deep Research','Short Video Factory','AI YouTube Shorts Generator'].map((s,i)=>text(s,35+(i===0?18*p:0),155+i*49,i<3?32:24,C.white)+line(35,170+i*49,465,170+i*49,C.white,1,`opacity=".3"`)).join('');
 b+=group(card,`translate(${660-p*12} ${147+y}) rotate(${-3+p*2} 250 220)`);
 return b;
}
export function scene03(f){
 let b=heading('Kokoro');
 b+=rect(300,242,180,42,C.green,8)+text('教学示意',390,271,24,C.white,'text-anchor="middle"');
 b+=text('理解原理',300,223,28,C.deep);
 const labels=['文稿','音色','语音'];
 labels.forEach((s,i)=>{const delay=M.node_reveal_delay+i*M.node_stagger_frames;const p=f<delay?0:out((f-delay+1)/M.slow_reveal_frames); const x=275+i*299;
 b+=group(rect(x,300,246,206,i===2?C.green:C.white,12)+text(s,x+123,374,42,i===2?C.white:C.deep,'text-anchor="middle"'),`translate(0 ${(1-p)*32})`,p);
 if(i<2)b+=reveal(text(i===0?'+':'→',x+258,411,35,C.green),f,M.node_reveal_delay+i*M.node_stagger_frames);
 if(i===0)b+=reveal([0,1,2].map(j=>line(x+36,418+j*20,x+198-j*22,418+j*20,C.green,3)).join(''),f,delay);
 if(i===1)b+=reveal([0,1,2,3,4].map(j=>rect(x+48+j*29,432-12*Math.sin(f/M.camera_frames*6+j),12,22+24*Math.sin(f/M.camera_frames*6+j)**2,C.green,3)).join(''),f,delay);
 if(i===2){let d='';for(let xx=0;xx<=176;xx+=3)d+=`${xx?'L':'M'}${x+35+xx},${436+18*Math.sin(xx/14-f/M.camera_frames*8)}`;b+=reveal(`<path d="${d}" stroke="${C.white}" stroke-width="3" fill="none"/>`,f,delay);}
 });
 return group(b,`translate(0 ${breath(f)})`);
}
export function scene05(f){
 let b=heading('实验记录','研究与实测分开记录');
 b+=page('',112,214,1056,392);
 b+=rect(112,214,1056,63,C.deep,10);
 b+=text('Kokoro',150,257,32,C.white);
 b+=reveal(text('待实测',150,410,64,C.orange)+line(150,444,510,444,C.orange,3),f,M.node_reveal_delay);
 b+=reveal(text('样本',620,325,24,C.green)+text('中英文短文各一份',620,371,32)+text('专有名词和数字',620,413,27,C.green),f,M.node_reveal_delay);
 b+=reveal(text('记录指标',620,482,24,C.green),f,M.node_reveal_delay+M.stagger_frames);
 ['错读','生成秒数','音频秒数','设备'].forEach((label,i)=>{
  b+=reveal(text(label,620+(i%2)*250,529+Math.floor(i/2)*43,27,C.ink),f,M.node_reveal_delay+M.stagger_frames+i*M.node_stagger_frames);
 });
 return group(b,`translate(0 ${breath(f)})`);
}
