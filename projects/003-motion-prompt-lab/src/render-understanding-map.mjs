import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {Resvg} from '@resvg/resvg-js';

const root=new URL('../',import.meta.url);
const font=fileURLToPath(new URL('.cache/v3-source/fonts/NotoSansCJKsc-Regular.otf',root));
GlobalFonts.registerFromPath(font,'Noto Sans CJK SC');
const ctx=createCanvas(10,10).getContext('2d');
const W=2400,P=96,G=32,I=W-P*2,CW=(I-G)/2;
const C={paper:'#f5f3e9',white:'#fffef9',ink:'#193b32',muted:'#52695c',sage:'#e7ecde',line:'#c3ceba',amber:'#b67633',cream:'#fff2da',light:'#d7e3ce'};
const out=[],blocks=[],lineChecks=[],texts=[];
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const width=(s,size)=>{ctx.font=`${size}px "Noto Sans CJK SC"`;return ctx.measureText(s).width;};
function lines(s,size,max){
 const result=[];
 for(const paragraph of s.split('\n')){
  let line='';
  for(const ch of paragraph){
   if(line&&width(line+ch,size)>max&&!/[，。；：、！？）》」】]/.test(ch)){result.push(line);line=ch;}else line+=ch;
  }
  result.push(line);
 }
 return result;
}
function text(s,x,y,max,size=32,{fill=C.ink,weight=400,lh=size*1.55,spacing=0}={}){
 const ls=lines(s,size,max);
 out.push(`<text x="${x}" y="${y+size}" fill="${fill}" font-family="Noto Sans CJK SC" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}">${ls.map((l,i)=>`<tspan x="${x}" dy="${i?lh:0}">${esc(l)}</tspan>`).join('')}</text>`);
 ls.forEach(l=>lineChecks.push({text:l,width:width(l,size),max}));texts.push(s);
 return y+ls.length*lh;
}
const rect=(x,y,w,h,fill,rx=20,stroke='none')=>out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`);
const line=(x1,y1,x2,y2,stroke=C.line,sw=2)=>out.push(`<path d="M${x1},${y1} L${x2},${y2}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`);
function label(s,x,y,max=I,fill=C.muted){return text(s,x,y,max,26,{fill,weight:600,lh:38});}
function heading(n,s,y){label(n,P,y,100,C.amber);text(s,P+120,y-9,I-120,46,{weight:700,lh:65});return y+78;}
function paragraphCard(title,body,x,y,w){
 const index=out.length;out.push('');
 let yy=text(title,x+32,y+26,w-64,38,{weight:700,lh:56});
 yy=text(body,x+32,yy+16,w-64,31,{lh:47});
 const h=yy-y+28;
 out[index]=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${C.white}" stroke="${C.line}"/>`;
 return y+h;
}
const sha=b=>createHash('sha256').update(b).digest('hex');

let y=64;
label('动效提示词实验室  /  研究与讨论整理',P,y,I,C.amber);y+=58;
y=text('长提示词，最值得留下什么？',P,y,I,89,{weight:700,lh:116});
y=text('从原文与真实成片，走向目标、感受和判断标准。',P,y+10,I,36,{fill:C.muted,lh:54})+38;
const thesisY=y;let ty=y+30;
const thesisIndex=out.length;out.push('');
label('我们的核心判断  ·  趋势推测',P+38,ty,I-76,C.light);ty+=58;
ty=text('随着模型能力提升，\n通用步骤提示的额外作用可能减少。',P+38,ty,I-76,57,{fill:C.paper,weight:700,lh:83});
ty=text('模型越能自主完成分析、计划和检查，重复规定这些步骤的增量价值就可能越小。',P+38,ty+17,I-76,32,{fill:C.light,lh:49});
ty=text('更值得表达：目标 → 情绪与风格 → 氛围与动画目的 → 判断标准',P+38,ty+15,I-76,34,{fill:'#f0c990',lh:53});
out[thesisIndex]=`<rect x="${P}" y="${thesisY}" width="${I}" height="${ty-thesisY+32}" rx="22" fill="${C.ink}"/>`;y=ty+78;

