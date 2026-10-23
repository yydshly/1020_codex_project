import {C,text,rect,line,group,cursor,breath,ease,out,clamp,M,TIMING,clickPulse} from './shared.mjs';

const clickLocal=(id,scene)=>TIMING.events.find(event=>event.id===id).frame-TIMING.scenes[scene-1].start_frame;
const pulse=clickPulse;
const circle=(x,y,r,fill,extra='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;

// Rebuild the real sidebar, tool-card grid and card-bottom links separately.
export function scene02(f){
  const click=clickLocal('click-0',2), selected=f>=click;
  const result=ease((f-click)/M.reveal_frames);
  let b=text('六个 AI 内容工具',72,116,49,C.ink);
  b+=rect(72,164,1136,474,C.white,14,'filter="url(#shadow)"');
  b+=rect(72,164,210,474,C.logoPaper,14);
  // The renderer owns the sole brand handoff at (210,245).
  b+=rect(94,320,166,48,C.green,8)+text('研究总览',112,352,25,C.white);
  b+=text('能力对照',112,410,25)+text('实验记录',112,468,25);
  b+=line(106,510,248,510,C.green,1)+text('研究中',112,555,22,C.ink);
  b+=text('研究总览',310,209,25,C.green);
  b+=line(310,224,1180,224,C.green,1,'opacity=".25"');
  const names=[
    ['Kokoro'],['DigUp'],['Podcastfy'],
    ['Local Deep Research'],['Short Video Factory'],['AI YouTube Shorts','Generator']
  ];
  names.forEach((rows,i)=>{
    const x=310+(i%3)*296, y=244+Math.floor(i/3)*160;
    const reveal=out((f-(i%3)*M.stagger_frames)/M.reveal_frames);
    const active=i===0&&selected;
    const ink=active?C.white:C.ink, fill=active?C.green:C.paper;
    const press=i===0?pulse(f,click):0;
    let card=rect(x,y,278,144,fill,9,`stroke="${C.green}" stroke-opacity="${active?1:.18}" stroke-width="${active?2:1}"`);
    rows.forEach((name,row)=>card+=text(name,x+18,y+38+row*27,22,ink));
    card+=line(x+18,y+91,x+260,y+91,active?C.white:C.green,1,`opacity="${active?.45:.2}"`);
    card+=text('阅读研究',x+18,y+124,21,ink)+text('↗',x+246,y+125,25,ink);
    b+=group(card,`translate(${press*1.5} ${22*(1-reveal)+press*2})`,reveal);
  });
  // This is a source-backed preview, not a model execution result.
  const preview=rect(310,574,870,50,C.green,8)+text('Kokoro',330,608,25,C.white)+
    text('文稿 + 音色 → 语音',522,608,27,C.white);
  b+=group(preview,`translate(0 ${10*(1-result)})`,result);
  const approach=ease((f-M.stagger_frames)/(click-M.stagger_frames));
  b+=cursor(596+(558-596)*approach,390+(359-390)*approach,pulse(f,click));
  return group(b,`translate(0 ${breath(f)})`);
}

// Close crop of the actual wave-amplitude range input and wave plot.
// Pixel amplitude is animation geometry, deliberately not shown as a unit.
export function scene04(f){
  const click=clickLocal('click-2',4);
  const changed=ease((f-click)/M.slow_reveal_frames);
  const amplitude=22+(64-22)*changed, knobX=408+(960-408)*changed, waveY=402;
  let b=text('Kokoro',72,94,25,C.green)+text('声音基础',72,157,52,C.ink);
  // Disclosure is visible from the first frame, independent of reveals.
  b+=rect(862,97,174,48,C.green,8)+text('教学示意',949,129,25,C.white,'text-anchor="middle"');
  b+=rect(72,190,1136,436,C.white,14,'filter="url(#shadow)"');
  b+=text('相对振幅',104,238,27,C.ink);
  b+=line(312,230,1136,230,C.logoPaper,9,'stroke-linecap="round"');
  b+=line(312,230,knobX,230,C.green,9,'stroke-linecap="round"');
  b+=circle(knobX,230,15,C.green,`stroke="${C.white}" stroke-width="4"`);
  if(f>=click&&f<click+M.click_pulse_frames){
    b+=circle(960,230,21+9*(1-pulse(f,click)),'none',`stroke="${C.orange}" stroke-width="2"`);
  }
  b+=rect(104,282,1072,242,C.paper,8);
  [310,356,402,448,494].forEach(y=>b+=line(122,y,1158,y,C.green,1,`opacity="${y===waveY?.36:.1}"`));
  [122,294,466,638,810,982,1158].forEach(x=>b+=line(x,300,x,506,C.green,1,'opacity=".08"'));
  const phase=f/M.breath_period_frames*Math.PI*2;
  const points=[];
  for(let x=122;x<=1158;x+=2){
    const signal=Math.sin((x-122)/1036*Math.PI*12-phase);
    points.push(`${x===122?'M':'L'}${x},${(waveY-amplitude*signal).toFixed(3)}`);
  }
  b+=`<path d="${points.join(' ')}" fill="none" stroke="${C.green}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
  b+=text('理解原理',104,583,25,C.green);
  const approach=ease(f/click);
  b+=cursor(1042+(960-1042)*approach,274+(230-274)*approach,pulse(f,click));
  return group(b,`translate(0 ${breath(f)})`);
}
