// SPDX-License-Identifier: GPL-3.0-only
// A single, self-contained evidence poster. Original screenshots stay untouched.
// node src/build-exploration-overview.mjs [--node-modules <directory containing sharp>]
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),moduleArg=process.argv.indexOf('--node-modules');
const sharp=moduleArg>=0?require(path.resolve(process.argv[moduleArg+1],'sharp')):require('sharp');
const root=fileURLToPath(new URL('../',import.meta.url)),workspace=path.resolve(root,'../..');
const output=path.join(root,'web/assets');await mkdir(output,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const e=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const W=2600,M=90,C=W-M*2,gap=30;
const ink='#183a43',muted='#61777a',paper='#f3f2e9',white='#fdfcf8',teal='#246d6d',dark='#102f3b',gold='#af8642',rust='#a65b42',line='#cbd6ca';
let nodes=[],y=0;const textBlocks=[],images=[];
function rect(x,y,w,h,fill=white,stroke='',rx=0){nodes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${stroke?` stroke="${stroke}" stroke-width="2"`:''}/>`);}
function rule(x1,y1,x2,y2,color=line,width=2,dash=''){nodes.push(`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}"${dash?` stroke-dasharray="${dash}"`:''}/>`);}
function approx(s,size){return [...s].reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?(/[MW@]/.test(c)?.8:.56):1)*size,0);}
function wrap(s,w,size){const lines=[];for(const raw of String(s).split('\n')){let l='';for(const c of raw){if(l&&approx(l+c,size)>w&&!/[，。！？；：、）】”’]/.test(c)){lines.push(l);l='';}l+=c;}lines.push(l);}return lines;}
function txt(x,top,s,size=30,color=ink,weight=400,width=C,lh=size*1.52){const lines=wrap(s,width,size);nodes.push(`<text x="${x}" y="${top+size}" font-size="${size}" fill="${color}" font-weight="${weight}">${lines.map((l,i)=>`<tspan x="${x}" y="${top+size+i*lh}">${e(l)}</tspan>`).join('')}</text>`);textBlocks.push({text:s,x,y:top,width,size,lines:lines.length,bottom:top+lines.length*lh});return top+lines.length*lh;}
function pill(x,top,label,color=teal){const w=approx(label,25)+42;rect(x,top,w,43,color,'',6);txt(x+21,top+4,label,25,'#fffdf3',500,w-36,32);return w;}
function title(no,name,sub){y+=50;txt(M,y,`${no} / ${name}`,45,ink,600);y+=71;if(sub)y=txt(M,y,sub,29,muted,400,C,43)+28;return y;}
function card(x,top,w,h,heading,body,{accent=teal,fill=white,size=29}={}){rect(x,top,w,h,fill,line,8);rect(x,top,6,h,accent);let q=txt(x+25,top+20,heading,32,accent,600,w-50,43)+12;q=txt(x+25,q,body,size,ink,400,w-50,size*1.48);if(q>top+h-12)throw new Error('Card text overflow: '+heading);return top+h;}
const selected={
 sourceStory:{file:'projects/015-jiangshan-atlas/web/upstream/assets/preview_journey_sushi.webp',title:'源库：苏轼生平与编号行迹',caption:'人物经历、地图路线、内容卡与年份共同响应。',tag:'源库固定版本预览',origin:'DeanChensj / jiangshan-map',version:'53059f1c7fed305807b19365857a5f135daf3ac6',sourceUrl:'https://github.com/DeanChensj/jiangshan-map'},
 sourceLayers:{file:'projects/015-jiangshan-atlas/web/upstream/assets/preview_1415_ming_yingtian.webp',title:'源库：疆域、山川与古今图层',caption:'历史政区、现代参照、编年事件和时间轴构成阅读层次。',tag:'源库固定版本预览',origin:'DeanChensj / jiangshan-map',version:'53059f1c7fed305807b19365857a5f135daf3ac6',sourceUrl:'https://github.com/DeanChensj/jiangshan-map'},
 p015:{file:'projects/015-jiangshan-atlas/assets/acceptance-desktop.png',title:'015｜完整能力封装',caption:'外围六个体验入口为我们新增；内层地图直接复用原作。',tag:'本地实际验收截图',origin:'015 archive'},
 p016:{file:'projects/016-dongpo-journey/assets/acceptance-atlas-3d.jpg',title:'016｜我们新增真三维山河',caption:'原历史引擎与资料＋Three.js地形；同一人物与年份联动。',tag:'本地实际验收截图',origin:'016 archive'},
 early:{file:'projects/017-abyss-expedition/assets/rework/01-before-1280.jpg',title:'017早期｜能运行的沙盘',caption:'可交互，但角色、尺度、水下环境和任务目的都不够清楚。',tag:'保留失败与返工依据',origin:'017 early rework'},
 principle:{file:'projects/017-abyss-expedition/assets/full-voyages/final-vents-04.jpg',title:'017后期｜热液原理动画',caption:'下渗、受热与回流对应解说；教学示意，不是地质数值模拟。',tag:'实际运行 / 原理舞台',origin:'017 full-voyages / app66'},
 sampling:{file:'projects/017-abyss-expedition/assets/full-voyages/closeup-canyon-B-end.jpg',title:'017后期｜同类采水对照',caption:'潜器、采水架、站位与采样结果对应；不把模拟读数当作实测。',tag:'实际运行 / 采水近景',origin:'017 full-voyages / app67'},
 driving:{file:'projects/017-abyss-expedition/assets/visible-cues/07-ready.jpg',title:'017后期｜自由驾驶与讲解',caption:'语句提示、同站观察窗、自由镜头与驾驶控制配合使用。',tag:'实际运行 / 可见提示',origin:'017 visible-cues verification'}
};
async function imageCard(key,x,top,w,h,captionH=158){const item=selected[key],file=path.resolve(workspace,item.file);const bytes=await readFile(file),meta=await sharp(bytes).metadata();const thumb=await sharp(bytes).resize({width:1500,withoutEnlargement:true}).jpeg({quality:88}).toBuffer();
 rect(x,top,w,h+captionH,white,line,7);rect(x+2,top+2,w-4,h-4,'#e3e8dc');nodes.push(`<image x="${x+3}" y="${top+3}" width="${w-6}" height="${h-6}" preserveAspectRatio="xMidYMid meet" href="data:image/jpeg;base64,${thumb.toString('base64')}"/>`);
 let q=txt(x+20,top+h+14,item.title,w<900?31:35,ink,600,w-40,43);q=txt(x+20,q+6,item.caption,26,muted,400,w-40,37);q=txt(x+20,q+7,item.tag,22,key.startsWith('source')?rust:teal,500,w-40,30);if(q>top+h+captionH-8)throw Error('Image caption overflow: '+key);
 images.push({...item,key,width:meta.width,height:meta.height,sha256:sha(bytes)});return top+h+captionH;}