y=heading('01','这个库为什么值得做？原提示词又是什么？',y);
const cardsY=y;
const ca=paragraphCard('研究库：让主张可以被检查','把提示词放进真实任务，保留来源、实际输入、代码与成片、评审、耗时、失败和未完成项。\n帮助判断哪些创作要求值得复用，效果提升是否有证据。',P,y,CW);
const cb=paragraphCard('原提示词：把制作经验写成规约','创作约束 + 制作流程 + 质量检查与交付要求。\n它通过指令调度已有能力；收益来自具体要求和实际执行。篇幅与评审次数本身不能证明质量。',P+CW+G,y,CW);
y=Math.max(ca,cb)+25;
label('证据链',P,y,130,C.amber);
text('原文与来源 → 实际输入 → 可播放成片 → 评审与返修 → 耗时、失败与限制',P+155,y-3,I-155,31,{lh:48});
y+=72;
y=text('原帖提供提示词；本库记录我们的实验。影片由 Canvas / SVG、resvg 与 FFmpeg 实现，网页汇总材料与分析。',P,y,I,29,{fill:C.muted,lh:45})+42;
blocks.push({name:'研究对象',top:cardsY,bottom:y});

y=heading('02','实际效果：相同预算下，全文附加有额外收益吗？',y);
y=text('同场景、共同资料、同工具、同父模型配置；每组 20 分钟，新上下文制作。',P,y,I,32,{lh:48})+12;
y=text('X 同样获得连续变形、可读性与真实性要求；这里比较的是额外附加原文的收益。',P,y,I,29,{fill:C.muted,lh:45})+26;
const scoreY=y,scoreH=402,frameW=520,frameH=292.5;
for(const [i,lab,score,sub] of [[0,'X · 明确需求','70','具体实验样本\n文字相对清晰'],[1,'Y · 原提示词全文','67.5','操作路径连贯\n滑块与波形有关联']]){
 const x=P+i*(CW+G);rect(x,y,CW,scoreH,C.white,18,C.line);
 text(lab,x+30,y+21,CW-60,36,{weight:700,lh:52});
 text(score,x+30,y+82,460,94,{weight:700,lh:128});text('/ 90',x+30,y+208,430,29,{fill:C.muted});
 text(sub,x+30,y+262,440,29,{fill:C.muted,lh:45});
 const b=await readFile(new URL(`.cache/controlled-20261023/blind/analysis-${i?'Y':'X'}/frames/f-051.jpg`,root));
 out.push(`<image x="${x+CW-frameW-24}" y="${y+76}" width="${frameW}" height="${frameH}" href="data:image/jpeg;base64,${b.toString('base64')}"/>`);
 label('实际 MP4 第 10 秒抽帧',x+CW-frameW-24,y+scoreH-42,frameW);
}
y+=scoreH+24;
rect(P,y,I,96,C.cream,14);text('两位 AI 盲评偏好相反，本次未观察到明确额外增益。',P+30,y+21,I-60,37,{weight:700,lh:56});y+=124;
y=text('已做到：两组均完成 20 秒、720p、60fps 影片，并通过完整解码。',P,y,I,31,{lh:47})+9;
y=text('仍有问题：两组均有重复转场、低信息量漂移；Y 另有转场文字重影。',P,y,I,31,{lh:47})+9;
y=text('制作记录：内部评审 / 完整渲染，X 为 4 / 6，Y 为 9 / 4。更多流程没有自动带来更高评分。',P,y,I,29,{fill:C.muted,lh:45})+9;
y=text('历史 V1 / V2 / V3 的投入与实现不同，保留为迭代记录，不用于上述配对结论。',P,y,I,29,{fill:C.muted,lh:45})+47;
blocks.push({name:'实际效果',top:scoreY,bottom:y});

