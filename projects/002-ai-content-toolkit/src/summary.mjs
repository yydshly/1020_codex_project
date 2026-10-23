// Shared, authored summary for the responsive reader and the downloadable vector poster.
export const summary = {
  title: '六个工具，从模型能力到可用产品',
  intro: '六个独立的开源项目，覆盖资料检索、问题研究、对话改编、语音合成与视频制作。既有直接提供模型能力的工具，也有把现成模型与程序组织起来的产品。',
  map: [
    {title:'查找与研究', tools:'DigUp · Local Deep Research', input:'本地资料 / 一个研究问题', output:'文件与位置 / 报告与引用', note:'让资料可找，让问题有依据'},
    {title:'改编与表达', tools:'Podcastfy · Kokoro', input:'来源资料 / 已确定的文稿', output:'对话播客 / 合成语音', note:'让内容变成可以听的表达'},
    {title:'剪辑与成片', tools:'Short Video Factory · Shorts', input:'素材与文稿 / 已有长视频', output:'素材混剪 / 原片精选片段', note:'把制作步骤交给程序执行'}
  ],
  cards: [
    {id:'kokoro', name:'Kokoro', type:'语音合成模型与推理库', purpose:'把确定的文稿，变成带指定音色的语音。',
      flow:['文本与音素','时长与韵律','音频波形'],
      capability:'按语言、音色和语速合成语音，可在本地加载权重推理。',
      principle:'模型结合音素与风格条件，预测时长、音高等，再解码出采样值。',
      understanding:'权重提供发声能力，音色向量提供风格条件；音色与频谱、包络等有关。输出波形是采样值，不是转录文字。',
      value:'把“怎么发声”变成可复用的模型能力。',
      scenes:'文章朗读、固定文稿配音、语音功能原型。',
      boundary:'标准入口没有任意录音克隆的完整流程；配套编码器未公开。中文发音仍需试听。'},
    {id:'digup', name:'DigUp', type:'模型编码 + 本地混合检索', purpose:'用内容描述，找回本地文件及相关位置。',
      flow:['文件解析分片','向量 + 关键词','候选与位置'],
      capability:'检索文字、图片和音视频内容，返回文件、页码或时间窗口。',
      principle:'跨模态编码产生可比较的向量，与关键词结果校准融合；位置来自索引元数据。',
      understanding:'共享语义空间来自训练时的对齐。图片可直接编码，不必先生成文字描述；索引不是训练。',
      value:'把“我记得内容”变成可执行的搜索。',
      scenes:'个人资料库、素材查找、文档与录音定位。',
      boundary:'向量相近只代表相关性；采样、索引覆盖和中文精确词匹配都会影响结果。'},
    {id:'podcastfy', name:'Podcastfy', type:'资料 → 文稿 → 语音的工作流', purpose:'把资料改编成分角色讲解的对话播客。',
      flow:['提取来源','LLM 写对话','TTS 与合并'],
      capability:'整合支持的资料入口，设置语言、角色与风格，再生成播客音频。',
      principle:'提取正文或字幕，提示现成语言模型写对话，再按角色调用语音后端并拼接。',
      understanding:'理解、改写靠 LLM，发声靠 TTS；产品负责连接流程。类似资料转音频解读这一类能力。',
      value:'减少从资料到“能听懂的讲解”的制作步骤。',
      scenes:'学习资料听读、文章解读、播客内容原型。',
      boundary:'主流程不训练新模型。说得自然不等于事实可靠，来源提取与改写都需核对。'},
    {id:'video-factory', name:'Short Video Factory', type:'按时长组织的素材制作流程', purpose:'用文稿和已有素材，批量合成配音短视频。',
      flow:['文稿 → 配音','按时长抽片','字幕 + 合成'],
      capability:'组织文案、TTS、素材截取、字幕和背景音乐，通过 FFmpeg 导出。',
      principle:'配音总时长作为目标，随机取素材与起点，累计覆盖；TTS 边界用于字幕时间。',
      understanding:'它擅长自动执行剪辑。已查主路径没有按文稿语义选画面；素材相关性需先把关。',
      value:'把重复的素材拼装、叠字和音轨合成自动化。',
      scenes:'已有合适素材的讲解、产品介绍、批量视频草稿。',
      boundary:'不等于理解整条长视频、提炼精彩瞬间。片段能填满配音，不代表画面讲对内容。'},
    {id:'shorts', name:'AI YouTube Shorts Generator', type:'基于转录选段的剪辑流程', purpose:'从已有长视频，挑出适合独立呈现的短片。',
      flow:['语音 → 带时转录','LLM 选区间','原片截取裁切'],
      capability:'分析讲话内容、给出候选区间和标题，截取原画面、保留原声；本地可裁竖屏。',
      principle:'语音识别提供时间文本，LLM 选段，程序检查时间和重叠，再剪辑；人脸检测另管裁切。',
      understanding:'像读带时间的访谈稿后提出剪辑建议。二次创作主要是选段与构图，不是重新配音拍摄。',
      value:'减少翻找长片和逐段裁切的时间。',
      scenes:'访谈、播客录像、讲话主导的课程或分享。',
      boundary:'选段 LLM 不直接看画面。无声精彩场面可能漏掉；长片切点和裁切效果需要回看。'},
    {id:'ldr', name:'Local Deep Research', type:'研究策略 + 模型工具循环', purpose:'围绕问题反复找资料，形成带来源的报告。',
      flow:['问题与范围','搜索 / 阅读循环','综合与引用'],
      capability:'配置模型与来源，多轮搜索、按需读取；详细报告可继续分章节研究。',
      principle:'source-based 按轮次搜集；Agent 由模型选择工具，程序执行并返回结果，直到回答或触及边界。',
      understanding:'用户定目标，模型做语义判断，程序管工具、上下文和来源。循环更新任务资料，不训练权重。',
      value:'把研究步骤组织成可配置、可追溯的过程。',
      scenes:'专题学习、技术方案梳理、资料调查与报告草稿。',
      boundary:'不是每次都先全面规划，也不保证越查越对。结束或带引用，都不等于证据充分。'}
  ],
  distinctions: [
    ['向量的用途不同','音色向量控制声音风格；语义向量衡量内容相关性。都由数字构成，也不能直接互换。'],
    ['制作视频有两条路','Video Factory 按时长拼已有素材；Shorts 读长片转录来选段。输入不同，自动化目标不同。'],
    ['使用模型不等于训练','推理、建索引、反复搜索主要使用已有权重。训练是调整模型参数，不能混为一谈。']
  ],
  personal: [
    ['看懂产品的能力来源','区分模型判断、数据处理和规则执行；理解“效果好”到底依赖哪一层，知道该检查哪里。'],
    ['知道类似产品如何落地','先定义输入与输出，再组合模型、工具、数据格式和控制逻辑；不必默认从训练基础模型开始。'],
    ['把学习转化为可验证的原型','选一个具体任务，跑通最小流程，记录正确性、耗时和人工返工，再决定是否值得继续投入。']
  ],
  takeaway:'对你的核心价值：从“知道工具能做什么”，走到“能解释它为什么有效、知道哪里会失效，并能设计自己的实现”。',
  example:'例如：研究问题 → LDR 报告 → 人工核查 → Podcastfy 对话播客。若更换配音后端为 Kokoro，还需适配接口、格式与音色。',
  caveat:'这里是能力关系与可组合思路，不是已经打通的流水线。六项均基于固定版本文档与代码整理；上游工具本机实测仍为 0。'
};