// Header.
rect(0,0,W,315,dark);txt(M,42,'RESEARCH ATLAS / 015—017 / 2026.10.25',27,'#bed0c2',500);txt(M,92,'从一幅历史地图，到一套可追查的探索',66,'#f5f0dc',600);txt(M,187,'原作效果 → 源码研究 → 三次实践 → 反复修正 → 复用边界 → 后续目标',34,'#d1ded0',400);pill(M,252,'阶段性归档',gold);pill(M+235,252,'铁路：后续扩展，暂不启动',teal);
y=315;

// 01: show the actual reference, with explicit provenance.
title('01','源库是什么？地图如何讲故事','江山时序 · DeanChensj / jiangshan-map。以下两图为固定版本自带预览，非本轮新截图。');
const half=(C-gap)/2;let end=await imageCard('sourceStory',M,y,half,725,166);await imageCard('sourceLayers',M+half+gap,y,half,725,166);y=end+25;
const cap=[['时间与疆域','选年份，查看阶段疆域、纪年与事件。'],['城池与人物','点城读沿革，沿人物生平与编号行迹读史。'],['图层与玩法','古今参照、诗词路线、寻址挑战共用资料。']];const third=(C-gap*2)/3;
cap.forEach((c,i)=>card(M+i*(third+gap),y,third,172,c[0],c[1],{size:27}));y+=196;
rect(M,y,C,90,'#e6ebdf');txt(M+24,y+15,'实现辨析：源库主体是 SVG 地图＋晕渲／浮雕底图；016中的 Three.js 真三维是我们新增的扩展。',30,ink,500,C-48,43);y+=112;
txt(M,y,'固定资料包：18个历史时期 / 468条编年事件 / 113个人物档案 / 7个预设旅程。计数代表资料规模，不代表逐条人工核验。',25,muted,400,C,37);y+=65;