y=heading('03','我们最值得提取的：创作意图与验收标准',y);
const modules=[
 ['01','受众与目标','给谁看？让人理解什么，最后愿意做什么？','开发者：从收藏项目走向理解、查证与实践。'],
 ['02','情绪','希望感受怎样变化？','从“收藏了却没弄懂”的困惑，走向理解与掌控感。'],
 ['03','风格','稳定的表达规则是什么？','暖白与深绿、清晰字级、克制的平面图形与一致的对象语言。'],
 ['04','氛围','整体体验怎样成立？','安静、可信、有探索感；用留白、光色与节奏落实。'],
 ['05','动画目的','动作要解释什么关系？','让对象身份、注意力和信息因果持续可追踪；每次变化推动理解。'],
 ['06','判断标准','怎样知道它做得好？','静音能懂、文字读得完、事实可信、示意与实测分清、动作服务内容。']
];
const mw=(I-G*2)/3,mh=355,moduleY=y;
for(let i=0;i<modules.length;i++){
 const [num,title,q,body]=modules[i],x=P+(i%3)*(mw+G),yy=y+Math.floor(i/3)*(mh+G);
 rect(x,yy,mw,mh,i%2?C.white:C.sage,18,C.line);
 label(num,x+27,yy+21,mw-54,C.amber);
 let my=text(title,x+27,yy+67,mw-54,40,{weight:700,lh:61});
 my=text(q,x+27,my+12,mw-54,31,{weight:600,lh:47});
 my=text(body,x+27,my+16,mw-54,29,{fill:C.muted,lh:45});
 if(my>yy+mh-16)throw Error(`Module overflow ${num}: ${my} > ${yy+mh-16}`);
}
y+=2*mh+G+25;
y=text('把“高级、震撼、流畅”继续说具体：什么感受、看哪里、什么关系、怎样验收。',P,y,I,32,{fill:C.amber,lh:49})+43;
blocks.push({name:'创作意图',top:moduleY,bottom:y});

y=heading('04','让目的决定表现方式',y);
const flowY=y,fw=(I-3*70)/4,fh=160;
for(const [i,title,sub] of [[0,'收藏卡','从一个工具入口开始'],[1,'原理图','把机制逐步展开'],[2,'源码依据','让每个解释有出处'],[3,'实验记录','知道下一步怎样验证']]){
 const x=P+i*(fw+70);rect(x,y,fw,fh,i===0?C.ink:C.sage,16);
 text(title,x+25,y+24,fw-50,40,{fill:i===0?C.paper:C.ink,weight:700,lh:58});
 text(sub,x+25,y+95,fw-50,28,{fill:i===0?C.light:C.muted,lh:43});
 if(i<3)text('→',x+fw+14,y+48,52,46,{fill:C.amber});
}
y+=fh+28;
y=text('表现方式：连续变形、对象交接。表达目的：研究逐步深入，每一步都有依据。',P,y,I,32,{lh:49})+13;
y=text('情绪走向：收藏后的困惑 → 逐渐看懂 → 知道下一步怎么做。',P,y,I,32,{fill:C.muted,lh:49})+40;
blocks.push({name:'动画表达',top:flowY,bottom:y});

y=heading('05','以后可以这样表达需求',y);
label('讨论后整理的表达示例，尚未用于新一轮制作。',P,y,I,C.muted);y+=53;
const briefY=y;let by=y+28;const bi=out.length;out.push('');
by=text('请为【受众】实现【目标】，让感受从【起点】走向【终点】；采用【风格】营造【氛围】，用【动画关系】解释【内容关系】。以【可检查的标准】验收，并明确事实、预算与交付限制。',P+36,by,I-72,39,{weight:600,lh:64});
out[bi]=`<rect x="${P}" y="${briefY}" width="${I}" height="${by-briefY+30}" rx="18" fill="${C.cream}"/>`;y=by+60;
const practical=[['人来明确','目的、偏好、取舍'],['模型选择','拆解、技术、实现方法'],['实际执行','出样 → 审片 → 返修 → 复核']];
let py=y;
for(let i=0;i<practical.length;i++){
 const x=P+i*(mw+G);let yy=text(practical[i][0],x,y,mw,31,{weight:700,lh:48});
 yy=text(practical[i][1],x,yy+8,mw,29,{fill:C.muted,lh:45});py=Math.max(py,yy);
}
y=py+49;
blocks.push({name:'可复用表达',top:briefY,bottom:y});

