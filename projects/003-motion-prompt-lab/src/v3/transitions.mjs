import {C,text,rect,line,group,ease,lerp,TIMING,M} from './shared.mjs';

// Each bridge carries the foreground material that matters in its two scenes.
// Values at p=.5 are identical on both sides of the encoded scene boundary.
export function contentBridge(id,p){
 const swell=Math.sin(Math.PI*p), opacity=Math.min(1,swell*5);
 let b='';
 if(id===2){
   // The selected Kokoro research card becomes the principle view.
   const x=lerp(310,275,p),y=lerp(244,184,p),w=lerp(278,897,p),h=144+140*swell;
   b=rect(x,y,w,h,C.deep,12)+text('Kokoro',x+24,y+54,32+28*swell,C.white);
   b+=line(x+24,y+76,x+w-24,y+76,C.white,1);
   if(swell>.35)b+=text('文稿 + 音色 → 语音',x+24,y+132,25+8*swell,C.white);
 }else if(id===3){
   // The output signal itself grows into the next scene's amplitude plot.
   const x=lerp(873,104,p),y=lerp(300,282,p),w=lerp(246,1072,p),h=lerp(206,242,p);
   b=rect(x,y,w,h,C.green,12);
   let d='';for(let xx=18;xx<w-18;xx+=3)d+=`${xx===18?'M':'L'}${x+xx},${y+h*.58+(18+20*p)*Math.sin(xx/35-p*Math.PI*4)}`;
   b+=text('语音',x+24,y+50,32,C.white)+`<path d="${d}" stroke="${C.white}" stroke-width="4" fill="none"/>`;
 }else if(id===4){
   // A teaching plot closes like a page; the orange unmeasured record faces us.
   // No cursor or click suggests that the illustrative signal was measured.
   const x=lerp(104,112,p),y=lerp(282,214,p),w=lerp(1072,1056,p),h=lerp(242,392,p);
   const fold=Math.abs(Math.cos(p*Math.PI)),width=w*(.012+.988*fold);
   b=rect(640-width/2,y,width,h,p<.5?C.green:C.white,10);
   b+=group(text(p<.5?'教学示意':'待实测',640,y+h*.57,42,p<.5?C.white:C.orange,'text-anchor="middle"'),`translate(640 0) scale(${fold} 1) translate(-640 0)`,ease(fold*2));
   // A visible page edge is continuous at the handoff, not a hidden full-screen wipe.
   b+=line(640-width/2,y,640-width/2,y+h,C.orange,4);
 }else if(id===5){
   // Kokoro's pending research record is pulled forward to expose source evidence.
   const x=lerp(112,300,p),y=lerp(214,206,p),w=lerp(500,774,p),h=lerp(392,398,p);
   b=group(rect(x,y,w,h,C.deep,12)+text('Kokoro',x+40,y+80,54,C.white)+
      line(x+40,y+108,x+w-40,y+108,C.white,1)+text('待实测',x+40,y+175,32,C.logoPaper),
      `rotate(${-5*Math.sin(p*Math.PI)} ${x+w/2} ${y+h/2})`);
 }else if(id===7){
   // The path's rule becomes the final repository underline, carrying the name.
   const y=lerp(325,395,p),left=lerp(100,264,p),right=lerp(1120,1016,p);
   b=line(left,y,right,y,C.green,4);
 }
 return group(b,'',opacity);
}
export function bridgeBodyTransform(id,q,incoming){
 const distance=incoming?1-q:q,sign=incoming?1:-1;
 if(id===3)return `translate(0 ${sign*720*distance})`;
 if(id===4)return `translate(${sign*1280*distance} 0) rotate(${sign*8*distance} 640 360)`;
 if(id===7)return incoming?`translate(${1280*distance} 0)`:`translate(0 ${720*distance})`;
 return `translate(${sign*1280*distance} 0)`;
}