// 02: the exact study topics and sequence of exploration.
title('02','我们研究了什么，又是怎样走过来的？','先看真实操作，再追代码和数据；区分直接复用、方法借鉴、第三方依赖与独立新增。');
const topics=[['时间切片','年份 → 阶段 → 地图快照'],['同一状态','动作 → 状态 → 多个视图'],['坐标与图层','统一地理坐标，分层绘制'],['实体与查询','稳定ID连接搜索、地点与事件'],['异步提交','旧请求不能覆盖最新选择'],['加载与细节','按需加载、缓存与渐进显示'],['URL语义','重放确定的年份、人物与站点'],['资料再利用','同一资料派生路线、卡片与挑战']];const fourth=(C-gap*3)/4;
topics.forEach((t,i)=>card(M+(i%4)*(fourth+gap),y+Math.floor(i/4)*164,fourth,143,t[0],t[1],{size:25}));y+=345;
const stages=[['015｜展示与拆解','完整原作本地体验；六个入口、源码方法、规划模板；自行提炼时间状态核心。'],['016｜集成与三维扩展','直接复用54份上游输入；新增现代高程、三维地图与路线工作台。'],['017｜独立流程实验','两条各11章教学航次；设备、原理、采样、导演、语音、自由驾驶与镜头。']];
stages.forEach((t,i)=>card(M+i*(third+gap),y,third,245,t[0],t[1],{size:28,accent:i===2?gold:teal}));y+=280;
const pathSteps=[['01 能力展示','先把原作运行与入口组织清楚'],['02 指令研究','解释AI开发与网页运行的区别'],['03 微缩3D偏题','有三维，但缺少原作完整地图能力'],['04 完整地图＋3D','回到历史状态与空间联动'],['05 深海独立尝试','换主题检验通用交互基础'],['06 质感与环境返工','补尺度、船体、水体与可辨认对象'],['07 故事与设备补全','交代任务、原理、工具与前因后果'],['08 采样与结尾','同类A/B对照，已知与待分析分开'],['09 自由驾驶','独立位姿、镜头和整机安全约束'],['10 音画对应','对象高亮、可见区域与观察窗'],['11 完整验收与整理','两航次实播、证据归档、地图接入'],['12 修正复用判断','地图与流程分开，铁路留待后续']];
pathSteps.forEach((t,i)=>card(M+(i%4)*(fourth+gap),y+Math.floor(i/4)*146,fourth,124,t[0],t[1],{size:23,accent:i===11?rust:gold}));y+=449;

// 03: actual local outputs, including the early failure.
title('03','我们的效果：保留成果，也保留没有做好的版本','以下均为已有实际运行或验收截图。历史版本保留当时范围；不能用局部截图宣称所有功能已通过。');
const gallery=['p015','p016','early','principle','sampling','driving'];const picH=455,captionH=195;
for(let i=0;i<gallery.length;i++)await imageCard(gallery[i],M+(i%3)*(third+gap),y+Math.floor(i/3)*(picH+captionH+28),third,picH,captionH);
y+=2*(picH+captionH+28)+5;
rect(M,y,C,115,'#e6ebdf');txt(M+24,y+16,'三种成果分别看：015证明原作可展示；016证明历史运行时可集成并扩展三维；017沉淀独立流程交互。研究页又把完整地图作为独立展品接入。',30,ink,500,C-48,44);y+=137;