y=heading('06','证据边界：观察、理解、推测要分开',y);
let ly=y+25;const limitI=out.length;out.push('');
const limits=[
 '只有一个场景、每组一个样本；评审是两个 AI 新上下文。',
 '主要抽帧检查，未完整原速听看；原文流程未在时限内全部完成。',
 '供应端模型版本、token 与费用未锁定；没有跨代模型实验。',
 '不能证明“长提示词普遍无用”，也不能证明模型升级必然使其贬值。'
];
for(const s of limits){rect(P+28,ly+16,8,8,C.amber,4);ly=text(s,P+56,ly,I-88,29,{lh:46})+8;}
out[limitI]=`<rect x="${P}" y="${y}" width="${I}" height="${ly-y+19}" rx="18" fill="${C.white}" stroke="${C.line}"/>`;y=ly+66;
line(P,y,W-P,y,C.line,2);y+=31;
y=text('把希望作品产生的效果说清楚，\n再用真实结果判断是否做到。',P,y,I,54,{weight:700,lh:79})+19;
y=text('研究整理 · 2026.10.23｜事实、原文来源、实际输入与完整评审见本库网页',P,y,I,27,{fill:C.muted,lh:42})+48;
const H=Math.ceil(y);
const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc"><title id="title">一图理解长提示词的价值与我们的研究</title><desc id="desc">研究库价值、提示词本质、固定预算成片对照、受众目标情绪风格氛围动画与验收标准，以及证据边界。</desc><rect width="${W}" height="${H}" fill="${C.paper}"/>${out.join('\n')}</svg>`;
const png=new Resvg(svg,{font:{fontFiles:[font],loadSystemFonts:false,defaultFontFamily:'Noto Sans CJK SC'}}).render().asPng();
const base='understanding-map-2026-10-23';
await mkdir(new URL('assets/',root),{recursive:true});await mkdir(new URL('web/media/understanding/',root),{recursive:true});
for(const [ext,data] of [['svg',svg],['png',png]]){
 await writeFile(new URL(`assets/${base}.${ext}`,root),data);
 await copyFile(new URL(`assets/${base}.${ext}`,root),new URL(`web/media/understanding/${base}.${ext}`,root));
}
const overflow=lineChecks.filter(l=>l.width>l.max+12);
if(overflow.length)throw Error(JSON.stringify(overflow));
const meta={created_utc:new Date().toISOString(),method:'Editable SVG typography and diagrams, rasterized by resvg. Not an AI-generated image.',imagegen_attempt:{status:'failed',reason:'network error: error sending request',prompt_file:'notes/understanding-infographic-prompt.md',output_produced:false},width:W,height:H,files:{png:`assets/${base}.png`,svg:`assets/${base}.svg`},sha256:{png:sha(png),svg:sha(svg)},font_file:'.cache/v3-source/fonts/NotoSansCJKsc-Regular.otf',font_sha256:sha(await readFile(font)),text_blocks:blocks,line_count:lineChecks.length,text_width_overflows:overflow.length,content: texts};
await writeFile(new URL('notes/understanding-map-production.json',root),JSON.stringify(meta,null,2)+'\n');
console.log(JSON.stringify({width:W,height:H,lines:lineChecks.length,pngBytes:png.length,overflow:overflow.length,files:meta.files}));
