// Native SVG geometry. One object changes topology; selected UI geometry becomes the next scene.
export const P={paper:'#F3F2E9',ink:'#19362F',muted:'#52635C',gold:'#E79B40',mint:'#C0D6BA',dark:'#102C25'};
const clamp=x=>Math.max(0,Math.min(1,x)), mix=(a,b,p)=>a+(b-a)*p;
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const out=x=>1-Math.pow(1-clamp(x),3);
const E=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const n=x=>Number(x.toFixed(3));
function progress(f,a,b){return clamp((f-a)/(b-a));}
function track(f,keys){
  if(f<=keys[0][0])return keys[0].slice(1);
  let k=keys.findIndex((x,i)=>i&&f<=x[0]);
  if(k<0)return keys.at(-1).slice(1);
  const a=keys[k-1],b=keys[k],p=smooth(progress(f,a[0],b[0]));
  return a.slice(1).map((v,i)=>mix(v,b[i+1],p));
}
function pathPoints(points,close=false){return points.map((p,i)=>`${i?'L':'M'}${n(p[0])} ${n(p[1])}`).join(' ')+(close?' Z':'');}
function starPoints(count=96){
  const vertices=Array.from({length:10},(_,i)=>{let a=-Math.PI/2+i*Math.PI/5,r=i%2?.45:1;return [Math.cos(a)*r,Math.sin(a)*r];});
  // Stable perimeter correspondence, same count for every frame.
  return Array.from({length:count},(_,i)=>{let v=i/count*10,k=Math.floor(v),p=v-k;return [mix(vertices[k][0],vertices[(k+1)%10][0],p),mix(vertices[k][1],vertices[(k+1)%10][1],p)];});
}
function roundPoints(w,h,r=24,count=96){
  const corners=[[w/2-r,-h/2+r,-Math.PI/2],[w/2-r,h/2-r,0],[-w/2+r,h/2-r,Math.PI/2],[-w/2+r,-h/2+r,Math.PI]];
  // Ray-to-rounded-rectangle sampling keeps point ordering stable around the outline.
  return Array.from({length:count},(_,i)=>{
    const a=-Math.PI/2+i/count*Math.PI*2,dx=Math.cos(a),dy=Math.sin(a);
    let lo=0,hi=Math.hypot(w,h);
    for(let j=0;j<12;j++){
      const d=(lo+hi)/2,x=Math.abs(dx*d),y=Math.abs(dy*d);
      const qx=x-(w/2-r),qy=y-(h/2-r);
      const sdf=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r;
      if(sdf>0)hi=d;else lo=d;
    }
    return [dx*(lo+hi)/2,dy*(lo+hi)/2];
  });
}
const star=starPoints();
function morphOutline(w,h,p){
  const rr=roundPoints(w,h,Math.min(22,w*.1,h*.1));
  return pathPoints(rr.map((q,i)=>[mix(star[i][0]*w/2,q[0],p),mix(star[i][1]*h/2,q[1],p)]),true);
}
const text=(s,x,y,size=24,color=P.ink,extra='')=>`<text x="${n(x)}" y="${n(y)}" font-size="${size}" fill="${color}" ${extra}>${E(s)}</text>`;
const rect=(x,y,w,h,c=P.paper,r=18,stroke='none',sw=1.5)=>`<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(.01,w))}" height="${n(Math.max(.01,h))}" rx="${r}" fill="${c}" stroke="${stroke}" stroke-width="${sw}"/>`;
const line=(x,y,x2,y2,c=P.ink,sw=2,extra='')=>`<path d="M${n(x)} ${n(y)} L${n(x2)} ${n(y2)}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" ${extra}/>`;
const group=(body,alpha=1,transform='')=>`<g opacity="${n(clamp(alpha))}" transform="${transform}">${body}</g>`;
function windowAlpha(f,a,b,c,d){return out(progress(f,a,b))*(1-smooth(progress(f,c,d)));}
function revealText(s,x,y,size,color,p,id){
  return `<clipPath id="${id}"><rect x="${n(x-5)}" y="${n(y-size*1.2)}" width="1200" height="${n(size*1.5*clamp(p))}"/></clipPath><g clip-path="url(#${id})">${text(s,x,y+size*(1-out(p)),size,color)}</g>`;
}
export function geometry(frame,T){
  const f=Math.max(0,Math.min(frame,T.fps*T.duration-1));
  return {frame:f,folio:track(f,T.folio),selected:track(f,T.selected),waveMorph:smooth(progress(f,...T.waveMorph))};
}
export function svgFrame(frame,T){
  const f=Math.max(0,Math.min(frame,T.fps*T.duration-1));
  const S=T.sceneFrames, g=geometry(f,T), [fx,fy,fw,fh,morph,fr]=g.folio;
  const [cx,cy,cw,ch,cr]=g.selected;
  const sec=f/T.fps;
  let b='';
  // First frame already carries the hook and complete composition.
  b+=rect(0,0,1280,720,P.paper,0);
  b+=text('FIELDNOTES',62,54,17,P.ink,'letter-spacing="3"');
  b+=text('GitHub 项目研究集',1218,54,17,P.muted,'text-anchor="end"');
  // No running timer or moving footer to mask a static main composition.
  b+=line(62,76,1218,76,P.mint,1);
  const hookAlpha=1-smooth(progress(f,S[1]-T.motion.lag*2,S[1]+T.motion.settle*2));
  const hookX=64-90*smooth(progress(f,S[1]-24,S[1]+48));
  b+=group(text('收藏之后，',hookX,268,78)+text('理解开始。',hookX,366,78)+text('让每一个收藏，都有下一步。',hookX+4,438,24,P.muted)+rect(hookX+4,485,258,43,P.ink,22)+text('来源 · 原理 · 验证',hookX+133,514,18,P.paper,'text-anchor="middle"'),hookAlpha);
  // Folio contour: star → identity tile → product card → browser boundary.
  if(f<S[2]+60){
    const a=1-smooth(progress(f,S[2]+12,S[2]+60));
    let content='';
    const cardP=out(progress(f,T.folio[2][0],T.folio[3][0]));
    const winP=smooth(progress(f,S[1],T.folio[5][0]));
    const outline=morphOutline(fw,fh,morph);
    content+=`<path d="${outline}" transform="translate(7 12)" fill="${P.ink}" opacity=".09"/>`;
    content+=`<path id="folio-contour" d="${outline}" fill="${P.paper}" stroke="${P.ink}" stroke-width="2"/><path d="${outline}" fill="${P.gold}" opacity="${n(1-cardP)}"/><clipPath id="folioClip"><path d="${outline}"/></clipPath><g clip-path="url(#folioClip)">`;
    // Identity is a continuous position function, never disappears behind a wipe.
    const badgeX=mix(0,-fw/2+69,cardP),badgeY=mix(14,-fh/2+51,cardP);
    content+=group(rect(badgeX-41,badgeY-32,82,47,P.gold,13)+text('002',badgeX,badgeY+1,27,P.ink,'text-anchor="middle"'),out(progress(f,42,72)));
    content+=group(group(text('研究档案',-fw/2+34,-fh/2+137,36),out(progress(f,80,98)))+group(text('六个 AI 内容工具',-fw/2+34,-fh/2+184,24,P.muted),out(progress(f,94,112)))+group(line(-fw/2+34,fh/2-75,fw/2-34,fh/2-75,P.mint)+text('从原理理解，到实践验证。',-fw/2+34,fh/2-35,19,P.muted),out(progress(f,104,120))),cardP*(1-winP));
    if(winP>0){
      const localW=fw;
      content+=group(text('项目研究集 / 研究目录',-fw/2+130,-fh/2+53,23)+line(-fw/2,-fh/2+81,fw/2,-fh/2+81,P.mint),winP);
      const rowIn=out(progress(f,S[1]+36,S[1]+72));
      content+=group(text('001',-localW/2+45,-25,24,P.muted)+text('cyber-xiaowan',-localW/2+140,-25,29)+text('图片陪伴与桌宠的过渡阶段参考',-localW/2+140,11,19,P.muted)+text('研究中',localW/2-40,-5,17,P.muted,'text-anchor="end"'),rowIn,`translate(0 ${n(20*(1-rowIn))})`);
      const q=out(progress(f,S[1]+63,S[1]+99));
      content+=group(rect(-fw/2+30,50,fw-60,139,P.mint,12)+group(text('002',-fw/2+50,84,24)+text('六个 AI 内容工具的原理与实践',-fw/2+144,84,29),1-smooth(progress(f,S[2]-18,S[2])))+text('Kokoro',-fw/2+144,139,24)+text('DigUp   /  Podcastfy   /   …',-fw/2+280,139,19,P.muted),q);
      // Selection is physically the same rectangle that expands into the next board.
      if(f>=S[1]+90){const p=out(progress(f,S[1]+90,S[2]));content+=group(line(-fw/2+143,152,-fw/2+143+103*p,152,P.ink,3),p);}
    }
    content+='</g>';
    b+=group(content,a,`translate(${n(fx)} ${n(fy)}) rotate(${n(fr)})`);
  }
  // Click is an actual visual event with a result: selected row unfolds.
  if(f>=S[1]+90&&f<S[2]+30){
    const p=smooth(progress(f,S[1]+90,S[2]-6));
    const x=mix(1130,355,p),y=mix(560,479,p)-100*Math.sin(Math.PI*p),hit=Math.sin(Math.PI*progress(f,S[2]-12,S[2]+6));
    b+=`<g transform="translate(${n(x)} ${n(y)}) scale(${n(1-.12*hit)})"><path d="M0 0L4 31L13 23L23 35L30 31L21 19L33 17Z" fill="${P.ink}" stroke="${P.paper}" stroke-width="2"/></g>`;
    if(f>S[2]-6)b+=`<circle cx="355" cy="479" r="${n(5+22*progress(f,S[2]-6,S[2]+24))}" fill="none" stroke="${P.gold}" stroke-width="3" opacity="${n(1-progress(f,S[2]-6,S[2]+24))}"/>`;
  }
  // A shared selected row grows to a panel, then narrows into the processing module,
  // later becoming the source document and finally the archived folio.
  if(f>=S[2]-30){
    const a=out(progress(f,S[2]-30,S[2]));
    const modelP=smooth(progress(f,S[2]+90,S[3]-12));
    const docP=smooth(progress(f,S[4]-30,S[4]+60));
    const tailP=smooth(progress(f,S[6],S[7]-30));
    const darken=modelP*(1-docP);
    let body='';
    const fanOpen=smooth(progress(f,T.documentFan[0],T.documentFan[1]))*(1-smooth(progress(f,T.documentFan[2],T.documentFan[3])));
    // Background pages grow from the exact same document origin and keep corner correspondence.
    for(let i=2;i>=1;i--){
      const spread=i*fanOpen,dx=-200*spread,dy=10*spread;
      const rotation=cr-6*spread;
      const focus=windowAlpha(f,...T.documentFocus[i===2?'experiment':'source']);
      const page=rect(-cw/2,-ch/2,cw,ch,P.paper,16,P.ink,2)+group(group(rect(-cw/2+14,-ch/2+16,165,48,P.gold,8),focus)+text(i===2?'实验计划':'来源记录',-cw/2+25,-ch/2+51,26)+text(i===2?'07-experiments.md':'sources.json',-cw/2+25,-ch/2+91,18,P.muted)+line(-cw/2+25,-ch/2+120,cw/2-25,-ch/2+120,P.mint,2),1-smooth(progress(f,S[6],S[6]+30)));
      b+=group(page,a*fanOpen,`translate(${n(cx+dx)} ${n(cy+dy)}) rotate(${n(rotation)})`);
    }
    body+=rect(-cw/2+8,-ch/2+12,cw,ch,P.ink,18);
    // Previous shadow uses only a translucent layer.
    body=group(body,.08);
    body+=rect(-cw/2,-ch/2,cw,ch,P.paper,18,P.ink,2);
    body+=group(rect(-cw/2,-ch/2,cw,ch,P.ink,18),darken);
    body+=`<clipPath id="selectedClip">${rect(-cw/2+2,-ch/2+2,cw-4,ch-4,P.paper,16)}</clipPath><g clip-path="url(#selectedClip)">`;
    const panelA=(1-smooth(progress(f,S[2]+90,S[2]+114)))*(1-docP);
    const expand=out(progress(f,S[2],S[2]+54));
    body+=group(text('Kokoro',mix(-cw/2+62,-cw/2+35,expand),mix(12,-ch/2+61,expand),mix(24,34,expand))+group(text('从研究目录，进入一个原理。',-cw/2+35,-ch/2+103,22,P.muted)+line(-cw/2+35,-ch/2+129,cw/2-35,-ch/2+129,P.mint)+text('文稿',-cw/2+90,ch/2-104,33)+text('语音模型',-65,ch/2-104,33)+text('语音',cw/2-165,ch/2-104,33)+line(-cw/2+175,ch/2-118,-104,ch/2-118,P.gold,3)+line(103,ch/2-118,cw/2-195,ch/2-118,P.gold,3),out(progress(f,S[2]+36,S[2]+66))),panelA);
    body+=group(text('Kokoro',0,-10,31,P.paper,'text-anchor="middle"')+text('语音模型',0,32,22,P.mint,'text-anchor="middle"'),windowAlpha(f,S[2]+120,S[3]-12,S[4]-18,S[4]+6));
    const docA=out(progress(f,S[4]+24,S[4]+60))*(1-smooth(progress(f,S[6],S[6]+30)));
    body+=group(text('README.md',-cw/2+28,-ch/2+51,27)+text('研究说明 / 原理图',-cw/2+28,-ch/2+88,21,P.muted)+line(-cw/2+28,-ch/2+108,cw/2-28,-ch/2+108,P.mint),docA);
    // Real claims, never invent a passed experiment.
    body+=group(rect(-cw/2+26,ch/2-78,cw-52,45,P.gold,12)+text('实验待验证',0,ch/2-47,21,P.ink,'text-anchor="middle"'),docA*out(progress(f,S[5],S[5]+36)));
    body+=group(rect(-cw/2+24,-ch/2+24,80,43,P.gold,12)+text('002',-cw/2+64,-ch/2+54,25,P.ink,'text-anchor="middle"')+text('研究档案',-cw/2+24,-ch/2+116,33)+text('来源 · 原理 · 实验',-cw/2+24,-ch/2+158,20,P.muted)+line(-cw/2+24,ch/2-56,cw/2-24,ch/2-56,P.mint,2),smooth(progress(f,S[6]+42,S[7]-42)));
    body+='</g>';
    b+=group(body,a,`translate(${n(cx)} ${n(cy)}) rotate(${n(cr)})`);
  }
  // Panel surrounding type follows the physical transformation; no independent slide cut.
  const diagramAlpha=windowAlpha(f,S[2]+120,S[3]+12,S[4]-18,S[4]+18);
  const subtitleAlpha=windowAlpha(f,S[2]+108,S[3]+6,S[4]+6,S[4]+30);
  b+=group(text('把原理，看成一个过程。',64,151,43)+text('Kokoro / 原理示意，非本机模型实测',66,196,20,P.muted),subtitleAlpha);
  if(diagramAlpha>0){
    const spread=out(progress(f,S[2]+108,S[3]+18));
    const left=mix(500,220,spread),right=mix(780,1055,spread);
    b+=group(rect(left-116,255,232,208,P.mint,16)+text('文稿',left,300,27,P.ink,'text-anchor="middle"'),diagramAlpha);
    b+=group(text('语音',right,284,27,P.ink,'text-anchor="middle"'),diagramAlpha);
    // Staggered manuscript lines translate into the module; the output curve grows in response.
    const waveCycle=(f-S[3])/T.beatFrames;
    for(let i=0;i<4;i++){
      const travel=progress(f,S[3]+i*12,S[3]+78+i*12);
      const move=out(travel),x=mix(left-84,610,move);
      const y=mix(337+i*25,355,move);
      const visibility=(1-smooth(progress(travel,.82,1)));
      b+=group(line(x,y,x+mix(155-i*16,22,move),y,P.ink,7),diagramAlpha*visibility);
    }
    const intake=out(progress(f,S[3],S[3]+90));
    b+=group(line(left+116,355,531,355,P.ink,3)+line(749,355,right+120,355,P.mint,2),diagramAlpha);
    const pulse=1+.06*Math.sin(Math.PI*progress(f,S[3]+18,S[3]+66));
    b+=group(`<circle cx="${n(mix(left+116,531,intake))}" cy="355" r="7" fill="${P.gold}"/>`,diagramAlpha*(1-intake));
  }
  // The output diagram folds back into its containing research page; it is NOT a source being generated.
  const waveA=windowAlpha(f,S[3]+27,S[3]+72,S[6]-12,S[6]+30);
  if(waveA>0){
    const p=g.waveMorph;
    const crad=cr*Math.PI/180;
    for(let j=0;j<5;j++){
      const pts=[];
      for(let i=0;i<17;i++){
        const u=(j+i/16)/5;
        const x0=790+u*370;
        const env=Math.sin(Math.PI*u);
        const y0=355+Math.sin(u*Math.PI*18+(f-S[3])*.045)*env*(44+8*Math.sin(f*.031));
        const xlocal=-cw/2+30+u*(cw-60);
        const ylocal=-ch/2+190+Math.sin(u*Math.PI*18+(f-S[3])*.045)*Math.sin(Math.PI*u)*35;
        const x1=cx+xlocal*Math.cos(crad)-ylocal*Math.sin(crad);
        const y1=cy+xlocal*Math.sin(crad)+ylocal*Math.cos(crad);
        pts.push([mix(x0,x1,p),mix(y0,y1,p)]);
      }
      b+=group(`<path d="${pathPoints(pts)}" fill="none" stroke="${P.ink}" stroke-width="${n(mix(4,5,p))}" stroke-linecap="round"/>`,waveA);
    }
  }
  const evidenceHeading=windowAlpha(f,S[4]+24,S[4]+60,S[6]-12,S[6]+42);
  const headingShift=smooth(progress(f,S[5]-18,S[5]+30));
  b+=group(text('收起原理图，',64,278,53)+text('回到研究说明。',64,350,53)+text('沿来源回查，为实验留出位置。',67,417,21,P.muted),evidenceHeading*(1-headingShift));
  b+=group(text('研究说明，连着来源与实验。',64,150,39),evidenceHeading*headingShift);
  // Evidence labels are anchored to the actual document stack, not decorative floating particles.
  const labelA=windowAlpha(f,S[5]+60,S[5]+84,S[6]-6,S[6]+24);
  b+=group(text('保留未验证。',996,390,23)+text('不伪造结果。',996,430,23,P.muted),labelA);
  const ending=smooth(progress(f,...T.endTitle));
  b+=group(revealText('GitHub',64,247,76,P.ink,ending,'end1')+revealText('项目研究集',64,342,76,P.ink,ending,'end2')+text('让收藏，有下文。',68,406,28,P.muted),ending);
  const urlP=out(progress(f,S[7]-24,S[7]));
  b+=group(rect(65,500,1150,81,P.ink,16)+text('github.com/yydshly/1020_codex_project',92,551,33,P.paper)+line(1164,549,1186,527,P.gold,3)+line(1164,527,1186,527,P.gold,3)+line(1186,527,1186,549,P.gold,3),urlP);
  // Sequence-specific context, always inside 5% safe margins.
  const captionFrame=Math.round(f);
  const index=Math.max(0,S.findIndex((a,i)=>i<S.length-1&&captionFrame>=a&&captionFrame<S[i+1]));
  const captions=['收藏标记 → 002 档案','真实研究目录 / 为影片重构','原理示意 / 不代表模型已实测','原理示意 / 不代表模型已实测','收起原理图，不把输出当成来源','实验计划存在 ≠ 实验已经通过','同一份 002 档案，回到研究集','从原理理解，到实践验证'];
  b+=text(captions[index],64,666,17,P.muted);
  b+=text('研究 003 / V2',1216,666,15,P.muted,'text-anchor="end"');
  if(f>=S[2]){
    b+=group(rect(1097,99,119,39,P.gold,12)+text('002 档案',1156,126,18,P.ink,'text-anchor="middle"'),out(progress(f,S[2],S[2]+18)));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><g font-family="Noto Sans CJK SC" font-weight="400">${b}</g></svg>`;
}