// 04: improvements and the crucial correction.
title('04','真正推动作品前进的，是哪些修正？','功能存在、画面好看、用户看懂、模块能复用，是四件需要分别检查的事。');
const fixes=[['模型出现 → 理解任务','补角色、调查目的、环境和结尾。'],['沙盘感 → 可辨认场景','改船体、海床、水体线索与尺度。'],['听到语音 → 知道看哪','基础概念、原理动画、对应高亮。'],['只能看 → 可以亲自操作','自由驾驶、自由镜头、手动采样。'],['画外或穿墙 → 安全可见','可见对象选择、观察窗与碰撞保护。']];
const fixW=(C-gap*4)/5;fixes.forEach((t,i)=>card(M+i*(fixW+gap),y,fixW,213,t[0],t[1],{size:26,accent:gold}));y+=245;
rect(M,y,C,300,dark,'',8);let q=txt(M+30,y+23,'关键认识：地图讲故事，与动作讲流程，是两类不同的作品。',41,'#f1e6bd',600,C-60,58);q=txt(M+30,q+14,'地图叙事：何时、何地、发生什么；围绕地理关系、时间、事件与阅读。\n动作流程：做什么、怎么做、为何这样做；围绕模型、动作、条件与反馈。',30,'#d5e0d7',400,C-60,45);txt(M+30,q+17,'因此：深海成果不足以证明源库核心地图能力已成功跨主题迁移；共用时间轴或 Three.js 也不足以证明。',31,'#f0c3a9',500,C-60,46);y+=327;

// 05: what is actually reusable, and how AI is involved.
title('05','留下哪些沉淀？价值与边界分别是什么？','保留代码合同、来源、示例、指令与验收；下一次要用真实实例验证，而不是只看模块数量。');
const cores=['时间状态','实体查询','轨迹插值','异步保护','相机协议','导演时钟','临时采样','独立驾驶','语句提示'];const coreW=(C-gap*8)/9;
cores.forEach((c,i)=>{rect(M+i*(coreW+gap),y,coreW,72,'#e0e9dd',line,7);txt(M+i*(coreW+gap)+14,y+18,c,27,teal,600,coreW-25,35);});y+=94;
txt(M,y,'九个纯核心的归属：时间核心来自015自行提炼；其余八个在017新写。它们主要是通用基础，并非从源库直接抽取的九个地图模块。',29,ink,500,C,43);y+=112;
const levels=[['可按需直接复用','纯核心、输入输出合同与回归方法；新主题仍需数据和业务规则。'],['需要拆分与适配','016地形、投影、标注与图层仍依赖历史控制器；尚非通用地图引擎。'],['需要重新制作','新主题的内容、对象、尺度、网络规则、镜头、材质与叙事。']];levels.forEach((t,i)=>card(M+i*(third+gap),y,third,218,t[0],t[1],{size:28,accent:i===1?rust:teal}));y+=243;
rect(M,y,C,122,'#e7ebdf');txt(M+24,y+15,'AI角色：可辅助研究、编程、整理与迭代。网页运行依靠既有代码、数据与浏览器；MiniMax在生成阶段产出音轨，运行时播放本地音频。无法由署名推断作者最初提示词、优化轮数或AI代码比例。',28,muted,400,C-48,42);y+=145;

// 06: future project, a visibly hypothetical network and a testable plan.
title('06','后续扩展：中国铁路网络演进','回到地图叙事范围，用第二个独立地图实例检验：哪些能保留，哪些需适配，哪些必须新增。');
pill(M,y,'规划目标，暂不启动',gold);y+=66;
const networkW=900;rect(M,y,networkW,390,'#e8eee3',line,8);txt(M+24,y+18,'概念示意 · 非真实线路或数据',26,muted,500,networkW-48,36);
const pts=[[130,210,'站点A'],[350,210,'连接点B'],[620,130,'站点C'],[620,310,'站点D'],[790,210,'站点E']];
rule(M+130,y+210,M+350,y+210,teal,10);rule(M+350,y+210,M+620,y+130,teal,10);rule(M+350,y+210,M+620,y+310,gold,10,'15 10');rule(M+620,y+130,M+790,y+210,gold,10,'15 10');
for(const [px,py,label] of pts){nodes.push(`<circle cx="${M+px}" cy="${y+py}" r="15" fill="${white}" stroke="${teal}" stroke-width="6"/>`);txt(M+px-58,y+py+25,label,25,ink,500,140,34);}
txt(M+24,y+338,'结构示意：节点、分支与前后变化',24,muted,400,networkW-48,34);
let ny=y+12;ny=txt(M+networkW+40,ny,'车站—区段—开通事件—资料来源',39,teal,600,C-networkW-40,55);ny=txt(M+networkW+40,ny+18,'某年哪些线路已开通？连接哪些城市？\n前后两个时期，网络新增了什么？\n选一条线或一个站，能否读到事件与依据？',31,ink,400,C-networkW-40,48);ny=txt(M+networkW+40,ny+20,'铁路按有分支的节点—边网络建模；几何相交不自动表示可换乘。首版先核验有限线路、年代、几何与许可，不预设全国覆盖。',29,muted,400,C-networkW-40,43);if(ny>y+390)throw Error('Railway explanation overflow');y+=425;
const next=[['01 资料与范围','核对开通事实、空间走向、日期精度与许可。'],['02 完成地图切片','年份、网络、选中对象、事件卡和来源联动。'],['03 证明真实复用','直接复用／提取适配／铁路新增分别留证。'],['04 双实例回归','共用模块改进后，历史与铁路实例都能检查。']];next.forEach((t,i)=>card(M+i*(fourth+gap),y,fourth,206,t[0],t[1],{size:27,accent:gold}));y+=238;
const values=[['内容价值','看懂不同年份网络如何连接与变化。'],['技术价值','用第二个地图实例验证共用接口。'],['工程价值','入口、合同、来源、指令和验收可接续。'],['研究价值','保留失败与修正，避免把共用技术当成功迁移。']];values.forEach((t,i)=>card(M+i*(fourth+gap),y,fourth,192,t[0],t[1],{size:27}));y+=222;

