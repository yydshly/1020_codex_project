/* Authored teaching timeline; no model, media upload, playback or video rendering. */
(() => {
  'use strict';
  const base='https://github.com/YILS-LIN/short-video-factory/blob/bc32e3515b38df548ff0608f7325b7806e8cfa20/';
  const source=(path,label)=>`<a class="source-link" href="${base}${path}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
  const lines=['先看杯盖怎样打开。','再看清洗时怎样拆开。','最后看放进背包的样子。'];
  const shots=['打开杯盖','拆开清洗','放进背包'];
  function indexAt(time){return Math.min(2,Math.max(0,Math.floor(time/4)));}
  function effects(){return `<section class="reading-section vf-lesson"><p class="section-kicker">SEE THE EDIT / 观察三条时间轨道</p><h2>时长对齐，还不代表内容匹配</h2>
    <p>假设已有三段水杯素材和一段 12 秒配音。拖动时间，再切换两种安排，观察画面、台词与字幕是否在讲同一件事。</p>
    <p class="du-demo-label"><b>人工教学示意，不是应用实测。</b>画面用文字卡片代表，没有实际视频或声音。这里的三个 4 秒镜头与字幕均为固定示例，不复现上游随机算法；真实字幕也不必与镜头边界重合。</p>
    <div class="du-case-tabs" role="group" aria-label="选择镜头与文案的对应方式"><button type="button" data-vf-order="matched" aria-pressed="true">人工匹配对照</button><button type="button" data-vf-order="mixed" aria-pressed="false">可能错配的组合</button></div>
    <div class="vf-lab"><div class="vf-preview" role="img" aria-label="教学画面卡片"><small>画面占位 · 未生成视频</small><div class="vf-bottle" aria-hidden="true"><i></i></div><strong id="vf-shot">打开杯盖</strong><span id="vf-caption">${lines[0]}</span></div>
    <div class="vf-tracks"><label class="vf-time-label" for="vf-time">查看时间 <output id="vf-time-value" for="vf-time">0.0 / 12.0 秒</output></label><input id="vf-time" type="range" min="0" max="12" step="0.5" value="0" aria-describedby="vf-time-help"><p id="vf-time-help" class="disclosure">可用方向键调整；12 秒显示最后一帧。</p>
    <div class="vf-track"><b>画面</b><div id="vf-video-track" class="vf-cells"></div></div><div class="vf-track"><b>配音</b><div class="vf-audio">同一段 12 秒口播 · 从头到尾连续</div></div><div class="vf-track"><b>字幕</b><div class="vf-cells" id="vf-subtitle-track"></div></div><div class="vf-axis"><span>0 秒</span><span>4 秒</span><span>8 秒</span><span>12 秒</span></div>
    <p id="vf-verdict" class="lesson-takeaway" aria-live="polite"></p></div></div>
    <p>真实主路径先取得配音时长，再随机抽取素材片段补足时间；这张对照图中的“人工匹配”是理想检查目标，不是软件已有的自动语义匹配功能。</p>
    ${source('src/views/Home/components/VideoManage.vue','核对真实选片规则')} ${source('README.md','查看作者成片演示')}
    <a class="text-link pf-next" href="#/tool/video-factory/principles">继续看：哪些步骤用模型，哪些步骤按规则处理 →</a></section>`;}
  function principles(){return `<section class="reading-section vf-lesson"><p class="section-kicker">START HERE / 先弄清它到底在处理什么</p><h2>一个带 AI 写稿和配音功能的自动混剪工具</h2>
    <p>你给它视频素材和要表达的内容，它把写稿、配音、抽片、字幕与导出串起来。已核对主流程的核心价值是批量制作、减少重复操作；对画面的理解和剪辑判断，主要仍依赖你准备素材与检查成片。</p>
    <h3>输入是什么？完整视频也可以吗？</h3>
    <p><b>可以提供完整视频，也可以提供已经剪好的短片段。</b>这些视频文件都被当作可抽取画面的素材。还要分别准备口播文案，或提供产品信息和写作要求让模型生成文案；背景音乐可选，画幅、音色等由设置决定。</p>
    <div class="pf-longform"><div><b>画面输入</b><span>A：1 分钟杯子外观；B：2 分钟开盖与清洗；C：30 秒装进背包。这里是假设的三份视频文件。</span></div><div><b>文字输入</b><span>已经核对的口播文案，或产品资料＋写作要求。不是仅上传视频就自动看懂并写出介绍。</span></div><div><b>最终输出</b><span>一条新视频：抽取的画面＋新配音＋字幕＋可选音乐。已核对主路径不保留素材原声。</span></div></div>
    <h3>“根据 TTS 截取”到底是什么意思？</h3>
    <p><b>TTS 负责发声，程序取得配音总时长，选片规则决定截哪里，FFmpeg 执行截取与拼接。</b>例如配音实际长 20 秒，就需要准备覆盖这 20 秒的画面。TTS 本身不负责剪视频。</p>
    <figure class="pf-figure"><figcaption><b>教学例子 · 20 秒配音，配上 20 秒画面</b><span>以下截取位置与长度为人工举例，不是实际运行结果，也不是固定剪辑规则。</span></figcaption>
    <div class="vf-cut-example"><div><b>素材 A → 6 秒</b><span>截取原片 12–18 秒</span><small>成片时间 0–6 秒</small></div><div><b>素材 B → 9 秒</b><span>截取原片 30–39 秒</span><small>成片时间 6–15 秒</small></div><div><b>素材 C → 5 秒</b><span>截取原片 3–8 秒</span><small>成片时间 15–20 秒</small></div></div>
    <div class="vf-audio">配音轨：同一段完整 TTS 音频，从第 0 秒播放到第 20 秒。</div>
    <p class="disclosure">6＋9＋5＝20 秒。截取起点和长度来自随机选片规则，不是根据“这句话正在讲什么”选镜头。</p></figure>
    <div class="pf-network"><div><b>选片用：配音总时长</b><p>回答“需要多少秒画面”，让画面覆盖声音；不提供“清洗台词应该配哪个镜头”的判断。</p></div><div><b>字幕用：TTS 词语时间信息</b><p>回答“哪个词在什么时候说出”，据此组织字幕时间。字幕跟随配音，不代表画面也在语义上匹配。</p></div></div>
    ${source('src/views/Home/index.vue','核对先配音、后选片的顺序')} ${source('src/views/Home/components/VideoManage.vue','核对按时长选片')} ${source('electron/lib/edge-tts.ts','核对字幕时间来源')}
    <h3>需要先让人或 AI 识别视频吗？</h3>
    <p>运行这条流程不要求先给每段视频做内容识别或语义标注。提供可读素材，就可以按规则抽片拼接。<b>提前筛选素材是为了质量，不是随机剪辑的技术前提。</b></p>
    <div class="pf-longform"><div><b>人负责</b><span>选好同一主题、可互换的素材，核对文案，并检查成片是否合适。</span></div><div><b>现成模型负责</b><span>LLM 根据文字资料写口播，TTS 将文稿读成声音。主流程没有把视频交给视觉模型挑选相关镜头。</span></div><div><b>程序负责</b><span>抽片、拼接、适配尺寸、绘制字幕、混合声音与导出，并重复执行这些步骤。</span></div></div>
    <p>如果要求“讲杯盖就切杯盖，讲清洗就切清洗”，需要额外的人工安排，或增加视频理解与镜头匹配模块；当前核对的主路径没有这一环节。</p>
    <details class="lesson-detail"><summary>只放入一段 10 分钟视频，会自动找到最精彩的 30 秒吗？</summary><p>这段视频可以作为素材来源，但当前选片逻辑不分析故事、高潮或精彩程度。它主要随机抽取片段来覆盖配音时长，不能因此当成自动提炼视频重点的工具。</p></details>
    <p class="lesson-takeaway"><b>核心价值：批量自动混剪＋制作流程自动化。</b>同主题素材越充足，随机组合越可能可用；素材越杂，错配风险越高。评价时应看可用成片比例、人工返工时间与实际节省的工时，而不只是生成数量。</p>
    <a class="text-link pf-next" href="#/tool/video-factory">动手对照：同样长的画面，为什么仍可能与台词错配 →</a>
    </section><section class="reading-section vf-lesson"><p class="section-kicker">MODEL + MEDIA / 模型与媒体处理的分工</p><h2>从“写稿和发声”，增加画面、字幕与编码</h2>
    <p>接着 Podcastfy 理解：短视频工厂同样可以用现成模型写稿、配音，但最终还要把多个信号放在一条时间线上。它的主要价值是组织制作步骤，主路径不训练新模型，也不从提示词生成所有镜头。</p>
    <figure class="pf-figure"><figcaption><b>图 1 · 两类模型，加上三类工程处理</b><span>绿色是模型推理，浅色是规则和媒体处理；素材库由使用者准备。</span></figcaption>
    <div class="vf-responsibilities"><article class="vf-model"><small>LLM</small><b>写口播文案</b><p>决定说什么、如何表达。</p></article><article class="vf-model"><small>TTS</small><b>生成语音</b><p>决定音色、发音与韵律。</p></article><article><small>选片规则</small><b>抽文件与时间段</b><p>随机组合，补足配音长度。</p></article><article><small>字幕渲染器</small><b>文字变成像素</b><p>在指定时间排版、绘制。</p></article><article><small>FFmpeg</small><b>合成与编码</b><p>裁取、补边、拼接和混音。</p></article></div></figure>
    ${source('src/views/Home/index.vue','查看主任务顺序')}
    <h3>为什么先配音，再决定视频长度？</h3><div class="pf-longform"><div><b>先确定</b><span>文稿与声音设置 → 合成音频 → 取得实际时长</span></div><div><b>再覆盖</b><span>随机选片段 → 累计画面时长 → 覆盖音频</span></div><div><b>最后输出</b><span>字幕按时间显示 → 配音与 BGM 混合 → 按目标时长导出</span></div></div>
    <p>所以改稿或语速可能改变后续全部时间安排。提示词说“做 30 秒视频”也不能取代对实际音频时长的测量。</p>
    <details class="lesson-detail"><summary>展开当前选片算法的具体规则</summary><p>随机取文件，从可用范围随机取起点；一般抽取 2–15 秒，受素材长度和剩余目标时长限制，短片或最后一段可小于 2 秒。用完候选仍不够长就再来一轮，坏文件跳过，全部不可用时失败。</p><p>getVideoSegments 接收的核心参数是 duration，没有接收文案或图像语义向量。因此不能把随机选片称为“模型看懂文案后选出对应镜头”。</p></details>
    ${source('src/views/Home/components/VideoManage.vue','getVideoSegments 实现')}
    <h3>字幕不是只有一份文字文件</h3>
    <figure class="pf-figure"><figcaption><b>图 2 · 字幕从时间信息变成视频像素</b><span>当前主路径；不是先配音再做语音识别。</span></figcaption><ol class="pf-chain"><li>TTS 词边界<br><small>词语、偏移、持续时间</small></li><li>SRT 时间文本<br><small>什么时候显示哪句话</small></li><li>透明 PNG 帧<br><small>字体、换行、位置</small></li><li>FFmpeg 叠加<br><small>烧录进视频画面</small></li></ol></figure>
    <p>Edge TTS 的边界数据换算成毫秒后组织字幕；字幕渲染器按当前时间取出文本，在隐藏渲染窗口中逐帧输出透明图像。FFmpeg 将字幕层叠在视频上。可选 SRT 导出保留时间文本，与烧录字幕是不同产物。</p>
    <p class="disclosure">这也意味着字幕有自己的布局与临时磁盘成本。例如 12 秒、30 fps 的逐帧序列是 360 帧；这是数量计算，不是资源占用实测。代码还保留没有字幕资产时的 FFmpeg 字幕滤镜路径。</p>
    ${source('electron/lib/edge-tts.ts','TTS 边界到 SRT')} ${source('electron/effect-engine/subtitle-render-service.ts','字幕帧导出')}
    <h3>渲染为什么不是又让一个 AI 生成视频？</h3>
    <figure class="pf-figure"><figcaption><b>图 3 · 对已有画面与声音执行确定的操作</b><span>这里展示的是已检查的 FFmpeg 主路径。</span></figcaption><div class="vf-render-lanes"><div><b>画面</b><p>裁取时间段 → 时间从零计 → 等比缩放＋补边 → 统一帧率 → 拼接 → 叠字幕</p></div><div><b>声音</b><p>配音与可选 BGM → 分别调整响度 → 按目标时长处理 → 混合</p></div><div><b>导出</b><p>画面用 H.264 编码，声音用 AAC 编码 → 写入输出文件</p></div></div></figure>
    <p>当前路径以 scale＋pad 适配画幅，横屏转竖屏可能留边；不等于自动追踪人物裁切。拼接设置只取素材视频流，最终声音使用配音和 BGM，不保留素材原声。响度归一化与 amix 相加也不等于根据人声自动压低音乐的智能闪避。</p>
    ${source('electron/ffmpeg/index.ts','核对滤镜与编码参数')}
    <div class="lesson-takeaway"><b>模型能力只负责部分质量。</b>文案可信、声音自然、素材相关、字幕清晰、时间一致、编码成功，需要分别满足。更强的文案模型不会自动补齐缺失镜头或修复所有剪辑问题。</div>
    <h3>哪些步骤在本机，哪些可能联网？</h3><div class="pf-network"><div><b>文案模型</b><p>按所配置端点调用，支持多种兼容协议；是否本地取决于端点，不取决于桌面窗口在哪里。</p></div><div><b>Edge TTS</b><p>访问网络语音服务；没有用户 API 密钥也不表示离线。</p></div><div><b>媒体处理</b><p>选片、字幕绘制与 FFmpeg 在本机执行，依赖可读素材、字体、内存、磁盘和编码器。</p></div><div><b>批量任务</b><p>把流程重复执行，仍应记录每条失败原因及人工返工；不能用产量代替可用率。</p></div></div>
    <p class="disclosure">深入核对日期：2026-10-23。沿用此前固定 commit，不声称是今天的最新版本；未安装上游应用或渲染实测。</p></section>`;}
  function mount(){
    const root=document.getElementById('detail-content'), slider=root?.querySelector('#vf-time');if(!slider)return;
    let order='matched';
    function draw(){
      const time=Number(slider.value), active=indexAt(time), sequence=order==='matched'?[0,1,2]:[2,0,1];
      root.querySelector('#vf-time-value').textContent=`${time.toFixed(1)} / 12.0 秒`;
      root.querySelector('#vf-shot').textContent=shots[sequence[active]];
      root.querySelector('#vf-caption').textContent=lines[active];
      root.querySelector('#vf-video-track').innerHTML=sequence.map((s,i)=>`<span class="${i===active?'is-active':''}">${shots[s]}</span>`).join('');
      root.querySelector('#vf-subtitle-track').innerHTML=shots.map((s,i)=>`<span class="${i===active?'is-active':''}">${i*4}–${(i+1)*4} 秒<br>${s}</span>`).join('');
      root.querySelector('#vf-verdict').textContent=order==='matched'?'此处画面与台词对应。它演示人工检查目标，不表示软件自动做到了这种匹配。':'时间都覆盖了，但画面与台词错配。时长凑齐只解决同步的一部分，不能代替内容理解。';
      root.querySelectorAll('[data-vf-order]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.vfOrder===order)));
    }
    slider.addEventListener('input',draw);
    root.querySelectorAll('[data-vf-order]').forEach(el=>el.addEventListener('click',()=>{order=el.dataset.vfOrder;draw();}));draw();
  }
  window.VideoFactoryLearning={effects,principles,mount};
})();
