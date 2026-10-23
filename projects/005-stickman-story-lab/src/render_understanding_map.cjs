/* Reproducible research diagram. Source video frames are embedded unchanged. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let Resvg;
try {
  ({ Resvg } = require('@resvg/resvg-js'));
} catch (error) {
  const cacheModule = path.resolve(root, '../../.cache/understanding-map-renderer/node_modules/@resvg/resvg-js');
  // Keep the original local setup working without hiding dependency load errors.
  if (error.code !== 'MODULE_NOT_FOUND' || !error.message.includes("'@resvg/resvg-js'") || !fs.existsSync(cacheModule)) throw error;
  ({ Resvg } = require(cacheModule));
}
const fontFiles = process.platform === 'win32'
  ? ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/msyhbd.ttc'].filter(file => fs.existsSync(file))
  : [];
// On other systems, install a Chinese font such as Noto Sans CJK SC first.
// Loading system fonts discovers installed fonts; it does not install them.
const fontOptions = {
  fontFiles,
  loadSystemFonts: process.platform !== 'win32' || fontFiles.length === 0,
  defaultFontFamily: fontFiles.length ? 'Microsoft YaHei' : 'sans-serif',
};
const W=1800,H=3320;
const c={paper:'#f5f3e9',ink:'#25352c',muted:'#64705f',green:'#3f654f',sage:'#e4eadc',yellow:'#e9edaa',line:'#cdd4c5',white:'#fcfcf5'};
let nodes=[];
const e=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const rect=(x,y,w,h,fill,stroke='none',r=0)=>nodes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`);
const line=(x1,y1,x2,y2,color=c.line,width=2)=>nodes.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"/>`);
const txt=(x,y,s,size=26,fill=c.ink,weight=400,extra='')=>nodes.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" ${extra}>${e(s)}</text>`);
function wrap(s,max){let rows=[],cur='',units=0;for(const ch of s){const n=/[\x00-\x7f]/.test(ch)?0.56:1;if(ch==='\n'||units+n>max){rows.push(cur);cur='';units=0;if(ch==='\n')continue;}cur+=ch;units+=n;}if(cur)rows.push(cur);return rows;}
function para(x,y,s,max=28,size=25,fill=c.muted,leading=39){const rows=wrap(s,max);rows.forEach((row,i)=>txt(x,y+i*leading,row,size,fill));return rows.length*leading;}
function section(y,n,title){txt(80,y,n,24,c.green,600);txt(145,y,title,36,c.ink,700);line(80,y+21,1720,y+21);}
function arrow(x1,y1,x2,y2){nodes.push(`<path d="M${x1},${y1} L${x2},${y2}" fill="none" stroke="${c.green}" stroke-width="2.5" marker-end="url(#arrow)"/>`);}
function photo(x,y,w,h,file){const data=fs.readFileSync(path.join(root,file));const mime=file.endsWith('.jpg')?'image/jpeg':'image/png';nodes.push(`<image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" href="data:${mime};base64,${data.toString('base64')}"/>`);}
rect(0,0,W,H,c.paper);
txt(80,76,'005 / 角色与故事工坊',24,c.green,600);
txt(1720,76,'研究理解总图 · 2026.10.23',22,c.muted,400,'text-anchor="end"');
txt(80,188,'角色定制身份',86,c.ink,700);
rect(80,218,694,88,c.yellow);
txt(80,288,'故事赋予灵魂',86,c.ink,700);
txt(860,190,'用分镜与视觉，',35,c.ink,500);
txt(860,246,'把角色的经历变成可感受的视频。',35,c.ink,500);
txt(860,292,'效果 → 本质 → 原理 → 意义',24,c.green);

section(368,'01','先看效果：从火柴人演示，到阿灯的故事');
for(const x of [80,920])rect(x,415,800,437,c.white,c.line,6);
txt(108,461,'原帖演示 / 火柴人',30,c.ink,700);
txt(948,461,'我们的实践 /《第二副餐具》',30,c.ink,700);
photo(108,490,364,204.75,'assets/shot-10.jpg');
photo(488,490,364,204.75,'assets/shot-50.jpg');
photo(948,490,364,204.75,'assets/story-actual-04s.png');
photo(1328,490,364,204.75,'assets/story-actual-28s.png');
txt(108,727,'约60秒 · 720p',26,c.green,600);
txt(948,727,'30秒 · 1080p · 六个动态镜头',26,c.green,600);
txt(108,776,'简笔角色 × 氛围场景 × 连续叙事',26);
txt(948,776,'定制机器人 × 陪伴故事 × 中文配音字幕',25);
txt(108,820,'真实截帧：原帖10秒、50秒',20,c.muted);
txt(948,820,'真实截帧：成片4秒、28秒',20,c.muted);
txt(80,898,'火柴人是角色风格之一；真正可延续的是角色与故事的组合。',28,c.green,500);

section(969,'02','本质：创作核心与实现能力，各有位置');
rect(80,1016,1640,78,c.ink,'none',4);
txt(900,1067,'定制角色 ＋ 故事情绪  →  分镜与视觉  →  动态影像  →  完整表达',31,c.paper,600,'text-anchor="middle"');
const essence=[
['角色 / 它是谁','外形、声音、性格、经历、渴望与弱点。身份决定它怎样行动。'],
['故事 / 为什么在意它','面对矛盾、作出选择、获得回应。细节与变化让情绪成立。'],
['表达 / 怎样被看见','分镜组织信息与节奏，视觉建立世界，动态与声音完成表演。']
];
essence.forEach((v,i)=>{let x=80+i*560;txt(x+22,1150,v[0],30,c.ink,700);para(x+22,1200,v[1],18,25,c.muted,39);if(i<2)line(x+540,1125,x+540,1293);});
rect(80,1320,1640,59,c.yellow);
txt(104,1360,'图生视频是关键的动态生成环节；角色与故事决定表达的内容。',29,c.ink,600);

section(1450,'03','原理：把内心变成可制作的镜头');
const steps=[['情绪意图','想表达什么'],['角色档案','身份与一致性'],['故事共创','情境、冲突、选择'],['分镜设计','景别、动作、时长'],['视觉首帧','人物、空间、构图'],['图生视频','动作与时间变化'],['声音与剪辑','配音、字幕、节奏'],['审看与修改','连续性与情绪']];
steps.forEach((s,i)=>{let col=i<4?i:7-i,y=i<4?1505:1690,x=80+col*420;rect(x,y,380,128,c.sage,'none',5);txt(x+22,y+40,String(i+1).padStart(2,'0'),20,c.green,600);txt(x+66,y+41,s[0],28,c.ink,700);txt(x+22,y+91,s[1],24,c.muted);if(i<3)arrow(x+389,y+64,x+409,y+64);if(i>3&&i<7)arrow(x-9,y+64,x-30,y+64);});
arrow(1530,1644,1530,1678);
nodes.push(`<path d="M270 1828 V1850 H1750 V1483 H160" fill="none" stroke="${c.line}" stroke-width="2" stroke-dasharray="7 7" marker-end="url(#arrow)"/>`);
txt(800,1844,'发现偏差，返回前序环节局部重做',20,c.muted,400,'text-anchor="middle"');
para(80,1901,'首帧提供视觉起点，动作提示描述表演方向，视频模型生成连续画面；后期把片段组织成完整故事。',62,25,c.muted,40);

section(2020,'04','人把握情绪，模型辅助实现');
rect(80,2066,800,178,c.white,c.line,5);rect(920,2066,800,178,c.white,c.line,5);
txt(108,2113,'人：决定与判断',30,c.ink,700);
para(108,2163,'提供真实感受和细节，选择故事方向；\n判断表演尺度、情绪和取舍。',29,25,c.muted,39);
txt(948,2113,'模型与工具：协助与执行',30,c.ink,700);
para(948,2163,'辅助角色、故事和分镜；生成图像、\n动作与合成声音；工具完成剪辑合成。',29,25,c.muted,39);
txt(80,2291,'人不必独自写完故事，也不能把是否有共鸣完全交给模型。',25,c.green,500);

section(2368,'05','阿灯样例：让情绪落在行动里');
txt(80,2433,'想有人陪伴，却怕打扰别人。',36,c.ink,700);
const beats=[['等待','留着空位'],['期待','听见脚步'],['失落','只是问路'],['勇气','开口邀请'],['喜悦','擦净杯子'],['安稳','两人同桌']];
beats.forEach((b,i)=>{let x=80+280*i;rect(x,2470,240,111,i===3?c.yellow:c.sage,'none',5);txt(x+20,2513,b[0],29,c.ink,700);txt(x+20,2554,b[1],24,c.muted);if(i<5)arrow(x+250,2525,x+270,2525);});
txt(80,2628,'一张空椅、伸手前的停顿、略急的准备，让观众自己感受它的渴望。',27,c.green,500);
txt(80,2678,'已完成：1张角色图＋6张首帧＋6条Kling V3视频＋双人中文配音与后期。',25,c.ink);
txt(80,2719,'六条视频共528积分，仅为视频生成费用；不代表固定成本或稳定量产能力。',22,c.muted);

section(2800,'06','意义：让一次创作，成为可继续讲述的世界');
const values=[['表达价值','把个人情绪变成可观看、可修改的故事。'],['创作积累','角色、经历、分镜和素材可以保留、复用。'],['扩展方向 / 待实践','系列故事、关系档案、多语言、多画幅、单镜头重做。']];
values.forEach((v,i)=>{let x=80+560*i;txt(x,2870,v[0],28,c.ink,700);para(x,2919,v[1],19,25,c.muted,39);});

rect(80,3032,1640,171,c.sage,'none',4);
txt(104,3074,'边界与证据',24,c.green,700);
para(104,3116,'原帖具体模型与底层流程未核实；我们验证的是自己的图生视频路线。首版仍有杯纹、围巾和手部的跨镜差异，故事是否打动人需观众反馈。',65,23,c.muted,36);
txt(80,3250,'原帖：摸鱼局长 @Jason23818126 · 2026.10.19',20,c.muted);
txt(1720,3250,'原创实践：《第二副餐具》 · 研究整理 2026.10.23',20,c.muted,400,'text-anchor="end"');
txt(80,3291,'先看效果，再理解原理；把身份、情绪与技术连起来。',20,c.green);

const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><title>角色定制身份，故事赋予灵魂：研究理解总图</title><desc>原帖与阿灯真实视频截帧，以及本质、原理、情绪、价值与扩展的完整研究图。</desc><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L7 4 L0 8" fill="none" stroke="${c.green}" stroke-width="1.3"/></marker></defs><g font-family="Microsoft YaHei, Noto Sans CJK SC, PingFang SC, sans-serif">${nodes.join('\n')}</g></svg>`;
const assetDir=path.join(root,'web/assets');
const svgPath=path.join(assetDir,'understanding-map-v1.svg');
const pngPath=path.join(assetDir,'understanding-map-v1.png');
fs.writeFileSync(svgPath,svg);
const renderer=new Resvg(svg,{font:fontOptions,fitTo:{mode:'width',value:2700}});
const image=renderer.render();
fs.writeFileSync(pngPath,image.asPng());
console.log(JSON.stringify({svg:svgPath,png:pngPath,width:image.width,height:image.height,pngBytes:fs.statSync(pngPath).size}));
