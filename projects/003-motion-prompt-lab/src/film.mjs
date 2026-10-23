// One deterministic drawing function is shared by the browser and offline render.
export const palette = {paper:'#f3f2e9',ink:'#19362f',muted:'#52635c',line:'#c9d0c5',orange:'#e79b40',white:'#ffffff',dark:'#102c25',mint:'#c0d6ba'};
const clamp = v => Math.max(0,Math.min(1,v));
const ease = v => {v=clamp(v);return 1-Math.pow(1-v,3);};
const lerp = (a,b,p) => a+(b-a)*p;
export function drawFilm(ctx, frame, timing) {
  const {width:W,height:H,fps}=timing;
  const f=Math.max(0,Math.min(frame,timing.duration*fps-1));
  const t=f/fps;
  const scene=timing.scenes.findIndex(s=>f>=s.start&&f<s.end);
  const sf=f-timing.scenes[scene].start;
  const dark=scene===2||scene===4;
  const C=palette;
  ctx.save();ctx.scale(ctx.canvas.width/W,ctx.canvas.height/H);
  ctx.fillStyle=dark?C.dark:C.paper;ctx.fillRect(0,0,W,H);
  function text(str,x,y,size=24,color=dark?C.paper:C.ink,weight=400,align='left'){
    ctx.font=`${weight} ${size}px "Lab Sans", "Microsoft YaHei", sans-serif`;
    ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillStyle=color;ctx.fillText(str,x,y);
  }
  function rect(x,y,w,h,fill,r=16,stroke=null) {
    ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}
  }
  function line(x1,y1,x2,y2,col,width=2) {ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=col;ctx.lineWidth=width;ctx.stroke();}
  function dot(x,y,r,col){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();}
  function enter(delay,fn) {
    const p=ease((sf-delay)/35);
    ctx.save();ctx.globalAlpha=p;ctx.translate(0,24*(1-p));fn(p);ctx.restore();
  }
  // Subtle printing grid, not decorative particles.
  ctx.globalAlpha=.18;
  for(let x=64;x<W;x+=48)line(x,90,x,630,dark?'#466055':C.line,.5);
  for(let y=104;y<640;y+=48)line(64,y,1216,y,dark?'#466055':C.line,.5);
  ctx.globalAlpha=1;
  text('FIELDNOTES  /  GitHub 项目研究集',64,53,18,dark?C.mint:C.muted);
  text(`0${scene+1} / 05`,1216,53,18,dark?C.mint:C.muted,400,'right');
  line(64,75,1216,75,dark?'#466055':C.line,1);
  if(scene===0){
    text('从收藏，到真正理解',68,170,22,C.muted);
    text('收藏之后，',64,280,78,C.ink);
    text('理解开始。',64,382,78,C.ink);
    rect(66,424,350,52,C.orange,26);
    text('开源项目，也值得认真研究。',88,459,21,C.ink);
    text('原理  /  实践  /  Web 演示',68,551,23,C.muted);
    const bob=Math.sin(t*1.4)*3;
    ctx.save();ctx.translate(870,341+bob);ctx.rotate(-.09*(1-ease(sf/170)));
    rect(-163,-141,354,310,'#dce2d7',20);
    ctx.rotate(.045);
    rect(-191,-161,354,310,C.white,20,C.line);
    rect(-166,-134,60,38,C.ink,10);text('002',-154,-107,21,C.white);
    text('研究档案',-166,-30,36);
    text('六个 AI 内容工具',-166,20,25);
    line(-166,54,133,54,C.line);
    text('来源 · 原理 · 实验',-166,98,20,C.muted);
    dot(117,-115,16,C.orange);
    ctx.beginPath();ctx.moveTo(117,-126);ctx.lineTo(120,-118);ctx.lineTo(128,-115);ctx.lineTo(120,-112);ctx.lineTo(117,-104);ctx.lineTo(114,-112);ctx.lineTo(106,-115);ctx.lineTo(114,-118);ctx.closePath();ctx.fillStyle=C.ink;ctx.fill();
    ctx.restore();
  } else if(scene===1) {
    text('让项目有来处，也有去处。',64,144,43);
    const zoom=ease(sf/40);
    ctx.save();ctx.translate(640,390);ctx.scale(lerp(.94,1,zoom),lerp(.94,1,zoom));ctx.translate(-640,-390);
    rect(92,189,1096,400,C.white,20,C.line);
    rect(92,189,1096,52,C.ink,20);
    rect(92,217,1096,24,C.ink,0);
    dot(117,215,5,'#e8aa7a');dot(136,215,5,'#e6cd8b');dot(155,215,5,'#9bbfa4');
    text('GitHub 项目研究集  /  目录',188,222,17,C.white);
    enter(30,()=>{
      rect(122,266,1036,132,C.paper,12);
      text('001',146,309,27,C.muted);
      text('cyber-xiaowan',247,310,32);
      text('从图片陪伴，理解桌宠与 Agent 的关系',247,354,21,C.muted);
      text('研究中',1119,337,18,C.muted,400,'right');
    });
    enter(60,()=>{
      rect(122,416,1036,142,'#e9eedf',12,C.mint);
      rect(139,446,76,49,C.ink,12);text('002',177,479,26,C.white,400,'center');
      text('六个 AI 内容工具的原理与实践',247,466,29);
      text('Kokoro  /  DigUp  /  Podcastfy  /  …',247,510,21,C.muted);
      const p=ease((sf-120)/45);
      rect(1010,458,118,48,C.ink,24);
      text('打开 →',1069,490,19,C.white,400,'center');
      if(p>0){ctx.globalAlpha=p;dot(1079+20*(1-p),531+20*(1-p),8,C.orange);}
    });ctx.restore();
  } else if(scene===2) {
    text('沿着问题，把工具看明白。',64,154,43);
    text('以 002 号研究为例',66,199,21,C.mint);
    const cards=[
      {n:'01',title:'找到来源',body:'官方仓库与研究版本',small:'SOURCE'},
      {n:'02',title:'理解原理',body:'输入 → 处理 → 输出',small:'UNDERSTAND'},
      {n:'03',title:'实践验证',body:'记录结果，也记录未完成',small:'VERIFY'}
    ];
    cards.forEach((a,i)=>{
      enter(i*30,p=>{
        const x=64+i*394;
        rect(x,270,364,266,'#214338',18,'#527264');
        text(a.n,x+28,320,24,C.mint);
        text(a.title,x+28,381,37,C.paper);
        text(a.body,x+28,425,21,C.mint);
        text(a.small,x+28,497,16,C.mint);
        if(i<2){const q=ease((sf-30-i*30)/30);line(x+365,405,x+365+29*q,405,C.orange,3);}
      });
    });
    const p=clamp((sf-100)/100);
    line(66,577,1214,577,'#466055',3);
    line(66,577,66+1148*p,577,C.orange,3);
    dot(66+1148*p,577,6,C.orange);
  } else if(scene===3) {
    text('把结论，交还给证据。',64,151,46);
    rect(64,209,570,382,C.ink,18);
    text('projects / 002-ai-content-toolkit',91,255,22,C.mint);
    line(92,276,605,276,'#527264');
    const paths=[['README.md','研究说明'],['notes / sources.json','版本与来源'],['notes / 07-experiments.md','实验计划'],['web / index.html','Web 演示']];
    paths.forEach((p,i)=>enter(i*18,()=>{
      text(p[0],94,325+i*61,21,C.paper);
      text(p[1],602,325+i*61,18,C.mint,400,'right');
    }));
    const labels=[['来源可追溯','官方仓库、固定版本'],['理解有结构','输入、输出与运行条件'],['验证有边界','已做什么，尚未做什么']];
    labels.forEach((p,i)=>enter(30+i*30,()=>{
      rect(673,209+i*130,543,112,i===2?'#e9eedf':C.white,14,C.line);
      dot(705,245+i*130,6,i===2?C.ink:C.orange);
      text(p[0],727,251+i*130,27);
      text(p[1],727,289+i*130,20,C.muted);
    }));
  } else {
    // Deliberate stable reading time; tiny background motion is not counted as a quality win.
    rect(64,124,108,44,C.orange,22);
    text('研究 / 实践',118,154,17,C.ink,400,'center');
    text('GitHub',64,272,90,C.paper);
    text('项目研究集',64,377,88,C.paper);
    enter(20,()=>text('从原理理解，到实践验证。',68,444,31,C.mint));
    enter(45,()=>{
      rect(66,493,1148,85,'#214338',13,'#527264');
      text('github.com/yydshly/1020_codex_project',92,546,34,C.paper);
      line(1155,547,1182,520,C.orange,3);line(1158,520,1182,520,C.orange,3);line(1182,520,1182,544,C.orange,3);
    });
    const p=ease(sf/85);
    ctx.save();ctx.translate(1060,280);ctx.rotate(lerp(-.15,.04,p));
    rect(-99,-83,175,147,'#365548',17);rect(-121,-105,175,147,C.mint,17);
    text('002',-99,-62,24,C.ink);
    rect(-97,-28,125,8,C.ink,4);rect(-97,-8,95,8,'#657e67',4);
    ctx.restore();
  }
  const labels=['一张收藏卡片，成为一份研究档案。','真实条目 · 为影片重构的界面','研究流程 ≠ 全部实验已经完成','本地研究内容 · 不代表全部已上线','打开仓库，继续研究。'];
  text(labels[scene],64,663,18,dark?C.mint:C.muted);
  text(`${(f/fps).toFixed(1).padStart(4,'0')}s`,1216,663,18,dark?C.mint:C.muted,400,'right');
  line(64,688,1216,688,dark?'#466055':C.line,2);
  line(64,688,64+1152*f/(timing.duration*fps-1),688,C.orange,3);
  // A shared orange card edge wipes each scene, centered on an exact beat boundary.
  if(scene>0 && sf<18) {
    const p=ease(sf/18);
    rect(lerp(0,1280,p),0,1280,720,C.orange,0);
  }
  if(scene<4 && sf>222) {
    const p=ease((sf-222)/18);
    rect(lerp(-1280,0,p),0,1280,720,C.orange,0);
  }
  ctx.restore();
}
