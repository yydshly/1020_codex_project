/* Authored teaching examples, no recognition, uploads, API calls or rendering. */
(() => {
  'use strict';
  const base='https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/blob/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c/';
  const source=(path,label)=>`<a class="source-link" href="${base}${path}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
  const candidates=[
    {start:130,end:185,title:'先验证需求，再做完整产品',reason:'一次失败经历引出可执行的方法，具备独立观点。',lines:[['02:10','我做得最久的功能，恰好没有人用。'],['02:28','后来我先做一个能演示的小版本，请目标用户试用。'],['02:51','确认他们愿意反复使用，再投入开发。']]},
    {start:650,end:720,title:'收到建议，不等于已经有需求',reason:'从常见误解切入，区分口头赞同与实际需求。',lines:[['10:50','用户说“这个不错”，为什么最后没有使用？'],['11:12','问他上次遇到这个问题时，实际怎样解决。'],['11:42','真实经历和使用行为，比泛泛的赞同更有信息。']]}
  ];
  const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  function recap(){return `<aside class="pf-source"><small>讨论补充 / 提取核心内容与二次创作</small><h3>更像“读带时间的访谈稿，再执行剪辑建议”</h3><p>语音先转成文字，LLM 分析文字并提议区间，程序再截取原画面与原声。它不直接听懂并重写整段视频。</p><p><b>选出的片段不一定是全片最重要的内容。</b>当前提示偏向吸引人的开场、观点、冲突、故事和实用建议，目标更接近挑选适合传播的片段。</p><p><b>这里的二次创作主要是选段与重新构图。</b>已核对主流程不会把观点重写成新文案、重新配音或生成新画面；更深度的改编需要另外的工具或人工处理。</p></aside>`;}
  function effects(){return `<section class="reading-section sh-lesson"><p class="section-kicker">FROM LONG TO SHORT / 从原片选出一段</p><h2>输入一条长视频，输出其中几段原内容</h2>
    ${recap()}<p>假设有一条 20 分钟的产品访谈，希望提取两段能独立理解的观点。切换候选，看看文字、起止秒数和最终短片如何对应。</p>
    <p class="du-demo-label"><b>人工教学示例。</b>文字、区间和推荐理由均预先编写，不是模型输出；没有加载真实视频，没有进行转录、评分或剪辑。文字是节选，不代表完整时段的全部转录。</p>
    <div class="du-case-tabs" role="group" aria-label="选择教学候选片段"><button type="button" data-sh-candidate="0" aria-pressed="true">候选 A · 验证需求</button><button type="button" data-sh-candidate="1" aria-pressed="false">候选 B · 判断建议</button></div>
    <figure class="pf-figure"><figcaption><b>原片时间线 · 20 分钟</b><span>深色标记为选中的连续区间，不从不同时间随机拼句子。</span></figcaption><div class="sh-timeline" role="img" aria-label="原片选中区间" id="sh-timeline"><span id="sh-range"></span></div><div class="sh-axis"><span>00:00</span><span>10:00</span><span>20:00</span></div><p id="sh-range-label"></p></figure>
    <div class="sh-result" aria-live="polite"><article class="pf-example"><small>原片转录节选 / 教学文本</small><div id="sh-transcript"></div></article><article class="pf-example"><small>候选信息 / 人工示意</small><h3 id="sh-title"></h3><p id="sh-reason"></p><dl class="sh-metadata"><div><dt>原片区间</dt><dd id="sh-times"></dd></div><div><dt>成片长度</dt><dd id="sh-duration"></dd></div><div><dt>声音</dt><dd>保留原片音轨，无需 TTS</dd></div></dl></article></div>
    <p class="lesson-takeaway"><b>先听成文字，再读文字选段。</b>LLM 提议时间段，剪辑程序回到原片取出画面与声音。仍需回看前后语境，检查是否遗漏条件或切断句子。</p>
    ${source('shorts_generator/pipeline.py','核对整条处理流程')}<a class="text-link pf-next" href="#/tool/shorts/principles">继续理解：选择哪段，与画面裁哪里，是两件事 →</a></section>`;}
  function principles(){return `<section class="reading-section sh-lesson"><p class="section-kicker">THE KEY DIFFERENCE / 与上一工具的区别</p><h2>根据原片的讲话内容选段，而不是按新配音凑长度</h2>${recap()}
    <div class="pf-comparison pf-two"><article class="pf-example"><h3>Short Video Factory</h3><p>输入素材库＋文稿或写作要求，生成新配音，再用随机素材片段补足配音长度。</p><b>关键依据：配音总时长。</b></article><article class="pf-example"><h3>YouTube Shorts Generator</h3><p>输入已有长视频＋片段数量和画幅，识别原来的讲话，让模型选时间段。本地截取连续原内容并保留原声。</p><b>关键依据：带时间的转录内容。</b></article></div>
    <figure class="pf-figure"><figcaption><b>图 1 · 时间戳把文字接回视频</b><span>你提供原片，不必先写新文案、录新配音或挑好所有片段。</span></figcaption><ol class="pf-chain"><li>已有长视频<br><small>画面＋原来的声音</small></li><li>语音识别 ASR<br><small>文字＋起止秒数</small></li><li>LLM 阅读转录<br><small>候选区间＋理由</small></li><li>剪辑与改画幅<br><small>原片短段＋原声</small></li></ol></figure>
    <p>例如建议截取 130–185 秒，程序就回到原片截取这连续 55 秒。原片的 02:10 成为短片的 00:00。文字用于判断“选什么”，时间用于定位“从哪里切”。这与 TTS 把文字读成新声音是不同的方向。</p>
    ${source('shorts_generator/local/transcriber.py','核对转录输出')} ${source('shorts_generator/local/clipper.py','核对截取与原声保留')}
    <h3>模型到底看到了什么？</h3>
    <figure class="pf-figure"><figcaption><b>图 2 · 三种处理，三种信息</b><span>已核对主流程未将视频帧发送给选段 LLM。</span></figcaption><div class="vf-render-lanes"><div><b>听文字</b><p>Whisper 读取声音 → 输出什么时候说了什么。噪声、术语和多人重叠会影响转录。</p></div><div><b>读内容</b><p>LLM 读取带时间标记的文字 → 提议保留的区间、标题、开场句与理由。不会因此看懂无声动作。</p></div><div><b>找人脸</b><p>本地 OpenCV 检测人脸位置 → 选择最大的脸来调整裁切框。不判断这段话是否精彩。</p></div></div></figure>
    <p>本地使用已有 Haar 级联人脸检测器，不是项目新训练的视频理解模型，也没有在这条流程中将某张脸与当前发声的人绑定起来。</p>
    <h3>“精彩”是怎样选出来的？</h3>
    <div class="pf-longform"><div><b>先看样本</b><span>根据前一部分转录，估计内容类型与信息密度。</span></div><div><b>再提候选</b><span>提示侧重吸引人的开场、反常识观点、情绪、冲突、故事转折和可执行建议，要求输出结构化候选。</span></div><div><b>规则筛选</b><span>清理非法起止时间、把分数限制在 0–100，按分数去掉过度重叠的候选，再取前 N 个。</span></div></div>
    <p>提示倾向 45–90 秒，同时允许更短或更长的完整片段；这是模型指令，不是严格时长保证。分数与理由帮助人工筛选，不保证事实准确、观点完整或视频会火。</p>
    <details class="lesson-detail"><summary>重叠去重是“理解内容重复”吗？</summary><p>不是。若较低分候选与已保留片段重叠超过该候选自身时长的 50%，就剔除它。这不是语义去重，也不是两个区间总长度上的比例。不同时间重复同一观点仍可能留下。</p></details>
    ${source('shorts_generator/highlights.py','核对提示、候选校验与去重')}
    <h3>竖屏裁切又是怎样做的？</h3>
    <figure class="pf-figure"><figcaption><b>图 3 · 选时段以后，再决定保留画面的哪一部分</b><span>人工几何示意，不是真实检测结果。橙色框代表保留的 9:16 区域。</span></figcaption>
    <svg class="sh-crop" viewBox="0 0 640 360" role="img" aria-label="横屏原画面里有左侧演示板、小人脸和右侧大人脸。竖屏框跟随右侧大人脸，演示板被裁掉。"><rect width="640" height="360" rx="10" fill="#e8ede3"/><rect x="24" y="40" width="275" height="200" rx="8" fill="#fffdf7"/><text x="45" y="78" fill="#233f35" font-size="20">原片演示板</text><path d="M45 110H260M45 145H230M45 180H250" stroke="#a6b6a0" stroke-width="9"/><circle cx="330" cy="145" r="25" fill="#a6b6a0"/><path d="M290 280V220Q330 175 370 220V280" fill="#a6b6a0"/><circle cx="505" cy="110" r="43" fill="#466c59"/><path d="M435 320V220Q505 145 575 220V320" fill="#466c59"/><rect x="404" y="2" width="202.5" height="356" fill="none" stroke="#aa6348" stroke-width="4"/><text x="421" y="342" fill="#233f35" font-size="17">保留这部分画面</text></svg>
    <p>按目标比例计算裁切框，逐帧检测最大人脸，用 0.15 的平滑系数逐步靠近新中心以减少跳动。首次没有脸用画面中心；后来丢失检测则沿用上次中心，裁切框受画面边界限制。</p></figure>
    <p class="lesson-takeaway"><b>最大的人脸 ≠ 正在讲话的人 ≠ 最重要的信息。</b>多人可能跟错人，讲课可能裁掉幻灯片。没有找到脸，也不表示它会理解图表或产品位置。云端裁切交给服务，不能直接套用本地算法来解释。</p>
    ${source('shorts_generator/local/clipper.py','核对本地裁切')} ${source('shorts_generator/clipper.py','核对云端裁切请求')}
    <h3>本地模式要安装模型吗？</h3>
    <div class="pf-network"><div><b>local 模式</b><p>本机运行 faster-whisper，需要可用权重与依赖，可能首次下载模型。FFmpeg 与 OpenCV 负责本机媒体处理；选段仍调用 OpenAI 或 Gemini，发送转录内容。</p></div><div><b>默认 api 模式</b><p>通过 MuAPI 完成视频获取、Whisper 转录、LLM 调用与裁切。依赖网络服务；没有验证当前服务可用性与费用。</p></div></div>
    <p>本地 SRT 是转录缓存，当前本地渲染没有字幕烧录步骤。标题、开场句等输出元数据，也不表示这些文字已被画到视频上。</p>
    ${source('shorts_generator/local/llm.py','核对云端模型调用')} ${source('shorts_generator/pipeline.py','核对两条模式')}
    <details class="lesson-detail"><summary>长视频分块：设计目标与固定版本风险</summary><p>达到 30 分钟时启用分块，名义块长 20 分钟、步长 19 分钟，选入转录时还允许结束位置延伸。目的是减少单次文本长度并保留边界上下文，不等于保证长片不漏内容。</p><p>静态阅读发现：块内转录仍使用原片绝对时间，候选清洗却使用块时长，合并又添加块偏移。这可能导致后续块的候选被截断、丢弃或偏移。尚未运行验证，应先复核该版本的长片时间坐标。</p></details>
    <p class="disclosure">深入核对：2026-10-23；固定版本 3d11f2e。网页解释文档和已读代码，教学图不表示本机实测，也不声称覆盖最新版。</p></section>`;}
  function mount(){
    const root=document.getElementById('detail-content');if(!root?.querySelector('#sh-range'))return;
    function draw(index){const c=candidates[index];
      root.querySelector('#sh-range').style.cssText=`left:${c.start/1200*100}%;width:${(c.end-c.start)/1200*100}%`;
      root.querySelector('#sh-timeline').setAttribute('aria-label',`20 分钟原片，选中 ${clock(c.start)} 到 ${clock(c.end)}`);
      root.querySelector('#sh-range-label').textContent=`原片 ${clock(c.start)}–${clock(c.end)} → 一条 ${c.end-c.start} 秒短片（原声保留）`;
      root.querySelector('#sh-transcript').innerHTML=c.lines.map(([time,line])=>`<p class="sh-transcript-line"><b>${time}</b><span>${line}</span></p>`).join('');
      root.querySelector('#sh-title').textContent=c.title;root.querySelector('#sh-reason').textContent=c.reason;
      root.querySelector('#sh-times').textContent=`${clock(c.start)}–${clock(c.end)} / ${c.start}–${c.end} 秒`;
      root.querySelector('#sh-duration').textContent=`${c.end-c.start} 秒，从 00:00 开始播放`;
      root.querySelectorAll('[data-sh-candidate]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.shCandidate)===index)));
    }
    root.querySelectorAll('[data-sh-candidate]').forEach(el=>el.addEventListener('click',()=>draw(Number(el.dataset.shCandidate))));draw(0);
  }
  window.ShortsLearning={effects,principles,mount};
})();