const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
// Conservatively wrap CJK and Latin text for predictable, portable SVG labels.
function wrap(value,width,size){
  const lines=[]; let line='',used=0;
  for(const ch of value){const w=/[\u0020-\u007e]/.test(ch)?size*.58:size;
    if(ch==='\n'){lines.push(line);line='';used=0;continue;}
    if(used+w>width&&line){
      if(/[，。；：！？、）”》]/.test(ch)){const last=line.slice(-1);lines.push(line.slice(0,-1));line=last;used=/[\u0020-\u007e]/.test(last)?size*.58:size;}
      else{lines.push(line);line='';used=0;}
    }
    line+=ch;used+=w;
  }if(line)lines.push(line);return lines;
}
export function summarySvg(researchTools){
  const W=1920,M=80,G=28,C=(W-2*M-2*G)/3;
  const p={bg:'#f6f5f0',paper:'#fffefa',ink:'#263b34',muted:'#596b60',line:'#cdd5c9',green:'#255746',pale:'#e7ede3',sand:'#f2e8da',orange:'#9b4d34'};
  const body=[];
  const rect=(x,y,w,h,fill,rx=0,stroke='none')=>body.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`);
  const text=(value,x,y,size=24,color=p.ink,weight=400)=>body.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${xml(value)}</text>`);
  const paragraph=(value,x,y,width,size=23,color=p.ink,weight=400,lineHeight=35)=>{const lines=wrap(value,width,size);for(const line of lines){text(line,x,y,size,color,weight);y+=lineHeight;}return y;};
  const line=(x1,y1,x2,y2)=>body.push(`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${p.line}" stroke-width="2"/>`);
  text('AI CONTENT TOOLKIT / RESEARCH NOTEBOOK 002',M,64,21,p.muted,500);
  text('六个工具，从模型能力到可用产品',M,142,62,p.green,700);
  let y=paragraph(summary.intro,M,199,W-2*M,27,p.muted,400,40)+20;
  rect(M,y,W-2*M,58,p.green,12);text('你提供：目标 + 原始资料或素材 + 判断标准',M+30,y+39,26,'#fffefa',600);
  y+=86;
  summary.map.forEach((item,i)=>{const x=M+i*(C+G);rect(x,y,C,200,p.pale,14);text('↓',x+C/2-8,y-10,25,p.muted);text(item.title,x+26,y+43,31,p.green,600);text(item.tools,x+26,y+80,21,p.ink,500);text(item.input,x+26,y+119,23);text('↓  '+item.output,x+26,y+154,23);text(item.note,x+26,y+184,20,p.muted);});
  y+=235;text('能力地图：按任务选择工具；它们并非一个库的六个模块，也不要求全部串联。',M,y,23,p.muted);
  y+=70;text('01—06 / 用同一套问题，理解每一个工具',M,y,33,p.green,600);y+=30;
  const rows=[summary.cards.slice(0,3),summary.cards.slice(3)];
  for(const row of rows){
    const top=y;let tallest=0;
    // Build card bodies first, then insert each background before its body.
    row.forEach((card,i)=>{
      const x=M+i*(C+G),inner=C-52,index=body.length;let cy=top+39;
      text(String(summary.cards.indexOf(card)+1).padStart(2,'0')+' / '+card.type,x+26,cy,20,p.orange,500);cy+=49;
      cy=paragraph(card.name,x+26,cy,inner,31,p.green,700,39)+3;
      cy=paragraph(card.purpose,x+26,cy,inner,23,p.ink,500,34)+13;
      const cell=(inner-52)/3;card.flow.forEach((step,j)=>{const sx=x+26+j*(cell+26);rect(sx,cy,cell,84,p.pale,7);paragraph(step,sx+12,cy+29,cell-24,20,p.green,500,28);if(j<2)text('→',sx+cell+4,cy+47,18,p.muted);});cy+=111;
      for(const [key,label] of [['capability','能力'],['principle','原理'],['understanding','我们的理解'],['value','意义'],['scenes','使用场景']]){
        text(label,x+26,cy,21,p.green,600);cy+=31;cy=paragraph(card[key],x+26,cy,inner,22,p.ink,400,33)+14;
      }
      line(x+26,cy-2,x+C-26,cy-2);cy+=28;text('要记住的边界',x+26,cy,20,p.orange,600);cy+=31;cy=paragraph(card.boundary,x+26,cy,inner,21,p.muted,400,32)+6;
      const tool=researchTools.find(t=>t.id===card.id);text('研究版本 '+tool.evidence.commit.slice(0,7),x+26,cy,18,p.muted);cy+=28;
      const height=cy-top;tallest=Math.max(tallest,height);
      body.splice(index,0,`<rect x="${x}" y="${top}" width="${C}" height="${height}" rx="18" fill="${p.paper}" stroke="${p.line}"/>`);
    });
    y=top+tallest+30;
  }
  y+=26;text('把六个工具放在一起，我们真正理解了什么？',M,y,33,p.green,600);y+=28;
  let bandHeight=0;summary.distinctions.forEach(([title,desc],i)=>{const x=M+i*(C+G),index=body.length;let by=y+38;text(title,x+24,by,26,p.green,600);by=paragraph(desc,x+24,by+38,C-48,23,p.ink,400,35)+12;bandHeight=Math.max(bandHeight,by-y);body.splice(index,0,`<rect x="${x}" y="${y}" width="${C}" height="${by-y}" rx="12" fill="${p.sand}"/>`);});y+=bandHeight+65;
  text('对你有什么价值？',M,y,40,p.green,700);y+=40;
  summary.personal.forEach(([title,desc],i)=>{rect(M,y,54,54,p.green,12);text(String(i+1),M+18,y+36,26,'#fffefa',600);text(title,M+82,y+26,28,p.green,600);y=paragraph(desc,M+82,y+64,W-2*M-82,25,p.ink,400,38)+24;});
  rect(M,y,W-2*M,122,p.pale,14);paragraph(summary.example,M+28,y+42,W-2*M-56,25,p.ink,400,38);y+=157;
  y=paragraph(summary.takeaway,M,y,W-2*M,31,p.green,600,46)+25;
  line(M,y,W-M,y);y+=38;
  y=paragraph(summary.caveat,M,y,W-2*M,21,p.muted,400,32)+10;
  text('整理日期 2026-10-23  ·  详细图解、固定源码与验证计划见本地「AI 内容工具研究笔记」。',M,y,20,p.muted);y+=50;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.ceil(y)}" viewBox="0 0 ${W} ${Math.ceil(y)}" role="img" aria-labelledby="title desc"><title id="title">${xml(summary.title)}</title><desc id="desc">六个工具的总体作用、能力、原理、我们的理解、意义、使用场景与个人价值。基于固定版本研究，不是实测结果。</desc><style>text{font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif}*{box-sizing:border-box}</style><rect width="100%" height="100%" fill="${p.bg}"/>${body.join('\n')}</svg>`;
}