// Attribution, limits and navigable public entry points.
rect(0,y,W,380,dark);let fy=txt(M,y+25,'阶段收口：当前够用，保留现有入口与记录；铁路留待后续明确启动。',37,'#f3e4b9',600,C,53);
fy=txt(M,fy+14,'证据与边界：源库预览归DeanChensj；上游固定SHA 53059f1c7fed305807b19365857a5f135daf3ac6。016为现代DEM并有显示夸张，非古地貌复原。017为程序化教学海域与模拟读数，非实测海域或数字孪生。',25,'#c9d6cf',400,C,39);
fy=txt(M,fy+12,'已留主要桌面／窄屏、航次播放与交互记录；没有逐条核验所有史料，也未覆盖全部浏览器、物理手机及断网／GPU故障等异常路径。完整运行包接入不等于所有源库功能全面验收。',25,'#c9d6cf',400,C,39);
txt(M,fy+17,'研究档案  yydshly.github.io/1020_codex_project/projects/017-abyss-expedition/research.html\n原作  github.com/DeanChensj/jiangshan-map',26,'#f3e4b9',500,C,38);
const H=y+380;
for(const t of textBlocks)if(t.x<0||t.bottom>H||t.x+t.width>W+1)throw Error('Text block outside poster: '+t.text);
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="poster-title poster-desc"><title id="poster-title">从江山时序到深蓝航迹：完整探索与后续目标</title><desc id="poster-desc">源库效果、八个研究线索、015至017实践、真实截图、关键修正、九个纯核心与边界、中国铁路网络演进后续目标。当前阶段归档，铁路暂不启动。</desc><rect width="100%" height="100%" fill="${paper}"/><g font-family="Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif">${nodes.join('\n')}</g></svg>`;
const svgPath=path.join(output,'exploration-overview.svg'),pngPath=path.join(output,'exploration-overview.png');await writeFile(svgPath,svg);await sharp(Buffer.from(svg),{limitInputPixels:100000000}).png().toFile(pngPath);
const png=await readFile(pngPath),manifest={schema:'exploration-overview/v1',date:'2026-10-25',title:'从一幅历史地图，到一套可追查的探索',status:'阶段性归档；铁路后续扩展，暂不启动',width:W,height:H,images,textBlocks:textBlocks.length,renderedFont:'Microsoft YaHei with system fallbacks',outputs:[{file:'web/assets/exploration-overview.svg',sha256:sha(Buffer.from(svg)),bytes:Buffer.byteLength(svg)},{file:'web/assets/exploration-overview.png',sha256:sha(png),bytes:png.length}],notes:'Original source images are unchanged; contained JPEG thumbnails are embedded in the self-contained SVG. Screenshots retain their historical verification scope.'};
await writeFile(path.join(root,'notes/exploration-overview-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({made:true,width:W,height:H,images:images.length,textBlocks:textBlocks.length,pngBytes:png.length,svgBytes:Buffer.byteLength(svg)},null,2));
